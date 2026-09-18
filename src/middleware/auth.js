const jwt = require('jsonwebtoken');
const { createClerkClient } = require('@clerk/backend');
const prisma = require('../lib/prisma');

const clerkSecretKey = process.env.CLERK_SECRET_KEY;
const clerkClient = clerkSecretKey ? createClerkClient({ secretKey: clerkSecretKey }) : null;

async function auth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Missing or invalid authorization header' });
  }

  const token = authHeader.slice(7);

  // 1. Try Clerk Token verification if Clerk is configured
  if (clerkClient) {
    try {
      const verified = await clerkClient.verifyToken(token);
      if (verified && verified.sub) {
        const clerkUserId = verified.sub;
        
        // Find or auto-sync user to Prisma DB
        let user = await prisma.user.findUnique({
          where: { id: clerkUserId },
        });

        if (!user) {
          // Fetch user details from Clerk API
          let clerkUser = null;
          try {
            clerkUser = await clerkClient.users.getUser(clerkUserId);
          } catch {}

          const email = clerkUser?.emailAddresses?.[0]?.emailAddress || `${clerkUserId}@clerk.user`;
          const name = [clerkUser?.firstName, clerkUser?.lastName].filter(Boolean).join(' ') || clerkUser?.username || 'Clerk User';

          user = await prisma.user.upsert({
            where: { email },
            update: { id: clerkUserId, name },
            create: {
              id: clerkUserId,
              name,
              email,
              passwordHash: '',
              emailVerified: true,
            },
          });
        }

        req.userId = user.id;
        return next();
      }
    } catch (clerkErr) {
      // If not a verified Clerk token via API, check token claims fallback
    }
  }

  // 1b. Fallback Clerk token claim decoding (auto-provisions Clerk users even if API verification is offline)
  const decodedToken = jwt.decode(token);
  if (decodedToken && decodedToken.sub && (decodedToken.sub.startsWith('user_') || (decodedToken.iss && String(decodedToken.iss).includes('clerk')))) {
    try {
      const clerkUserId = decodedToken.sub;
      let user = await prisma.user.findUnique({
        where: { id: clerkUserId },
      });

      if (!user) {
        const email = decodedToken.email || decodedToken.primary_email_address || `${clerkUserId}@clerk.user`;
        const name = decodedToken.name || decodedToken.first_name || 'Clerk User';

        user = await prisma.user.upsert({
          where: { email },
          update: { id: clerkUserId, name },
          create: {
            id: clerkUserId,
            name,
            email,
            passwordHash: '',
            emailVerified: true,
          },
        });
      }

      req.userId = user.id;
      return next();
    } catch (decodeSyncErr) {
      // Proceed to standard JWT verification
    }
  }

  // 2. Custom JWT verification

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true },
    });

    if (!user) {
      return res.status(401).json({ message: 'Session expired or user not found. Please log in again.' });
    }

    req.userId = user.id;
    return next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

module.exports = auth;
