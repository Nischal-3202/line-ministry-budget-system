const db = require('../db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
console.log('✅ authController loaded');

exports.registerUser = async (req, res) => {
  console.log('📥 Register route hit:', req.body);
  const { username, password, role_id } = req.body;

  if (!username || !password || !role_id) {
    return res.status(400).json({ message: 'All fields are required' });
  }

  try {
    // Check if user already exists
    db.query('SELECT * FROM users WHERE username = ?', [username], async (err, results) => {
      if (results.length > 0) {
        return res.status(409).json({ message: 'User already exists' });
      }

      // Hash the password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Insert into DB
      db.query(
        'INSERT INTO users (username, password_hash, role_id) VALUES (?, ?, ?)',
        [username, hashedPassword, role_id],
        (err, result) => {
          if (err) {
            console.error(err);
            return res.status(500).json({ message: 'Database error' });
          }

          res.status(201).json({ message: 'User registered successfully' });
        }
      );
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};

exports.loginUser = async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password are required' });
  }

  try {
    // Check if user exists
    db.query('SELECT * FROM users WHERE username = ?', [username], async (err, results) => {
      if (err) {
        return res.status(500).json({ message: 'Database error' });
      }

      if (results.length === 0) {
        return res.status(401).json({ message: 'Invalid username or password' });
      }

      const user = results[0];

      // Compare passwords
      const isMatch = await bcrypt.compare(password, user.password_hash);
      if (!isMatch) {
        return res.status(401).json({ message: 'Invalid username or password' });
      }

      // Generate token
      const token = jwt.sign(
        { id: user.id, username: user.username, role: user.role_id },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
      );

      res.status(200).json({ message: 'Login successful', token });
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
};