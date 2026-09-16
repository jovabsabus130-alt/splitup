const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { z } = require('zod');

const prisma = require('../lib/prisma');
const { sanitizeMiddleware } = require('../middleware/sanitize');
const { sendOtpEmail, sendPasswordResetOtpEmail } = require('../services/emailService');

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
    emailVerified: user.emailVerified || false,
    createdAt: user.createdAt,
  };
}

const OTP_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

function generate6DigitOtp() {
  return crypto.randomInt(100000, 1000000).toString();
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

const verifyEmailSchema = z.object({
  email: z.string().trim().email('Invalid email address'),
  otp: z.string().trim().length(6, 'OTP must be 6 digits'),
});

const resendVerificationSchema = z.object({
  email: z.string().trim().email('Invalid email address'),
});

const forgotPasswordSchema = z.object({
  email: z.string().trim().email('Invalid email address'),
});

const resetPasswordSchema = z.object({
  email: z.string().trim().email('Invalid email address'),
  otp: z.string().trim().length(6, 'OTP must be 6 digits'),
  newPassword: z.string().min(6, 'Password must be at least 6 characters'),
});

// ── Handlers ──────────────────────────────────────────────────────────────────

async function handleVerifyEmail(req, res, next) {
  try {
    const parsed = verifyEmailSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: 'Invalid verification payload',
        errors: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }

    const { email, otp } = parsed.data;
    const normalizedEmail = email.toLowerCase().trim();
    const cleanOtp = String(otp).trim();

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: {
        otpCodes: {
          where: {
            used: false,
            expiresAt: { gt: new Date() },
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid or expired verification code' });
    }

    const latestOtp = user.otpCodes[0];
    if (!latestOtp || latestOtp.code !== cleanOtp) {
      return res.status(400).json({ success: false, message: 'Invalid or expired verification code' });
    }

    // Invalidate all active OTPs for this user and mark email as verified
    await prisma.$transaction([
      prisma.otpCode.updateMany({
        where: { userId: user.id, used: false },
        data: { used: true },
      }),
      prisma.user.update({
        where: { id: user.id },
        data: { emailVerified: true },
      }),
    ]);

    const token = signToken(user.id);
    return res.status(200).json({
      success: true,
      message: 'Email verified successfully',
      user: userPublic({ ...user, emailVerified: true }),
      token,
    });
  } catch (error) {
    console.error('Verify email error:', error);
    next(error);
  }
}

async function handleResendVerification(req, res, next) {
  try {
    const parsed = resendVerificationSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email address',
        errors: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }

    const { email } = parsed.data;
    const normalizedEmail = email.toLowerCase().trim();

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    // Uniform response to prevent email enumeration attacks
    const genericSuccessResponse = {
      success: true,
      message: 'If an account exists with that email, a verification code has been sent.',
    };

    if (!user) {
      return res.status(200).json(genericSuccessResponse);
    }

    // Invalidate prior unused OTPs
    await prisma.otpCode.updateMany({
      where: { userId: user.id, used: false },
      data: { used: true },
    });

    // Create new secure OTP
    const code = generate6DigitOtp();
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS);

    await prisma.otpCode.create({
      data: {
        userId: user.id,
        code,
        expiresAt,
        used: false,
      },
    });

    console.log(`\n========================================\n🔐 [SPLITUP OTP] Verification Code for ${normalizedEmail}: ${code}\n========================================\n`);

    // Non-blocking email dispatch
    if (process.env.SMTP_USER && process.env.SMTP_PASS) {
      sendOtpEmail(normalizedEmail, user.name, code).catch((mailErr) => {
        console.error('Failed to send resend verification email:', mailErr.message);
      });
    }

    return res.status(200).json(genericSuccessResponse);
  } catch (error) {
    console.error('Resend verification error:', error);
    next(error);
  }
}

