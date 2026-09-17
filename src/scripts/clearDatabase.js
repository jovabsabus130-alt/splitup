const prisma = require('../lib/prisma');
const { connectMongo } = require('../lib/mongo');
const RawExpenseLog = require('../models/RawExpenseLog');

async function clearDatabase() {
  console.log('Starting full database wipe...');

  // 1. Truncate PostgreSQL tables
  try {
    await prisma.$executeRawUnsafe(`
      TRUNCATE TABLE 
        "ExpenseEditHistory",
        "TransactionConcern",
        "ExpenseSplit",
        "Expense",
        "Settlement",
        "Notification",
        "ShoppingItem",
        "JoinRequest",
        "GroupMember",
        "OtpCode",
        "Group",
        "User"
      CASCADE;
    `);
    console.log('✔ Successfully cleared all PostgreSQL tables (Users, Groups, Expenses, Splits, Settlements, Notifications, etc.)');
  } catch (err) {
    console.error('Error clearing PostgreSQL:', err.message);
  }

  // 2. Clear MongoDB collections if configured
  try {
    await connectMongo();
    if (RawExpenseLog.deleteMany) {
      const res = await RawExpenseLog.deleteMany({});
      console.log(`✔ Cleared MongoDB RawExpenseLog documents (deleted: ${res.deletedCount || 0})`);
    }
  } catch (mongoErr) {
    console.log('ℹ MongoDB not connected or already empty:', mongoErr.message);
  }

  console.log('✨ All database data has been completely erased.');
}

clearDatabase()
  .catch((e) => {
    console.error('Failed to wipe database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
