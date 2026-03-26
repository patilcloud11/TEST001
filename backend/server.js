/**
 * AI-Powered Family Finance Management System
 * Main Server Entry Point
 *
 * Environment loading:
 *   Local dev  → reads .env              (has AWS keys, localhost FRONTEND_URL)
 *   AWS EC2    → reads .env              (written by user-data script at boot,
 *                                         has no AWS keys — uses IAM role instead)
 */

// Load .env from current working directory.
// On EC2, user-data script writes /opt/family-finance-backend/.env at boot.
require('dotenv').config();

const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const morgan  = require('morgan');
const rateLimit = require('express-rate-limit');

// Route imports
const authRoutes       = require('./routes/auth.routes');
const familyRoutes     = require('./routes/family.routes');
const expenseRoutes    = require('./routes/expense.routes');
const billRoutes       = require('./routes/bill.routes');
const investmentRoutes = require('./routes/investment.routes');
const aiRoutes         = require('./routes/ai.routes');
const marketRoutes     = require('./routes/market.routes');

const app = express();

// ─── Security Middleware ──────────────────────────────────────────────────────
app.use(helmet());

// CORS — builds allowed origins list from environment
// Local dev:   FRONTEND_URL=http://localhost:5173
// AWS prod:    FRONTEND_URL=https://familyfinance.io  (set by user-data script)
const allowedOrigins = [
  process.env.FRONTEND_URL,          // primary origin from .env
  'http://localhost:5173',            // always allow local dev
  'http://localhost:3000',            // allow if testing frontend on 3000
].filter(Boolean);                    // remove undefined/null entries

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (Postman, curl, SSM health checks)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
}));

// ─── Rate Limiting ────────────────────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max:      parseInt(process.env.RATE_LIMIT_MAX)        || 100,
  message:  { error: 'Too many requests, please try again later.' },
});
app.use('/api/', limiter);

// ─── General Middleware ───────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ─── Health Check ─────────────────────────────────────────────────────────────
// AWS ALB hits GET /health every 30 seconds.
// Must return 200 or the instance is marked unhealthy and removed from rotation.
app.get('/health', (req, res) => {
  res.status(200).json({
    status:      'healthy',
    service:     'Family Finance API',
    version:     '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    region:      process.env.AWS_REGION || 'local',
    timestamp:   new Date().toISOString(),
  });
});

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/auth',        authRoutes);
app.use('/api/families',    familyRoutes);
app.use('/api/expenses',    expenseRoutes);
app.use('/api/bills',       billRoutes);
app.use('/api/investments', investmentRoutes);
app.use('/api/ai',          aiRoutes);
app.use('/api/market',      marketRoutes);

// ─── 404 Handler ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.originalUrl} not found` });
});

// ─── Global Error Handler ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled Error:', err);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    error: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

// ─── Start Server ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════════════╗
  ║   Family Finance API Server Running          ║
  ║   Port    : ${PORT}                              ║
  ║   Env     : ${(process.env.NODE_ENV || 'development').padEnd(20)}║
  ║   Region  : ${(process.env.AWS_REGION || 'local').padEnd(20)}║
  ║   CORS    : ${(process.env.FRONTEND_URL || 'localhost').padEnd(20)}║
  ╚══════════════════════════════════════════════╝
  `);
});

module.exports = app;
