const express = require('express');
const router = express.Router();
const db = require('../db');
const verifyToken = require('../middleware/authMiddleware');

// 🧾 GET all offices with ministry name
router.get('/', (req, res) => {
  db.query(
    `SELECT o.*, m.name AS ministry_name
     FROM offices o
     JOIN ministries m ON o.ministry_id = m.id`,
    (err, results) => {
      if (err) return res.status(500).json({ message: 'DB error' });
      res.json(results);
    }
  );
});
router.get('/:ministry_id', (req, res) => {
  const { ministry_id } = req.params;

  db.query(
    'SELECT * FROM offices WHERE ministry_id = ?',
    [ministry_id],
    (err, results) => {
      if (err) return res.status(500).json({ message: 'DB error' });
      res.json(results);
    }
  );
});
router.post('/add', verifyToken, (req, res) => {
  if (req.user.role !== 1) {
    return res.status(403).json({ message: 'Only Admins can add offices' });
  }

  const { ministry_id, name, location } = req.body;
  if (!ministry_id || !name || !location) {
    return res.status(400).json({ message: 'All fields are required' });
  }

  db.query(
    'INSERT INTO offices (ministry_id, name, location) VALUES (?, ?, ?)',
    [ministry_id, name, location],
    (err, result) => {
      if (err) return res.status(500).json({ message: 'Insert failed' });
      res.status(201).json({ message: 'Office added successfully', id: result.insertId });
    }
  );
});

module.exports = router;