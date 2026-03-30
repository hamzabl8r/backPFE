// server.js - Version corrigée
const express = require('express')
const dotenv = require('dotenv').config()
const connectDB = require('./connect')
const cors = require('cors')
require('./middleware/passport-setup'); 
const session = require('express-session');
const passport = require('passport');
const path = require('path'); 
const messageRoutes = require('./routes/message');
const http = require('http');
const socketIo = require('socket.io');

const app = express()
const PORT = process.env.PORT || 5000

const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "http://localhost:3000",
        methods: ["GET", "POST"],
        credentials: true
    },
    transports: ['websocket', 'polling']
});

app.use(cors())
connectDB()
app.use(express.json()) 

app.get('/', (req, res) => {
    res.send('Server is running!')
})

app.use(session({ secret: 'ton_secret_key', resave: false, saveUninitialized: true }));
app.use(passport.initialize());
app.use(passport.session());

app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
app.get('/auth/google/callback', 
  passport.authenticate('google', { failureRedirect: '/login' }),
  (req, res) => {
    res.redirect('http://localhost:3000/profil'); 
  }
);

const Register = require('./routes/user')
app.use('/user', Register) 
app.use('/uploads/profile_pics', express.static(path.join(__dirname, 'uploads/profile_pics')));
app.use('/api/messages', messageRoutes);

// Stockage des utilisateurs connectés
const userSockets = new Map();

io.on('connection', (socket) => {
    console.log('🔌 New client connected:', socket.id);
    
    // Enregistrer l'utilisateur
    socket.on('register', (userId) => {
        if (!userId) return;
        
        // Supprimer l'ancienne connexion si elle existe
        const oldSocketId = userSockets.get(userId);
        if (oldSocketId && oldSocketId !== socket.id) {
            console.log(`⚠️ User ${userId} reconnected, removing old socket ${oldSocketId}`);
        }
        
        userSockets.set(userId, socket.id);
        console.log(`✅ User ${userId} registered with socket ${socket.id}`);
        console.log(`📊 Connected users:`, Array.from(userSockets.keys()));
        
        // Confirmer l'enregistrement
        socket.emit('registered', { userId, socketId: socket.id });
    });
    
    // Gestion des messages chat
    socket.on('send_message', async (data) => {
        try {
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
            
            const receiverSocketId = userSockets.get(data.receiverId);
            if (receiverSocketId) {
                io.to(receiverSocketId).emit('new_message', populatedMessage);
                console.log(`📨 Message sent to ${data.receiverId}`);
            }
            
            socket.emit('message_sent', populatedMessage);
            
        } catch (error) {
            console.error('Error saving message:', error);
        }
    });
    
    // === GESTION DES APPELS VIDÉO ===
    
    // Initier un appel
    socket.on('call_user', (data) => {
        const { fromUserId, toUserId, signal, callerInfo } = data;
        const targetSocketId = userSockets.get(toUserId);
        
        console.log('========================================');
        console.log('📞 CALL INITIATED');
        console.log(`From: ${fromUserId}`);
        console.log(`To: ${toUserId}`);
        console.log(`Target socket: ${targetSocketId}`);
        console.log(`Connected users:`, Array.from(userSockets.keys()));
        console.log('========================================');
        
        if (targetSocketId) {
            io.to(targetSocketId).emit('incoming_call', {
                fromUserId,
                signal,
                callerInfo
            });
            console.log(`✅ Incoming call sent to ${toUserId}`);
            socket.emit('call_initiated', { status: 'calling' });
        } else {
            console.log(`❌ User ${toUserId} is not connected`);
            socket.emit('call_error', { error: 'User is not connected' });
        }
    });
    
    // Accepter un appel
    socket.on('accept_call', (data) => {
        const { fromUserId, toUserId, signal } = data;
        const targetSocketId = userSockets.get(fromUserId);
        
        console.log('========================================');
        console.log('📞 CALL ACCEPTED');
        console.log(`From: ${toUserId}`);
        console.log(`To: ${fromUserId}`);
        console.log(`Target socket: ${targetSocketId}`);
        console.log('========================================');
        
        if (targetSocketId) {
            io.to(targetSocketId).emit('call_accepted', {
                toUserId,
                signal
            });
            console.log(`✅ Call accepted sent to ${fromUserId}`);
        }
    });
    
    // Rejeter un appel
    socket.on('reject_call', (data) => {
        const { fromUserId, toUserId } = data;
        const targetSocketId = userSockets.get(fromUserId);
        
        console.log(`📞 CALL REJECTED from ${toUserId} to ${fromUserId}`);
        
        if (targetSocketId) {
            io.to(targetSocketId).emit('call_rejected', {
                toUserId
            });
        }
    });
    
    // Terminer un appel
    socket.on('end_call', (data) => {
        const { fromUserId, toUserId } = data;
        const targetSocketId = userSockets.get(toUserId);
        
        console.log(`📞 CALL ENDED between ${fromUserId} and ${toUserId}`);
        
        if (targetSocketId) {
            io.to(targetSocketId).emit('call_ended', {
                fromUserId
            });
        }
    });
    
    // Déconnexion
    socket.on('disconnect', () => {
        console.log('🔌 Client disconnected:', socket.id);
        
        // Trouver et supprimer l'utilisateur déconnecté
        let disconnectedUserId = null;
        for (let [userId, socketId] of userSockets.entries()) {
            if (socketId === socket.id) {
                disconnectedUserId = userId;
                userSockets.delete(userId);
                break;
            }
        }
        
        if (disconnectedUserId) {
            console.log(`❌ User ${disconnectedUserId} disconnected`);
        }
        console.log(`📊 Remaining users:`, Array.from(userSockets.keys()));
    });
});

server.listen(PORT, () => { 
    console.log(`🚀 Server is running on port ${PORT}`)
    console.log(`🔌 Socket.IO is ready for video calls`)
})