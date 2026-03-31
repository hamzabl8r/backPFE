const express = require('express');
const dotenv = require('dotenv').config();
const connectDB = require('./connect');
const cors = require('cors');
require('./middleware/passport-setup'); 
const session = require('express-session');
const passport = require('passport');
const path = require('path'); 
const messageRoutes = require('./routes/message');
const http = require('http');
const socketIo = require('socket.io');

const app = express();

// 1. Port configuration
const PORT = process.env.PORT || 5000;

// 2. Middlewares de base
app.use(cors({
    origin: [
        'http://localhost:3000', 
        'https://sign-translator-ih5s.vercel.app'
    ],
    credentials: true
}));
app.use(express.json());

// 3. Connect to Database
connectDB();

// 4. Session & Passport configuration
app.use(session({ 
    secret: process.env.SESSION_SECRET || 'ton_secret_key', 
    resave: false, 
    saveUninitialized: true 
}));
app.use(passport.initialize());
app.use(passport.session());

// 5. Create HTTP Server for Socket.io
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: [
            'http://localhost:3000', 
            'https://sign-translator-ih5s.vercel.app'
        ],
        methods: ["GET", "POST"],
        credentials: true
    },
    transports: ['websocket', 'polling']
});

// 6. Routes API (inchangé)
app.get('/', (req, res) => {
    res.send('Server is running on Railway!');
});

app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

app.get('/auth/google/callback', 
    passport.authenticate('google', { failureRedirect: '/login' }),
    (req, res) => {
        const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
        res.redirect(`${frontendUrl}/profil`); 
    }
);

const Register = require('./routes/user');
app.use('/user', Register); 
app.use('/api/messages', messageRoutes);
app.use('/uploads/profile_pics', express.static(path.join(__dirname, 'uploads/profile_pics')));

// 7. Socket.io Logic - VERSION CORRIGÉE
const userSockets = new Map(); // userId -> { socketId, socket }

