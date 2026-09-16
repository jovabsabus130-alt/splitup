require('dotenv').config();
const prisma = require('../lib/prisma');

async function clearDatabase() {
  console.log('Starting full database wipe...');
  try {
    const deletedConcerns = await prisma.transactionConcern.deleteMany({});
    console.log(`Deleted ${deletedConcerns.count} TransactionConcerns`);

    const deletedEdits = await prisma.expenseEditHistory.deleteMany({});
    console.log(`Deleted ${deletedEdits.count} ExpenseEditHistories`);

    const deletedSplits = await prisma.expenseSplit.deleteMany({});
    console.log(`Deleted ${deletedSplits.count} ExpenseSplits`);

    const deletedExpenses = await prisma.expense.deleteMany({});
    console.log(`Deleted ${deletedExpenses.count} Expenses`);

    const deletedShopping = await prisma.shoppingItem.deleteMany({});
    console.log(`Deleted ${deletedShopping.count} ShoppingItems`);

    const deletedSettlements = await prisma.settlement.deleteMany({});
    console.log(`Deleted ${deletedSettlements.count} Settlements`);

    const deletedNotifications = await prisma.notification.deleteMany({});
    console.log(`Deleted ${deletedNotifications.count} Notifications`);

    const deletedJoinRequests = await prisma.joinRequest.deleteMany({});
    console.log(`Deleted ${deletedJoinRequests.count} JoinRequests`);

    const deletedMemberships = await prisma.groupMember.deleteMany({});
    console.log(`Deleted ${deletedMemberships.count} GroupMembers`);

    const deletedGroups = await prisma.group.deleteMany({});
    console.log(`Deleted ${deletedGroups.count} Groups`);

    const deletedOtps = await prisma.otpCode.deleteMany({});
    console.log(`Deleted ${deletedOtps.count} OtpCodes`);

    const deletedUsers = await prisma.user.deleteMany({});
    console.log(`Deleted ${deletedUsers.count} Users`);

    console.log('✅ All data in the database has been successfully deleted.');
  } catch (error) {
    console.error('Error while wiping database:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

clearDatabase();
