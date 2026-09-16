require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { connectMongo } = require('./lib/mongo');

const authRoutes = require('./routes/auth');
const groupRoutes = require('./routes/groups');
const expenseRoutes = require('./routes/expenses');
const balanceRoutes = require('./routes/balances');
const aiExpenseRoutes = require('./routes/aiExpense');
const shoppingRoutes = require('./routes/shopping');
const notificationRoutes = require('./routes/notifications');
const { settlementsRouter } = require('./routes/settlements');
const dashboardRoutes = require('./routes/dashboard');
const historyRoutes = require('./routes/history');
const analyticsRoutes = require('./routes/analytics');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
require('./services/cronService'); // Initialize background cron tasks & keep-alive ping

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/history', historyRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api', expenseRoutes);
app.use('/api', balanceRoutes);
app.use('/api', aiExpenseRoutes);
app.use('/api', settlementsRouter);
app.use('/api/groups/:groupId/shopping', shoppingRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// ── Concept: Server-side error handling (Score: 0.2) ─────────────────────────
// 404 Catch-All Middleware for undefined endpoints
app.use(notFoundHandler);

// Centralized Express 4-Arity Error-Handling Middleware (Must be registered after all route handlers)
app.use((err, req, res, next) => {
  return errorHandler(err, req, res, next);
});

// Process-level unhandled rejection & uncaught exception safeguards
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Process Error] Unhandled Promise Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('[Process Error] Uncaught Exception thrown:', error);
});

async function start() {
  try {
    try {
      await connectMongo();
    } catch (mongoError) {
      console.warn('MongoDB unavailable, continuing without Mongo features:', mongoError.message);
    }
    const server = app.listen(PORT, () => {
      console.log(`SplitUp API running on port http://localhost:${PORT}`);
    });

    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`[Server Error] Port ${PORT} is already in use. Please terminate any process holding port ${PORT} or configure a different PORT in .env.`);
      } else {
        console.error('[Server Error] Failed to start HTTP server:', error.message);
      }
      process.exit(1);
    });
  } catch (error) {
    console.error('Failed to start API', error);
    process.exit(1);
  }
}

start();
