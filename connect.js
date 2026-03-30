// create connection to database
const mongoose = require('mongoose');
const MONGO_URI = process.env.MONGO_URI;

const connectDB = async () => {
    try {
        // Remove the options object entirely - they are now default
        await mongoose.connect(MONGO_URI);
        console.log('✅ MongoDB connected');
    }
    catch (err) {
        console.error('❌ MongoDB connection error:', err);
        process.exit(1);
    }
}

module.exports = connectDB;