const express = require('express');
const router = express.Router();
const db = require('../db');
const verifyToken = require('../middleware/authMiddleware');

router.get('/', (req, res) => {
  db.query(
    `SELECT budgets.*, ministries.name AS ministry_name 
     FROM budgets 
     JOIN ministries ON budgets.ministry_id = ministries.id`,
    (err, results) => {
      if (err) return res.status(500).json({ message: 'DB error' });
      res.json(results);
    }
  );
});
router.post('/add', verifyToken, (req, res) => {
  if (req.user.role !== 1) {
    return res.status(403).json({ message: 'Only Admins can add budgets' });
  }

  const { ministry_id, fiscal_year, amount } = req.body;
  if (!ministry_id || !fiscal_year || !amount) {
    return res.status(400).json({ message: 'All fields are required' });
  }

  db.query(
    'INSERT INTO budgets (ministry_id, fiscal_year, amount) VALUES (?, ?, ?)',
    [ministry_id, fiscal_year, amount],
    (err, result) => {
      if (err) return res.status(500).json({ message: 'Insert failed' });
      res.status(201).json({ message: 'Budget added successfully', id: result.insertId });
    }
  );
});

module.exports = router;