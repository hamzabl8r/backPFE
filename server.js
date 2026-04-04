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

const PORT = process.env.PORT || 5000;

app.use(cors({
    origin: [
        'http://localhost:3000', 
        'https://sign-translator-ih5s.vercel.app'
    ],
    credentials: true
}));
app.use(express.json());

connectDB();

app.use(session({ 
    secret: process.env.SESSION_SECRET || 'ton_secret_key', 
    resave: false, 
    saveUninitialized: true 
}));
app.use(passport.initialize());
app.use(passport.session());

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

app.get('/', (req, res) => {
    res.send('Server is running on Railway!');
});

// ✅ DEBUG ENDPOINT: check who is online (remove in production)
app.get('/debug/online-users', (req, res) => {
    const users = Array.from(userSockets.entries()).map(([userId, data]) => ({
        userId,
        socketId: data.socketId,
        connected: data.socket?.connected
    }));
    res.json({ count: users.length, users });
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

// ✅ FIX: Use string keys consistently
const userSockets = new Map(); // userId (string) -> { socketId, socket }

io.on('connection', (socket) => {
    console.log('🔌 New client connected:', socket.id);
    
    socket.on('register', (userId) => {
        if (!userId) {
            console.log('⚠️ Register event received without userId');
            return;
        }

        // ✅ FIX: Always convert to string to avoid ObjectId vs string mismatch
        const userIdStr = userId.toString();
        
        console.log(`✅ Registering user ${userIdStr} with socket ${socket.id}`);
        
        // ✅ FIX: If user was already registered (reconnect), clean up old entry
        if (userSockets.has(userIdStr)) {
            const oldEntry = userSockets.get(userIdStr);
            console.log(`♻️ User ${userIdStr} reconnecting, replacing old socket ${oldEntry.socketId}`);
        }
        
        userSockets.set(userIdStr, {
            socketId: socket.id,
            socket: socket
        });
        
        socket.userId = userIdStr;
        
        socket.emit('registered', { 
            userId: userIdStr, 
            socketId: socket.id,
            message: 'User registered successfully'
        });
        
        const connectedUsers = Array.from(userSockets.keys());
        console.log(`📊 Total connected users: ${userSockets.size} → [${connectedUsers.join(', ')}]`);
        
        socket.emit('users_online', connectedUsers);
        
        // ✅ FIX: Notify others that this user is now online
        socket.broadcast.emit('user_online', { userId: userIdStr });
    });
    
    socket.on('send_message', async (data) => {
        try {
            const senderIdStr = data.senderId?.toString();
            const receiverIdStr = data.receiverId?.toString();
            
            console.log(`📨 Message from ${senderIdStr} to ${receiverIdStr}: ${data.text}`);
            
            const Message = require('./models/Message');
            const Conversation = require('./models/Conversation');
            
            let conversation = await Conversation.findOne({
                participants: { $all: [senderIdStr, receiverIdStr] }
            });
            
            if (!conversation) {
                conversation = new Conversation({
                    participants: [senderIdStr, receiverIdStr],
                    unreadCount: new Map(),
                    lastMessageTime: new Date()
                });
                await conversation.save();
            }
            
            const message = new Message({
                conversationId: conversation._id,
                sender: senderIdStr,
                receiver: receiverIdStr,
                text: data.text
            });
            await message.save();
            
            const populatedMessage = await Message.findById(message._id)
                .populate('sender', 'firstName lastName profilePic')
                .populate('receiver', 'firstName lastName profilePic');
            
            conversation.lastMessage = data.text;
            conversation.lastMessageTime = new Date();
            const currentUnread = conversation.unreadCount.get(receiverIdStr) || 0;
            conversation.unreadCount.set(receiverIdStr, currentUnread + 1);
            await conversation.save();
            
            // ✅ FIX: Use string key
            const receiver = userSockets.get(receiverIdStr);
            if (receiver && receiver.socket) {
                console.log(`📤 Sending message to ${receiverIdStr} via socket ${receiver.socketId}`);
                receiver.socket.emit('new_message', populatedMessage);
            } else {
                console.log(`⚠️ Receiver ${receiverIdStr} not connected`);
                console.log(`   Online users: [${Array.from(userSockets.keys()).join(', ')}]`);
            }
            
            socket.emit('message_sent', populatedMessage);
            
        } catch (error) {
            console.error('Error saving message:', error);
            socket.emit('message_error', { error: error.message });
        }
    });
    
    // ========== VIDEO CALL HANDLERS ==========
    
    socket.on('call_user', (data) => {
        const fromUserId = data.fromUserId?.toString();
        const toUserId = data.toUserId?.toString();
        const { signal, callerInfo } = data;
        
        console.log(`📞 CALL_USER: From ${fromUserId} to ${toUserId}`);
        console.log(`   Connected users: [${Array.from(userSockets.keys()).join(', ')}]`);
        
        const targetUser = userSockets.get(toUserId);
        
        if (targetUser && targetUser.socket && targetUser.socket.connected) {
            console.log(`✅ Forwarding call to ${toUserId} (socket: ${targetUser.socketId})`);
            
            targetUser.socket.emit('incoming_call', {
                fromUserId,
                signal,
                callerInfo: {
                    name: callerInfo?.name || 'Unknown',
                    profilePic: callerInfo?.profilePic || null
                },
                callId: Date.now()
            });
            
            console.log(`📞 incoming_call event sent to ${toUserId}`);
        } else {
            // ✅ FIX: Better error logging
            if (!targetUser) {
                console.log(`❌ User ${toUserId} not found in userSockets map`);
            } else if (!targetUser.socket) {
                console.log(`❌ User ${toUserId} has no socket object`);
            } else if (!targetUser.socket.connected) {
                console.log(`❌ User ${toUserId} socket is disconnected`);
                // Clean up stale entry
                userSockets.delete(toUserId);
            }
            
            socket.emit('call_error', {
                error: 'User is not online',
                toUserId
            });
        }
    });
    
    socket.on('accept_call', (data) => {
        const fromUserId = data.fromUserId?.toString();
        const toUserId = data.toUserId?.toString();
        const { signal } = data;
        
        console.log(`✅ ACCEPT_CALL: ${toUserId} accepting call from ${fromUserId}`);
        
        const callerUser = userSockets.get(fromUserId);
        
        if (callerUser && callerUser.socket) {
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
    
    socket.on('reject_call', (data) => {
        const fromUserId = data.fromUserId?.toString();
        const toUserId = data.toUserId?.toString();
        
        console.log(`❌ REJECT_CALL: ${toUserId} rejected call from ${fromUserId}`);
        
        const callerUser = userSockets.get(fromUserId);
        if (callerUser && callerUser.socket) {
            callerUser.socket.emit('call_rejected', {
                fromUserId: toUserId,
                reason: 'User rejected the call'
            });
        }
    });
    
    socket.on('end_call', (data) => {
        const fromUserId = data.fromUserId?.toString();
        const toUserId = data.toUserId?.toString();
        
        console.log(`🔚 END_CALL: ${fromUserId} ended call with ${toUserId}`);
        
        const targetUser = userSockets.get(toUserId);
        if (targetUser && targetUser.socket) {
            targetUser.socket.emit('call_ended', {
                fromUserId,
                reason: 'Call ended by user'
            });
        }
    });
    
    socket.on('mark_read', async (data) => {
        const conversationId = data.conversationId;
        const userId = data.userId?.toString();
        
        console.log(`📖 Marking messages as read in conversation ${conversationId} for user ${userId}`);
        
        try {
            const Conversation = require('./models/Conversation');
            const conversation = await Conversation.findById(conversationId);
            
            if (conversation) {
                conversation.unreadCount.set(userId, 0);
                await conversation.save();
                
                const otherParticipant = conversation.participants.find(
                    p => p.toString() !== userId
                );
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
    
    socket.on('disconnect', () => {
        if (socket.userId) {
            console.log(`🔌 User ${socket.userId} disconnected (socket: ${socket.id})`);
            
            // ✅ FIX: Only delete if this socket is still the current one for this user
            // (avoid deleting if user reconnected with a new socket)
            const current = userSockets.get(socket.userId);
            if (current && current.socketId === socket.id) {
                userSockets.delete(socket.userId);
                io.emit('user_offline', { userId: socket.userId });
            }
            
            console.log(`📊 Remaining connected users: ${userSockets.size}`);
        } else {
            console.log(`🔌 Socket disconnected without userId: ${socket.id}`);
        }
    });
});

server.listen(PORT, '0.0.0.0', () => { 
    console.log(`🚀 Server is running on port ${PORT}`);
    console.log(`🔌 Socket.IO & Video calls are ready`);
});
