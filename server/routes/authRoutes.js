const express = require('express');
console.log('✅ authRoutes loaded');
const router = express.Router();
const authController = require('../controllers/authController');
const verifyToken = require('../middleware/authMiddleware');

// POST /register
router.post('/register', authController.registerUser);
router.post('/login', authController.loginUser);

// Test protected route
router.get('/protected', verifyToken, (req, res) => {
  res.json({
    message: '✅ Access granted to protected route!',
    user: req.user
  });
});
module.exports = router;