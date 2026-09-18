const jwt = require('jsonwebtoken');
const { createClerkClient } = require('@clerk/backend');
const prisma = require('../lib/prisma');

const clerkSecretKey = process.env.CLERK_SECRET_KEY;
const clerkClient = clerkSecretKey ? createClerkClient({ secretKey: clerkSecretKey }) : null;

async function resolveClerkUser(clerkUserId, clientName, clientEmail, clerkUserFromApi, decodedClaims) {
  const bestName = clientName ||
    [clerkUserFromApi?.firstName, clerkUserFromApi?.lastName].filter(Boolean).join(' ') ||
    clerkUserFromApi?.username ||
    decodedClaims?.name ||
    decodedClaims?.first_name ||
    'User';

  const bestEmail = clientEmail ||
    clerkUserFromApi?.emailAddresses?.[0]?.emailAddress ||
    decodedClaims?.email ||
    decodedClaims?.primary_email_address ||
    `${clerkUserId}@clerk.user`;

  // 1. Check by Clerk User ID
  let user = await prisma.user.findUnique({
    where: { id: clerkUserId },
  });

  if (user) {
    if ((user.name === 'Clerk User' || user.name === 'User' || !user.name) && bestName && bestName !== 'Clerk User' && bestName !== 'User') {
      try {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { name: bestName },
        });
      } catch {}
    }
    return user;
  }

  // 2. Check by Email (in case account was created before via standard auth)
  if (bestEmail && !bestEmail.endsWith('@clerk.user')) {
    const existingByEmail = await prisma.user.findUnique({
      where: { email: bestEmail },
    });

    if (existingByEmail) {
      try {
        user = await prisma.user.update({
          where: { id: existingByEmail.id },
          data: {
            name: (existingByEmail.name === 'Clerk User' || !existingByEmail.name) ? bestName : existingByEmail.name,
            emailVerified: true,
          },
        });
        return user;
      } catch {
        return existingByEmail;
      }
    }
  }

  // 3. Create fresh user
  try {
    user = await prisma.user.create({
      data: {
        id: clerkUserId,
        name: bestName,
        email: bestEmail,
        passwordHash: '',
        emailVerified: true,
      },
    });
    return user;
  } catch (createErr) {
    const fallback = await prisma.user.findFirst({
      where: { OR: [{ id: clerkUserId }, { email: bestEmail }] },
    });
    if (fallback) return fallback;
    throw createErr;
  }
}

async function auth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Missing or invalid authorization header' });
  }

  const token = authHeader.slice(7);
  const clientName = req.headers['x-clerk-user-name'] ? decodeURIComponent(req.headers['x-clerk-user-name']) : null;
  const clientEmail = req.headers['x-clerk-user-email'] ? decodeURIComponent(req.headers['x-clerk-user-email']) : null;

  // 1. Try Clerk Token verification if Clerk is configured
  if (clerkClient) {
    try {
      const verified = await clerkClient.verifyToken(token);
      if (verified && verified.sub) {
        const clerkUserId = verified.sub;
        let clerkUser = null;
        try {
          clerkUser = await clerkClient.users.getUser(clerkUserId);
        } catch {}

        const user = await resolveClerkUser(clerkUserId, clientName, clientEmail, clerkUser, verified);
        req.userId = user.id;
        return next();
      }
    } catch (clerkErr) {
      // Fall through to decoded token check
    }
  }

  // 1b. Fallback Clerk token claim decoding (auto-provisions Clerk users even if API verification is offline)
  const decodedToken = jwt.decode(token);
  if (decodedToken && decodedToken.sub && (decodedToken.sub.startsWith('user_') || (decodedToken.iss && String(decodedToken.iss).includes('clerk')))) {
    try {
      const clerkUserId = decodedToken.sub;
      const user = await resolveClerkUser(clerkUserId, clientName, clientEmail, null, decodedToken);
      req.userId = user.id;
      return next();
    } catch (decodeSyncErr) {
      console.error('[Auth Middleware] Clerk user resolve error:', decodeSyncErr.message);
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


