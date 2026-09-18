require('dotenv').config();
const { createClerkClient } = require('@clerk/backend');
const prisma = require('../lib/prisma');

async function syncClerkUsers() {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    console.error('CLERK_SECRET_KEY is not defined in .env');
    process.exit(1);
  }

  const clerk = createClerkClient({ secretKey });

  try {
    console.log('Fetching users from Clerk...');
    const clerkUserListResponse = await clerk.users.getUserList({ limit: 100 });
    const clerkUsers = clerkUserListResponse.data || clerkUserListResponse;

    console.log(`Found ${clerkUsers.length} users in Clerk.`);

    for (const cu of clerkUsers) {
      const bestName =
        [cu.firstName, cu.lastName].filter(Boolean).join(' ') ||
        cu.username ||
        cu.firstName ||
        'User';

      const bestEmail =
        cu.emailAddresses?.[0]?.emailAddress ||
        `${cu.id}@clerk.user`;

      console.log(`Processing Clerk User: ${cu.id} -> Name: "${bestName}", Email: "${bestEmail}"`);

      // 1. Check if user exists by Clerk ID
      const existingUser = await prisma.user.findUnique({
        where: { id: cu.id },
      });

      if (existingUser) {
        await prisma.user.update({
          where: { id: cu.id },
          data: {
            name: bestName,
            email: bestEmail,
            emailVerified: true,
          },
        });
        console.log(`  Updated existing DB user ${cu.id} -> ${bestName}`);
      } else {
        // Check if matching email exists
        const existingByEmail = await prisma.user.findUnique({
          where: { email: bestEmail },
        });

        if (existingByEmail) {
          await prisma.user.update({
            where: { id: existingByEmail.id },
            data: {
              name: bestName,
              emailVerified: true,
            },
          });
          console.log(`  Updated existing DB user by email ${bestEmail} -> ${bestName}`);
        } else {
          await prisma.user.create({
            data: {
              id: cu.id,
              name: bestName,
              email: bestEmail,
              passwordHash: '',
              emailVerified: true,
            },
          });
          console.log(`  Created new DB user ${cu.id} -> ${bestName}`);
        }
      }
    }

    console.log('Clerk sync completed successfully!');
  } catch (err) {
    console.error('Error syncing Clerk users:', err);
  } finally {
    await prisma.$disconnect();
  }
}

syncClerkUsers();
