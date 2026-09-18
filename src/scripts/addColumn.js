require('dotenv').config();
const prisma = require('../lib/prisma');

async function main() {
  try {
    console.log('Adding createdById column to Expense table...');
    await prisma.$executeRawUnsafe(`ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "createdById" TEXT REFERENCES "User"("id") ON DELETE SET NULL;`);
    console.log('Successfully added createdById column to Expense table!');
    
    // Backfill createdById with paidById for existing records so existing records have a valid creator
    await prisma.$executeRawUnsafe(`UPDATE "Expense" SET "createdById" = "paidById" WHERE "createdById" IS NULL;`);
    console.log('Backfilled existing expenses createdById = paidById');
  } catch (err) {
    console.error('Error adding column:', err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
