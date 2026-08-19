const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { z } = require('zod');

const prisma = require('../lib/prisma');

const router = express.Router();

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
  name: z.string().trim().min(1),
  email: z.string().trim().email(),
  password: z.string().min(6),
  phone: z.string().trim().optional(),
  upiId: z.string().trim().optional(),
});

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

// ── POST /register ────────────────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid register payload' });
  }

  const { name, email, password, phone, upiId } = parsed.data;

  try {
    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        name,
        email: email.toLowerCase().trim(),
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
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(409).json({ message: 'Email already exists' });
    }
    return res.status(500).json({ message: 'Registration failed' });
  }
});

// ── POST /login ───────────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid login payload' });
  }

  const { email, password } = parsed.data;

  try {
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (!user) return res.status(401).json({ message: 'Invalid credentials' });

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) return res.status(401).json({ message: 'Invalid credentials' });

    const token = signToken(user.id);
    return res.status(200).json({ token, user: userPublic(user) });
  } catch (error) {
    return res.status(500).json({ message: 'Login failed' });
  }
});

module.exports = router;
