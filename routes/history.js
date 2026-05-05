const express = require('express');
const router = express.Router();
const History = require('../models/History');
const { isAuth } = require('../middleware/auth');

// GET /history — historique de l'utilisateur connecté
router.get('/', isAuth, async (req, res) => {
  try {
    const history = await History.find({ userId: req.user._id }).sort({ createdAt: -1 });
    res.json({ history });
  } catch (err) {
    res.status(500).json({ msg: 'Erreur serveur' });
  }
});

router.post('/', isAuth, async (req, res) => {
  try {
    const { type, content, status } = req.body;
    const entry = new History({ userId: req.user._id, type, content, status: status || 'pending' });
    await entry.save();
    res.status(201).json({ history: entry });
  } catch (err) {
    res.status(500).json({ msg: 'Erreur serveur' });
  }
});

module.exports = router;