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
  return jwt.sign({ userId }, process.env.JWT_SECRET || 'secret', { expiresIn: '30d' });
}

function userPublic(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone || null,
    upiId: user.upiId || null,
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
// Concept: Server-side error handling (try/catch + error middleware)
router.post('/register', async (req, res, next) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
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
      return res.status(409).json({ success: false, message: 'Email is already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        name,
        email: normalizedEmail,
        passwordHash,
        phone: phone || null,
        upiId: upiId || null,
      },
    });

    const token = signToken(user.id);
    return res.status(201).json({ success: true, user: userPublic(user), token });
  } catch (error) {
    console.error('Register error:', error);
    next(error);
  }
});

// ── POST /login ───────────────────────────────────────────────────────────────
// Concept: Server-side error handling (try/catch + error middleware)
router.post('/login', async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: 'Invalid login payload',
        errors: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }

    const { email, password } = parsed.data;
    const normalizedEmail = email.toLowerCase().trim();

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    const token = signToken(user.id);
    return res.status(200).json({ success: true, user: userPublic(user), token });
  } catch (error) {
    console.error('Login error:', error);
    next(error);
  }
});

module.exports = router;
