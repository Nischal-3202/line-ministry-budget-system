const express = require('express');
const cors = require('cors');
require('dotenv').config();
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

const authRoutes = require('./routes/authRoutes');
const ministryRoutes = require('./routes/ministryRoutes');
const budgetRoutes = require('./routes/budgetRoutes');
const officeRoutes = require('./routes/officeRoutes');
const fundRoutes = require('./routes/fundRoutes');
app.use('/api/auth', authRoutes);
app.use('/api/ministries', ministryRoutes);
app.use('/api/budgets', budgetRoutes);
app.use('/api/offices', officeRoutes);
app.use('/api/funds', fundRoutes);

// Default route
app.get('/', (req, res) => {
  res.send('Line Ministry Budget API is running 🚀');
});

app.listen(PORT, () => {
  console.log(`🚀 Server started on http://localhost:${PORT}`);
});