const express = require("express");
const router = express.Router();
const Message = require("../models/Message");
const Conversation = require("../models/Conversation");
const User = require("../models/users");
const { isAuth } = require("../middleware/auth");

// Récupérer les utilisateurs (amis)
router.get("/users", isAuth, async (req, res) => {
    try {
        const userId = req.user._id;
        
        const users = await User.find({ _id: { $ne: userId } })
            .select('firstName lastName email profilePic');
        
        console.log("Users found:", users.length);
        res.status(200).json(users);
    } catch (error) {
        console.error("Error fetching users:", error);
        res.status(500).json({ msg: error.message });
    }
});

// Récupérer les conversations de l'utilisateur
router.get("/conversations", isAuth, async (req, res) => {
    try {
        const userId = req.user._id;
        
        const conversations = await Conversation.find({
            participants: userId
        }).sort({ lastMessageTime: -1 });
        
        console.log("Conversations found:", conversations.length);
        
        // Populer les informations des participants
        const populatedConversations = await Promise.all(
            conversations.map(async (conv) => {
                const otherParticipant = conv.participants.find(
                    p => p.toString() !== userId.toString()
                );
                
                const user = await User.findById(otherParticipant)
                    .select('firstName lastName profilePic email');
                
                const lastMessage = conv.lastMessage || "No messages yet";
                const lastMessageTime = conv.lastMessageTime;
                const unreadCount = conv.unreadCount?.get(userId.toString()) || 0;
                
                return {
                    _id: conv._id,
                    participant: user,
                    lastMessage,
                    lastMessageTime,
                    unreadCount
                };
            })
        );
        
        res.status(200).json(populatedConversations);
    } catch (error) {
        console.error("Error fetching conversations:", error);
        res.status(500).json({ msg: error.message });
    }
});

// Créer ou récupérer une conversation
router.post("/conversation", isAuth, async (req, res) => {
    try {
        const { receiverId } = req.body;
        const senderId = req.user._id;
        
        console.log("Creating/finding conversation between:", senderId, receiverId);
        
        let conversation = await Conversation.findOne({
            participants: { $all: [senderId, receiverId] }
        });
        
        if (!conversation) {
            conversation = new Conversation({
                participants: [senderId, receiverId],
                unreadCount: new Map(),
                lastMessageTime: new Date()
            });
            await conversation.save();
            console.log("New conversation created:", conversation._id);
        }
        
        res.status(200).json(conversation);
    } catch (error) {
        console.error("Error creating conversation:", error);
        res.status(500).json({ msg: error.message });
    }
});

// Envoyer un message
router.post("/send", isAuth, async (req, res) => {
    try {
        const { receiverId, text, media } = req.body;
        const senderId = req.user._id;
        
        console.log("Sending message from", senderId, "to", receiverId);
        
        // Trouver ou créer la conversation
        let conversation = await Conversation.findOne({
            participants: { $all: [senderId, receiverId] }
        });
        
        if (!conversation) {
            conversation = new Conversation({
                participants: [senderId, receiverId],
                unreadCount: new Map(),
                lastMessageTime: new Date()
            });
            await conversation.save();
        }
        
        // Créer le message
        const message = new Message({
            conversationId: conversation._id,
            sender: senderId,
            receiver: receiverId,
            text,
            media: media || null
        });
        await message.save();
        
        // Mettre à jour la conversation
        conversation.lastMessage = text;
        conversation.lastMessageTime = new Date();
        
        // Incrémenter le compteur de non-lus pour le receveur
        const currentUnread = conversation.unreadCount.get(receiverId.toString()) || 0;
        conversation.unreadCount.set(receiverId.toString(), currentUnread + 1);
        
        await conversation.save();
        
        // Populer les données du sender
        const populatedMessage = await Message.findById(message._id)
            .populate('sender', 'firstName lastName profilePic')
            .populate('receiver', 'firstName lastName profilePic');
        
        console.log("Message sent successfully");
        res.status(201).json(populatedMessage);
    } catch (error) {
        console.error("Error sending message:", error);
        res.status(500).json({ msg: error.message });
    }
});

// Récupérer les messages d'une conversation
router.get("/conversation/:conversationId", isAuth, async (req, res) => {
    try {
        const { conversationId } = req.params;
        
        console.log("Fetching messages for conversation:", conversationId);
        
        const messages = await Message.find({ conversationId })
            .populate('sender', 'firstName lastName profilePic')
            .populate('receiver', 'firstName lastName profilePic')
            .sort({ createdAt: 1 });
        
        console.log("Messages found:", messages.length);
        res.status(200).json(messages);
    } catch (error) {
        console.error("Error fetching messages:", error);
        res.status(500).json({ msg: error.message });
    }
});

// Marquer les messages comme lus
router.put("/read/:conversationId", isAuth, async (req, res) => {
    try {
        const { conversationId } = req.params;
        const userId = req.user._id;
        
        console.log("Marking messages as read for conversation:", conversationId);
        
        await Message.updateMany(
            {
                conversationId,
                receiver: userId,
                read: false
            },
            {
                read: true,
                readAt: new Date()
            }
        );
        
        // Reset unread count
        const conversation = await Conversation.findById(conversationId);
        if (conversation) {
            conversation.unreadCount.set(userId.toString(), 0);
            await conversation.save();
        }
        
        res.status(200).json({ msg: "Messages marked as read" });
    } catch (error) {
        console.error("Error marking messages as read:", error);
        res.status(500).json({ msg: error.message });
    }
});

module.exports = router;