// ── POST /register ────────────────────────────────────────────────────────────
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

    // Check existing user
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, name: true, emailVerified: true },
    });

    let user;
    const passwordHash = await bcrypt.hash(password, 10);

    if (existingUser) {
      if (existingUser.emailVerified) {
        return res.status(409).json({ success: false, message: 'This email is already registered and verified. Please sign in.' });
      }
      // If user started registration previously but never verified, update details and issue fresh OTP
      user = await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          name,
          passwordHash,
          phone: phone || null,
          upiId: upiId || null,
        },
      });
    } else {
      user = await prisma.user.create({
        data: {
          name,
          email: normalizedEmail,
          passwordHash,
          phone: phone || null,
          upiId: upiId || null,
          emailVerified: false,
        },
      });
    }

    // Invalidate any existing unused OTPs
    await prisma.otpCode.updateMany({
      where: { userId: user.id, used: false },
      data: { used: true },
    });

    // Generate secure 6-digit OTP code (expires in 10 minutes)
    const code = generate6DigitOtp();
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS);

    await prisma.otpCode.create({
      data: {
        userId: user.id,
        code,
        expiresAt,
        used: false,
      },
    });

    console.log(`\n========================================\n🔐 [SPLITUP OTP] Registration Code for ${normalizedEmail}: ${code}\n========================================\n`);

    // Non-blocking email dispatch
    if (process.env.SMTP_USER && process.env.SMTP_PASS) {
      sendOtpEmail(normalizedEmail, name, code).catch((mailErr) => {
        console.error('Failed to send OTP email during register:', mailErr.message);
      });
    }

    return res.status(201).json({
      success: true,
      requireVerification: true,
      email: normalizedEmail,
      message: 'Verification code sent to your email. Please enter the 6-digit code to complete registration.',
    });
  } catch (error) {
    console.error('Register error:', error);
    next(error);
  }
});

// ── POST /verify-email & POST /verify-otp ─────────────────────────────────────
router.post('/verify-email', handleVerifyEmail);
router.post('/verify-otp', handleVerifyEmail);

// ── POST /resend-verification & POST /resend-otp ──────────────────────────────
router.post('/resend-verification', handleResendVerification);
router.post('/resend-otp', handleResendVerification);

// ── POST /forgot-password ─────────────────────────────────────────────────────
router.post('/forgot-password', async (req, res, next) => {
  try {
    const parsed = forgotPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: 'Invalid email address',
        errors: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }

    const { email } = parsed.data;
    const normalizedEmail = email.toLowerCase().trim();

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    const genericSuccessResponse = {
      success: true,
      message: 'If an account exists with that email, a password reset code has been sent.',
    };

    // Always respond with generic success to prevent user enumeration attacks
    if (!user) {
      return res.status(200).json(genericSuccessResponse);
    }

    // Invalidate existing unused OTPs
    await prisma.otpCode.updateMany({
      where: { userId: user.id, used: false },
      data: { used: true },
    });

    // Generate new secure OTP for password reset
    const code = generate6DigitOtp();
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS);

    await prisma.otpCode.create({
      data: {
        userId: user.id,
        code,
        expiresAt,
        used: false,
      },
    });

    console.log(`\n========================================\n🔐 [SPLITUP OTP] Password Reset Code for ${normalizedEmail}: ${code}\n========================================\n`);

    // Non-blocking email dispatch
    if (process.env.SMTP_USER && process.env.SMTP_PASS) {
      sendPasswordResetOtpEmail(normalizedEmail, user.name, code).catch((mailErr) => {
        console.error('Failed to send password reset OTP email:', mailErr.message);
      });
    }

    return res.status(200).json(genericSuccessResponse);
  } catch (error) {
    console.error('Forgot password error:', error);
    next(error);
  }
});

// ── POST /reset-password ──────────────────────────────────────────────────────
router.post('/reset-password', async (req, res, next) => {
  try {
    const parsed = resetPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payload',
        errors: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }

    const { email, otp, newPassword } = parsed.data;
    const normalizedEmail = email.toLowerCase().trim();

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: {
        otpCodes: {
          where: {
            used: false,
            expiresAt: { gt: new Date() },
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    // Prevent user enumeration by using uniform error message for not found, expired, or invalid OTP
    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid or expired reset code' });
    }

    const latestOtp = user.otpCodes[0];
    if (!latestOtp || latestOtp.code !== otp.trim()) {
      return res.status(400).json({ success: false, message: 'Invalid or expired reset code' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    // Atomically invalidate all unused OTPs and update password
    await prisma.$transaction([
      prisma.otpCode.updateMany({
        where: { userId: user.id, used: false },
        data: { used: true },
      }),
      prisma.user.update({
        where: { id: user.id },
        data: { passwordHash },
      }),
    ]);

    return res.status(200).json({
      success: true,
      message: 'Password has been reset successfully. You can now sign in.',
    });
  } catch (error) {
    console.error('Reset password error:', error);
    next(error);
  }
});

// ── POST /login ───────────────────────────────────────────────────────────────
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

