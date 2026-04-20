// server.js
const express = require('express');
const dotenv = require('dotenv');
const path = require('path');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const session = require('express-session');
const passport = require('passport');

// ======================
// LOAD .env FIRST
// ======================
dotenv.config({
    path: path.resolve(__dirname, '.env')
});

console.log("✅ .env loaded successfully");
console.log("GOOGLE_CLIENT_ID:", process.env.GOOGLE_CLIENT_ID ? "✅ OK" : "❌ MISSING");
console.log("SENDER_EMAIL:", process.env.SENDER_EMAIL ? "✅ OK" : "❌ MISSING");
console.log("SESSION_SECRET:", process.env.SESSION_SECRET ? "✅ OK" : "❌ MISSING");

// ======================
const app = express();
const connectDB = require('./connect');
const messageRoutes = require('./routes/message');
const Register = require('./routes/user');

const ALLOWED_ORIGINS = [
    'http://localhost:3000',
    'https://sign-translator-ih5s.vercel.app'
];

// ==================== MIDDLEWARE ====================
app.use(cors({
    origin: ALLOWED_ORIGINS,
    credentials: true
}));

app.use(express.json());

app.use(session({
    secret: process.env.SESSION_SECRET || 'default_secret_key_please_change_in_production',
    resave: false,
    saveUninitialized: true
}));

require('./middleware/passport-setup');
app.use(passport.initialize());
app.use(passport.session());

// ==================== DATABASE ====================
connectDB();

// ==================== ROUTES ====================
app.get('/', (req, res) => {
    res.send('✅ MediSign Backend is running...');
});

app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

app.get('/auth/google/callback',
    passport.authenticate('google', { failureRedirect: '/login' }),
    (req, res) => {
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        res.redirect(`${frontendUrl}/profil`);
    }
);

app.use('/user', Register);
app.use('/api/messages', messageRoutes);
app.use('/uploads/profile_pics', express.static(path.join(__dirname, 'uploads/profile_pics')));

// ==================== SOCKET.IO + HTTP SERVER ====================
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: ALLOWED_ORIGINS,
        methods: ['GET', 'POST'],
        credentials: true
    },
    transports: ['websocket', 'polling']
});

const userSockets = new Map();

io.on('connection', (socket) => {
    console.log('🔌 New client connected:', socket.id);

    // ==================== REGISTER ====================
    socket.on('register', (userId) => {
        if (!userId) return;

        const userIdStr = userId.toString();
        console.log(`✅ Registering user ${userIdStr} with socket ${socket.id}`);

        userSockets.set(userIdStr, { socketId: socket.id, socket });
        socket.userId = userIdStr;

        socket.emit('registered', {
            userId: userIdStr,
            socketId: socket.id,
            message: 'User registered successfully'
        });

        socket.emit('users_online', Array.from(userSockets.keys()));
        socket.broadcast.emit('user_online', { userId: userIdStr });
    });

    // ==================== MESSAGING ====================
    socket.on('send_message', async (data) => {
        try {
            const senderIdStr = data.senderId?.toString();
            const receiverIdStr = data.receiverId?.toString();

            if (!senderIdStr || !receiverIdStr) {
                return socket.emit('message_error', { error: 'Missing sender or receiver ID' });
            }

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

            const receiver = userSockets.get(receiverIdStr);
            if (receiver?.socket) {
                receiver.socket.emit('new_message', populatedMessage);
            }

            socket.emit('message_sent', populatedMessage);

        } catch (error) {
            console.error('Error saving message:', error);
            socket.emit('message_error', { error: error.message });
        }
    });

    socket.on('mark_read', async (data) => {
        try {
            const { conversationId, userId } = data;
            if (!conversationId || !userId) return;

            const Conversation = require('./models/Conversation');
            const conversation = await Conversation.findById(conversationId);
            if (conversation) {
                conversation.unreadCount.set(userId.toString(), 0);
                await conversation.save();
            }
        } catch (error) {
            console.error('Error marking messages as read:', error);
        }
    });

    // ==================== VIDEO CALL HANDLERS ====================
    socket.on('call_user', (data) => {
        const fromUserId = data.fromUserId?.toString();
        const toUserId = data.toUserId?.toString();
        const { signal, callerInfo } = data;

        const targetUser = userSockets.get(toUserId);
        if (targetUser?.socket) {
            targetUser.socket.emit('incoming_call', {
                fromUserId,
                signal,
                callerInfo,
                callId: Date.now()
            });
        } else {
            socket.emit('call_error', { error: 'User is not online' });
        }
    });

    socket.on('accept_call', (data) => {
        const fromUserId = data.fromUserId?.toString();
        const toUserId = data.toUserId?.toString();
        const { signal } = data;

        const callerUser = userSockets.get(fromUserId);
        if (callerUser?.socket) {
            callerUser.socket.emit('call_accepted', { toUserId, signal });
        }
    });

    socket.on('reject_call', (data) => {
        const fromUserId = data.fromUserId?.toString();
        const toUserId = data.toUserId?.toString();

        const callerUser = userSockets.get(fromUserId);
        if (callerUser?.socket) {
            callerUser.socket.emit('call_rejected', { fromUserId: toUserId });
        }
    });

    socket.on('end_call', (data) => {
        const fromUserId = data.fromUserId?.toString();
        const toUserId = data.toUserId?.toString();

        const targetUser = userSockets.get(toUserId);
        if (targetUser?.socket) {
            targetUser.socket.emit('call_ended', { fromUserId });
        }
    });

    // ==================== AI TRANSLATION HANDLER ====================
    socket.on('send_translation', (data) => {
    const { text, toUserId, fromUserId } = data;
    const targetUser = userSockets.get(toUserId?.toString());
    
    if (targetUser && targetUser.socket) {
        targetUser.socket.emit('receive_translation', {
            text: text,
            fromUserId: fromUserId
        });
    }
});

    // ==================== DISCONNECT ====================
    socket.on('disconnect', () => {
        if (socket.userId) {
            userSockets.delete(socket.userId);
            io.emit('user_offline', { userId: socket.userId });
            console.log(`🔌 User ${socket.userId} disconnected`);
        }
    });
});

// ==================== START SERVER ====================
const PORT = process.env.PORT || 5000;

server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🔌 Socket.IO & Video calls ready`);
});