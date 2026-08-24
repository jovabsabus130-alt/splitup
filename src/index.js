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
const { settlementsRouter } = require('./routes/settlements');
const dashboardRoutes = require('./routes/dashboard');
require('./services/cronService'); // Initialize background cron tasks & keep-alive ping

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api', expenseRoutes);
app.use('/api', balanceRoutes);
app.use('/api', aiExpenseRoutes);
app.use('/api', settlementsRouter);
app.use('/api/groups/:groupId/shopping', shoppingRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

async function start() {
  try {
    try {
      await connectMongo();
    } catch (mongoError) {
      console.warn('MongoDB unavailable, continuing without Mongo features:', mongoError.message);
    }
    app.listen(PORT, () => {
      console.log(`SplitUp API running on port http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start API', error);
    process.exit(1);
  }
}

start();
