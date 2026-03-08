require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const ussdRoutes = require('./routes/ussd');
const paymentRoutes = require('./routes/payments');
const driverRoutes = require('./routes/drivers');
const authRoutes = require('./routes/auth');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));

// API routes
app.use('/ussd', ussdRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/drivers', driverRoutes);
app.use('/api/auth', authRoutes);

// Serve HTML pages
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/dashboard.html'));
});
app.get('/driver/:id', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/driver.html'));
});

app.listen(PORT, () => {
  console.log(`MotoLift server running on port ${PORT}`);
});
