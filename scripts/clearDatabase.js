require('dotenv').config();
const dns = require('dns');
// Set DNS servers to Google / Cloudflare if system DNS fails with SRV
try {
  dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);
} catch (e) {
  console.warn('Could not set custom DNS servers:', e.message);
}

const prisma = require('../src/lib/prisma');
const mongoose = require('mongoose');

async function clearPostgres() {
  console.log('\n=== PostgreSQL Database Cleanup ===');
  try {
    const countsBefore = {
      users: await prisma.user.count(),
      groups: await prisma.group.count(),
      expenses: await prisma.expense.count(),
      settlements: await prisma.settlement.count(),
      notifications: await prisma.notification.count(),
      shoppingItems: await prisma.shoppingItem.count(),
    };
    console.log('Record counts before deletion:', countsBefore);

    console.log('Deleting records across all tables...');
    await prisma.transactionConcern.deleteMany({});
    await prisma.expenseEditHistory.deleteMany({});
    await prisma.expenseSplit.deleteMany({});
    await prisma.expense.deleteMany({});
    await prisma.settlement.deleteMany({});
    await prisma.shoppingItem.deleteMany({});
    await prisma.joinRequest.deleteMany({});
    await prisma.notification.deleteMany({});
    await prisma.otpCode.deleteMany({});
    await prisma.groupMember.deleteMany({});
    await prisma.group.deleteMany({});
    await prisma.user.deleteMany({});

    const countsAfter = {
      users: await prisma.user.count(),
      groups: await prisma.group.count(),
      expenses: await prisma.expense.count(),
      settlements: await prisma.settlement.count(),
      notifications: await prisma.notification.count(),
      shoppingItems: await prisma.shoppingItem.count(),
    };
    console.log('Record counts after deletion:', countsAfter);
    console.log('✓ PostgreSQL cleaned successfully!');
  } catch (err) {
    console.error('PostgreSQL deletion error:', err);
    throw err;
  }
}

async function clearMongo() {
  console.log('\n=== MongoDB Database Cleanup ===');
  if (!process.env.MONGODB_URI) {
    console.log('MONGODB_URI not set. Skipping MongoDB.');
    return;
  }

  try {
    const uri = process.env.MONGODB_URI;
    const dbName = process.env.MONGODB_DB_NAME || undefined;
    console.log(`Connecting to MongoDB (${dbName || 'default'})...`);
    await mongoose.connect(uri, { dbName, serverSelectionTimeoutMS: 8000 });
    
    const collections = await mongoose.connection.db.collections();
    console.log(`Found ${collections.length} MongoDB collection(s).`);
    for (const col of collections) {
      const count = await col.countDocuments({});
      await col.deleteMany({});
      console.log(`✓ Cleared collection "${col.collectionName}" (deleted ${count} document(s)).`);
    }
    console.log('✓ MongoDB cleaned successfully!');
  } catch (err) {
    console.error('MongoDB deletion error:', err.message);
  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  }
}

async function run() {
  try {
    await clearPostgres();
    await clearMongo();
    console.log('\n🎉 ALL PostgreSQL and MongoDB database records have been deleted successfully.');
  } catch (err) {
    console.error('Cleanup terminated with error:', err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

run();