io.on('connection', (socket) => {
    console.log('🔌 New client connected:', socket.id);
    
    // Enregistrer l'utilisateur
    socket.on('register', (userId) => {
        if (!userId) {
            console.log('⚠️ Register event received without userId');
            return;
        }
        
        console.log(`✅ Registering user ${userId} with socket ${socket.id}`);
        
        // Stocker l'utilisateur avec son socket ID
        userSockets.set(userId, {
            socketId: socket.id,
            socket: socket
        });
        
        // Stocker l'userId sur le socket pour la déconnexion
        socket.userId = userId;
        
        // Confirmer l'enregistrement
        socket.emit('registered', { 
            userId, 
            socketId: socket.id,
            message: 'User registered successfully'
        });
        
        console.log(`📊 Total connected users: ${userSockets.size}`);
        
        // Optionnel: envoyer la liste des utilisateurs connectés
        const connectedUsers = Array.from(userSockets.keys());
        socket.emit('users_online', connectedUsers);
    });
    
    // Gestion des messages chat (inchangé)
    socket.on('send_message', async (data) => {
        try {
            console.log(`📨 Message from ${data.senderId} to ${data.receiverId}: ${data.text}`);
            
            const Message = require('./models/Message');
            const Conversation = require('./models/Conversation');
            
            let conversation = await Conversation.findOne({
                participants: { $all: [data.senderId, data.receiverId] }
            });
            
            if (!conversation) {
                conversation = new Conversation({
                    participants: [data.senderId, data.receiverId],
                    unreadCount: new Map(),
                    lastMessageTime: new Date()
                });
                await conversation.save();
            }
            
            const message = new Message({
                conversationId: conversation._id,
                sender: data.senderId,
                receiver: data.receiverId,
                text: data.text
            });
            await message.save();
            
            const populatedMessage = await Message.findById(message._id)
                .populate('sender', 'firstName lastName profilePic')
                .populate('receiver', 'firstName lastName profilePic');
            
            conversation.lastMessage = data.text;
            conversation.lastMessageTime = new Date();
            const currentUnread = conversation.unreadCount.get(data.receiverId) || 0;
            conversation.unreadCount.set(data.receiverId, currentUnread + 1);
            await conversation.save();
            
            // Envoyer au destinataire
            const receiver = userSockets.get(data.receiverId);
            if (receiver && receiver.socket) {
                console.log(`📤 Sending message to ${data.receiverId} via socket ${receiver.socketId}`);
                receiver.socket.emit('new_message', populatedMessage);
            } else {
                console.log(`⚠️ Receiver ${data.receiverId} not connected`);
            }
            
            // Confirmer à l'expéditeur
            socket.emit('message_sent', populatedMessage);
            
        } catch (error) {
            console.error('Error saving message:', error);
            socket.emit('message_error', { error: error.message });
        }
    });
    
    // ========== VIDEO CALL HANDLERS CORRIGÉS ==========
    
    // 1. Initier un appel
    socket.on('call_user', (data) => {
        const { fromUserId, toUserId, signal, callerInfo } = data;
        console.log(`📞 CALL_USER: From ${fromUserId} to ${toUserId}`);
        console.log(`   Caller info: ${callerInfo?.name}`);
        
        const targetUser = userSockets.get(toUserId);
        
        if (targetUser && targetUser.socket) {
            console.log(`✅ Forwarding call to ${toUserId} (socket: ${targetUser.socketId})`);
            
            targetUser.socket.emit('incoming_call', {
                fromUserId,
                signal,
                callerInfo: {
                    name: callerInfo?.name || 'Unknown',
                    profilePic: callerInfo?.profilePic
                },
                callId: Date.now()
            });
            
            console.log(`📞 Incoming call event sent to ${toUserId}`);
        } else {
            console.log(`❌ User ${toUserId} not connected or no socket found`);
            console.log(`   Connected users: ${Array.from(userSockets.keys()).join(', ')}`);
            
            socket.emit('call_error', {
                error: 'User is not online',
                toUserId
            });
        }
    });
    
    // 2. Accepter un appel
    socket.on('accept_call', (data) => {
        const { fromUserId, toUserId, signal } = data;
        console.log(`✅ ACCEPT_CALL: From ${toUserId} to ${fromUserId}`);
        
        const callerUser = userSockets.get(fromUserId);
        
        if (callerUser && callerUser.socket) {
            console.log(`✅ Forwarding acceptance to ${fromUserId}`);
            
            callerUser.socket.emit('call_accepted', {
                toUserId,
                signal,
                fromUserId: toUserId
            });
        } else {
            console.log(`❌ Caller ${fromUserId} not found`);
            socket.emit('call_error', {
                error: 'Caller is no longer online'
            });
        }
    });
    
    // 3. Rejeter un appel
    socket.on('reject_call', (data) => {
        const { fromUserId, toUserId } = data;
        console.log(`❌ REJECT_CALL: From ${toUserId} to ${fromUserId}`);
        
        const callerUser = userSockets.get(fromUserId);
        
        if (callerUser && callerUser.socket) {
            callerUser.socket.emit('call_rejected', {
                fromUserId: toUserId,
                reason: 'User rejected the call'
            });
        }
    });
    
    // 4. Terminer un appel
    socket.on('end_call', (data) => {
        const { fromUserId, toUserId } = data;
        console.log(`🔚 END_CALL: Between ${fromUserId} and ${toUserId}`);
        
        const targetUser = userSockets.get(toUserId);
        
        if (targetUser && targetUser.socket) {
            targetUser.socket.emit('call_ended', {
                fromUserId,
                reason: 'Call ended by user'
            });
        }
    });
    
    // 5. Marquer les messages comme lus
    socket.on('mark_read', async (data) => {
        const { conversationId, userId } = data;
        console.log(`📖 Marking messages as read in conversation ${conversationId} for user ${userId}`);
        
        try {
            const Conversation = require('./models/Conversation');
            const conversation = await Conversation.findById(conversationId);
            
            if (conversation) {
                conversation.unreadCount.set(userId, 0);
                await conversation.save();
                
                // Notifier l'autre participant que les messages ont été lus
                const otherParticipant = conversation.participants.find(p => p.toString() !== userId);
                if (otherParticipant) {
                    const otherUser = userSockets.get(otherParticipant.toString());
                    if (otherUser && otherUser.socket) {
                        otherUser.socket.emit('messages_read', {
                            conversationId,
                            userId
                        });
                    }
                }
            }
        } catch (error) {
            console.error('Error marking messages as read:', error);
        }
    });
    
    // 6. Déconnexion
    socket.on('disconnect', () => {
        if (socket.userId) {
            console.log(`🔌 User ${socket.userId} disconnected (socket: ${socket.id})`);
            userSockets.delete(socket.userId);
            console.log(`📊 Remaining connected users: ${userSockets.size}`);
            
            // Notifier les autres que l'utilisateur est déconnecté
            io.emit('user_offline', { userId: socket.userId });
        } else {
            console.log(`🔌 Socket disconnected without userId: ${socket.id}`);
        }
    });
});

// 8. Listen on 0.0.0.0 (Obligatoire pour Railway)
server.listen(PORT, '0.0.0.0', () => { 
    console.log(`🚀 Server is running on port ${PORT}`);
    console.log(`🔌 Socket.IO & Video calls are ready`);
    console.log(`📡 WebSocket server listening on ws://0.0.0.0:${PORT}`);
});