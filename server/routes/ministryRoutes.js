const express = require('express');
const router = express.Router();
const db = require('../db');
const verifyToken = require('../middleware/authMiddleware');


router.get('/', (req, res) => {
  db.query('SELECT * FROM ministries', (err, results) => {
    if (err) return res.status(500).json({ message: 'DB error' });
    res.json(results);
  });
});


router.post('/add', verifyToken, (req, res) => {
  if (req.user.role !== 1) {
    return res.status(403).json({ message: 'Only Admins can add ministries' });
  }

  const { name, description } = req.body;
  if (!name || !description) {
    return res.status(400).json({ message: 'Name and description are required' });
  }

  db.query(
    'INSERT INTO ministries (name, description) VALUES (?, ?)',
    [name, description],
    (err, result) => {
      if (err) return res.status(500).json({ message: 'DB insert error' });
      res.status(201).json({ message: 'Ministry added successfully', id: result.insertId });
    }
  );
});

module.exports = router;