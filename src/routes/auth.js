const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { z } = require('zod');

const prisma = require('../lib/prisma');
const { sanitizeMiddleware } = require('../middleware/sanitize');
const { asyncHandler, UnauthorizedError, ConflictError } = require('../middleware/errorHandler');

const router = express.Router();
router.use(sanitizeMiddleware);

// ── Helpers ──────────────────────────────────────────────────────────────────

function signToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '30d' });
}

function userPublic(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone || null,
    createdAt: user.createdAt,
  };
}

// ── Schemas ───────────────────────────────────────────────────────────────────

const registerSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  email: z.string().trim().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  phone: z.string().trim().optional(),
  upiId: z.string().trim().optional(),
});

const loginSchema = z.object({
  email: z.string().trim().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

// ── POST /register ────────────────────────────────────────────────────────────
router.post('/register', asyncHandler(async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      message: 'Invalid register payload',
      errors: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }

  const { name, email, password, phone, upiId } = parsed.data;
  const normalizedEmail = email.toLowerCase().trim();

  // Check existing user to avoid unnecessary hashing
  const existingUser = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true },
  });

  if (existingUser) {
    throw new ConflictError('An account with this email already exists.');
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: {
      name,
      email: normalizedEmail,
      passwordHash,
      emailVerified: true,
      ...(phone ? { phone } : {}),
      ...(upiId ? { upiId } : {}),
    },
  });

  const token = signToken(user.id);

  return res.status(201).json({
    token,
    user: userPublic(user),
    message: 'Account created successfully',
  });
}));

// ── POST /login ───────────────────────────────────────────────────────────────
router.post('/login', asyncHandler(async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      message: 'Invalid login payload',
      errors: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }

  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase().trim() },
  });

  if (!user) {
    throw new UnauthorizedError('Invalid email or password');
  }

  const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
  if (!isPasswordValid) {
    throw new UnauthorizedError('Invalid email or password');
  }

  const token = signToken(user.id);
  return res.status(200).json({ token, user: userPublic(user) });
}));

module.exports = router;
