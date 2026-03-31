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

// 1. Port configuration (Railway ya3ti port wa7dou)
const PORT = process.env.PORT || 5000;

// 2. Middlewares de base
app.use(cors({
    origin: [
    'http://localhost:3000', 
    'https://sign-translator-ih5s.vercel.app' // Zid lien el-vercel mta3ek hna
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

// 6. Routes API
app.get('/', (req, res) => {
    res.send('Server is running on Railway!');
});

// Auth Google
app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

app.get('/auth/google/callback', 
  passport.authenticate('google', { failureRedirect: '/login' }),
  (req, res) => {
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
    res.redirect(`${frontendUrl}/profil`); 
  }
);

// Users & Messages
const Register = require('./routes/user');
app.use('/user', Register); 
app.use('/api/messages', messageRoutes);

// Static files (⚠️ Radd balek Railway yfassakhhom ki ta3mel restart)
app.use('/uploads/profile_pics', express.static(path.join(__dirname, 'uploads/profile_pics')));

// 7. Socket.io Logic
const userSockets = new Map();

io.on('connection', (socket) => {
    console.log('🔌 New client connected:', socket.id);
    
    socket.on('register', (userId) => {
        if (!userId) return;
        userSockets.set(userId, socket.id);
        console.log(`✅ User ${userId} registered`);
        socket.emit('registered', { userId, socketId: socket.id });
    });
    
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
            }
            socket.emit('message_sent', populatedMessage);
            
        } catch (error) {
            console.error('Error saving message:', error);
        }
    });

    // Video Call Handlers
    socket.on('call_user', (data) => {
        const targetSocketId = userSockets.get(data.toUserId);
        if (targetSocketId) {
            io.to(targetSocketId).emit('incoming_call', {
                fromUserId: data.fromUserId,
                signal: data.signal,
                callerInfo: data.callerInfo
            });
        }
    });

    socket.on('accept_call', (data) => {
        const targetSocketId = userSockets.get(data.fromUserId);
        if (targetSocketId) {
            io.to(targetSocketId).emit('call_accepted', {
                toUserId: data.toUserId,
                signal: data.signal
            });
        }
    });

    socket.on('disconnect', () => {
        for (let [userId, socketId] of userSockets.entries()) {
            if (socketId === socket.id) {
                userSockets.delete(userId);
                break;
            }
        }
    });
});

// 8. Listen on 0.0.0.0 (Obligatoire pour Railway)
server.listen(PORT, '0.0.0.0', () => { 
    console.log(`🚀 Server is running on port ${PORT}`);
    console.log(`🔌 Socket.IO & Video calls are ready`);
});
