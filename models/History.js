const mongoose = require('mongoose');

const historySchema = new mongoose.Schema({
  userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type:        { type: String, required: true },   
  content:     { type: String, required: true },   
  status:      { type: String, enum: ['pending', 'approved', 'rejected', 'completed', 'failed'], default: 'pending' },
  rejectReason:{ type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('History', historySchema);