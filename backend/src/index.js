require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');

const apiRouter = require('./routes/api');
const { registerJobs } = require('./jobs/scheduler');

const app = express();
const PORT = process.env.PORT || 4000;

// ─────────────────────────────────────────────
// Middleware
// ─────────────────────────────────────────────
app.use(helmet());
app.use(compression());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));

// ─────────────────────────────────────────────
// Routes
// ─────────────────────────────────────────────
app.use('/api', apiRouter);

app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date() }));

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
  });
});

// ─────────────────────────────────────────────
// Start
// ─────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 Fantasy League API running on port ${PORT}`);
  if (process.env.NODE_ENV !== 'test') {
    registerJobs();
  }
});

module.exports = app;
