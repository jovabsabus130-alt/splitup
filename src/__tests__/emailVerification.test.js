process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_jwt_secret_123';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const prisma = require('../lib/prisma');
const authRouter = require('../routes/auth');
const { setTransporter, sendOtpEmail } = require('../services/emailService');

function createMockReq(body = {}, headers = {}) {
  return {
    body,
    headers,
    method: 'POST',
    url: '',
    originalUrl: '',
  };
}

function createMockRes() {
  const res = {
    statusCode: 200,
    data: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.data = payload;
      return this;
    },
  };
  return res;
}

// Helper to invoke an express router route handler directly
async function callRouter(router, method, path, req, res) {
  return new Promise((resolve, reject) => {
    req.method = method;
    req.url = path;
    let finished = false;
    const done = () => {
      if (!finished) {
        finished = true;
        resolve(res);
      }
    };
    const originalJson = res.json.bind(res);
    res.json = (payload) => {
      originalJson(payload);
      done();
      return res;
    };
    router(req, res, (err) => {
      if (err) {
        if (!finished) {
          finished = true;
          reject(err);
        }
      } else {
        done();
      }
    });
  });
}

describe('Email Verification & OTP Lifecycle Tests', () => {
  // In-memory mock DB state to ensure isolated, hermetic, and deterministic tests
  let usersTable = [];
  let otpCodesTable = [];
  let sentEmails = [];

  const originalFindUnique = prisma.user.findUnique;
  const originalCreate = prisma.user.create;
  const originalUpdate = prisma.user.update;
  const originalOtpCreate = prisma.otpCode.create;
  const originalOtpUpdate = prisma.otpCode.update;
  const originalOtpUpdateMany = prisma.otpCode.updateMany;
  const originalTransaction = prisma.$transaction;

  beforeEach(() => {
    usersTable = [];
    otpCodesTable = [];
    sentEmails = [];

    // Mock email transporter
    setTransporter({
      sendMail: async (options) => {
        sentEmails.push(options);
        return { messageId: 'mock-mail-id-123' };
      },
    });

    // Mock Prisma User methods
    prisma.user.findUnique = async ({ where, include, select }) => {
      let user = null;
      if (where.id) user = usersTable.find((u) => u.id === where.id);
      if (where.email) user = usersTable.find((u) => u.email === where.email);
      if (!user) return null;

      const userCopy = { ...user };
      if (include && include.otpCodes) {
        let codes = otpCodesTable.filter((o) => o.userId === user.id);
        if (include.otpCodes.where) {
          if (include.otpCodes.where.used !== undefined) {
            codes = codes.filter((o) => o.used === include.otpCodes.where.used);
          }
          if (include.otpCodes.where.expiresAt && include.otpCodes.where.expiresAt.gt) {
            const threshold = include.otpCodes.where.expiresAt.gt;
            codes = codes.filter((o) => new Date(o.expiresAt) > threshold);
          }
        }
        if (include.otpCodes.orderBy && include.otpCodes.orderBy.createdAt === 'desc') {
          codes.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        }
        if (include.otpCodes.take) {
          codes = codes.slice(0, include.otpCodes.take);
        }
        userCopy.otpCodes = codes;
      }
      return userCopy;
    };

    prisma.user.create = async ({ data }) => {
      const newUser = {
        id: 'user_' + (usersTable.length + 1),
        name: data.name,
        email: data.email,
        passwordHash: data.passwordHash,
        phone: data.phone || null,
        upiId: data.upiId || null,
        emailVerified: data.emailVerified || false,
        createdAt: new Date(),
      };
      usersTable.push(newUser);
      return newUser;
    };

    prisma.user.update = async ({ where, data }) => {
      const idx = usersTable.findIndex((u) => u.id === where.id);
      if (idx !== -1) {
        usersTable[idx] = { ...usersTable[idx], ...data };
        return usersTable[idx];
      }
      throw new Error('User not found');
    };

    // Mock Prisma OtpCode methods
    prisma.otpCode.create = async ({ data }) => {
      const newOtp = {
        id: 'otp_' + (otpCodesTable.length + 1),
        userId: data.userId,
        code: data.code,
        expiresAt: new Date(data.expiresAt),
        used: data.used || false,
        createdAt: new Date(),
      };
      otpCodesTable.push(newOtp);
      return newOtp;
    };

    prisma.otpCode.update = async ({ where, data }) => {
      const idx = otpCodesTable.findIndex((o) => o.id === where.id);
      if (idx !== -1) {
        otpCodesTable[idx] = { ...otpCodesTable[idx], ...data };
        return otpCodesTable[idx];
      }
      throw new Error('OtpCode not found');
    };

    prisma.otpCode.updateMany = async ({ where, data }) => {
      let count = 0;
      for (let i = 0; i < otpCodesTable.length; i++) {
        let match = true;
        if (where.userId && otpCodesTable[i].userId !== where.userId) match = false;
        if (where.used !== undefined && otpCodesTable[i].used !== where.used) match = false;
        if (match) {
          otpCodesTable[i] = { ...otpCodesTable[i], ...data };
          count++;
        }
      }
      return { count };
    };

    prisma.$transaction = async (promisesOrArray) => {
      if (Array.isArray(promisesOrArray)) {
        return Promise.all(promisesOrArray);
      }
      return promisesOrArray(prisma);
    };
  });

  afterEach(() => {
    prisma.user.findUnique = originalFindUnique;
    prisma.user.create = originalCreate;
    prisma.user.update = originalUpdate;
    prisma.otpCode.create = originalOtpCreate;
    prisma.otpCode.update = originalOtpUpdate;
    prisma.otpCode.updateMany = originalOtpUpdateMany;
    prisma.$transaction = originalTransaction;
  });

  describe('1. Registration Flow & Initial OTP Creation', () => {
    it('should defer DB user creation until OTP verification and send OTP code', async () => {
      const req = createMockReq({
        name: 'Alice Johnson',
        email: 'alice@example.com',
        password: 'securePassword123',
      });
      const res = createMockRes();

      await callRouter(authRouter, 'POST', '/register', req, res);

      assert.strictEqual(res.statusCode, 201);
      assert.strictEqual(res.data.success, true);
      assert.strictEqual(res.data.requireVerification, true);
      assert.strictEqual(res.data.email, 'alice@example.com');

      // Verify user is NOT yet saved to DB before OTP verification
      assert.strictEqual(usersTable.length, 0);
    });
  });

  describe('2. Email Verification Flow (POST /api/auth/verify-email)', () => {
    it('should verify email successfully with valid OTP, set emailVerified=true, and return auth token', async () => {
      // Setup unverified user with active OTP
      const user = await prisma.user.create({
        data: {
          name: 'Bob Smith',
          email: 'bob@example.com',
          passwordHash: 'hash123',
          emailVerified: false,
        },
      });
      const validCode = '582914';
      await prisma.otpCode.create({
        data: {
          userId: user.id,
          code: validCode,
          expiresAt: new Date(Date.now() + 10 * 60 * 1000),
          used: false,
        },
      });

      const req = createMockReq({
        email: 'bob@example.com',
        otp: validCode,
      });
      const res = createMockRes();

      await callRouter(authRouter, 'POST', '/verify-email', req, res);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.data.success, true);
      assert.strictEqual(res.data.message, 'Email verified successfully');
      assert.strictEqual(res.data.user.emailVerified, true);
      assert.ok(res.data.token);

      // Verify DB state
      const updatedUser = usersTable.find((u) => u.id === user.id);
      assert.strictEqual(updatedUser.emailVerified, true);
      assert.strictEqual(otpCodesTable[0].used, true);
    });

    it('should reject verification when using the same OTP a second time (single-use check)', async () => {
      const user = await prisma.user.create({
        data: {
          name: 'Charlie',
          email: 'charlie@example.com',
          passwordHash: 'hash123',
          emailVerified: false,
        },
      });
      const otpCode = '123456';
      await prisma.otpCode.create({
        data: {
          userId: user.id,
          code: otpCode,
          expiresAt: new Date(Date.now() + 10 * 60 * 1000),
          used: false,
        },
      });

      // First verification succeeds
      const req1 = createMockReq({ email: 'charlie@example.com', otp: otpCode });
      const res1 = createMockRes();
      await callRouter(authRouter, 'POST', '/verify-email', req1, res1);
      assert.strictEqual(res1.statusCode, 200);

      // Second verification attempt with identical OTP must fail
      const req2 = createMockReq({ email: 'charlie@example.com', otp: otpCode });
      const res2 = createMockRes();
      await callRouter(authRouter, 'POST', '/verify-email', req2, res2);

      assert.strictEqual(res2.statusCode, 400);
      assert.strictEqual(res2.data.success, false);
      assert.strictEqual(res2.data.message, 'Invalid or expired verification code');
    });

    it('should reject verification when OTP has expired', async () => {
      const user = await prisma.user.create({
        data: {
          name: 'Dave',
          email: 'dave@example.com',
          passwordHash: 'hash123',
          emailVerified: false,
        },
      });
      const expiredCode = '654321';
      // Expired 5 minutes ago
      await prisma.otpCode.create({
        data: {
          userId: user.id,
          code: expiredCode,
          expiresAt: new Date(Date.now() - 5 * 60 * 1000),
          used: false,
        },
      });

      const req = createMockReq({ email: 'dave@example.com', otp: expiredCode });
      const res = createMockRes();
      await callRouter(authRouter, 'POST', '/verify-email', req, res);

      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.data.success, false);
      assert.strictEqual(res.data.message, 'Invalid or expired verification code');
      assert.strictEqual(usersTable[0].emailVerified, false);
    });

    it('should reject verification when an invalid/mismatched OTP code is supplied', async () => {
      const user = await prisma.user.create({
        data: {
          name: 'Eve',
          email: 'eve@example.com',
          passwordHash: 'hash123',
          emailVerified: false,
        },
      });
      await prisma.otpCode.create({
        data: {
          userId: user.id,
          code: '111222',
          expiresAt: new Date(Date.now() + 10 * 60 * 1000),
          used: false,
        },
      });

      const req = createMockReq({ email: 'eve@example.com', otp: '999999' });
      const res = createMockRes();
      await callRouter(authRouter, 'POST', '/verify-email', req, res);

      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.data.message, 'Invalid or expired verification code');
      assert.strictEqual(usersTable[0].emailVerified, false);
    });
  });

  describe('3. Resend Verification Flow (POST /api/auth/resend-verification)', () => {
    it('should invalidate old unused OTPs and create a fresh active OTP', async () => {
      const user = await prisma.user.create({
        data: {
          name: 'Frank',
          email: 'frank@example.com',
          passwordHash: 'hash123',
          emailVerified: false,
        },
      });
      const oldCode = '111111';
      await prisma.otpCode.create({
        data: {
          userId: user.id,
          code: oldCode,
          expiresAt: new Date(Date.now() + 10 * 60 * 1000),
          used: false,
        },
      });

      const reqResend = createMockReq({ email: 'frank@example.com' });
      const resResend = createMockRes();
      await callRouter(authRouter, 'POST', '/resend-verification', reqResend, resResend);

      assert.strictEqual(resResend.statusCode, 200);
      assert.strictEqual(resResend.data.success, true);

      // Verify old OTP was marked as used: true
      const oldOtp = otpCodesTable.find((o) => o.code === oldCode);
      assert.strictEqual(oldOtp.used, true);

      // Verify new OTP was created and is active
      const newOtp = otpCodesTable.find((o) => o.code !== oldCode);
      assert.ok(newOtp);
      assert.strictEqual(newOtp.used, false);
      assert.strictEqual(newOtp.code.length, 6);

      // Verify that attempting to use the old OTP code now fails
      const reqOld = createMockReq({ email: 'frank@example.com', otp: oldCode });
      const resOld = createMockRes();
      await callRouter(authRouter, 'POST', '/verify-email', reqOld, resOld);
      assert.strictEqual(resOld.statusCode, 400);
      assert.strictEqual(resOld.data.message, 'Invalid or expired verification code');

      // Verify that the new OTP code succeeds
      const reqNew = createMockReq({ email: 'frank@example.com', otp: newOtp.code });
      const resNew = createMockRes();
      await callRouter(authRouter, 'POST', '/verify-email', reqNew, resNew);
      assert.strictEqual(resNew.statusCode, 200);
      assert.strictEqual(resNew.data.user.emailVerified, true);
    });
  });

  describe('4. Anti-Enumeration & Security Safeguards', () => {
    it('should not reveal whether an email exists when requesting resend-verification', async () => {
      const req = createMockReq({ email: 'nonexistent@example.com' });
      const res = createMockRes();

      await callRouter(authRouter, 'POST', '/resend-verification', req, res);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.data.success, true);
      assert.strictEqual(
        res.data.message,
        'If an account exists with that email, a verification code has been sent.'
      );
    });

    it('should return uniform error response when verifying a non-existent email', async () => {
      const req = createMockReq({ email: 'ghost@example.com', otp: '123456' });
      const res = createMockRes();

      await callRouter(authRouter, 'POST', '/verify-email', req, res);

      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.data.success, false);
      assert.strictEqual(res.data.message, 'Invalid or expired verification code');
    });

    it('should not trust or use client-supplied userId', async () => {
      const user = await prisma.user.create({
        data: {
          name: 'Grace',
          email: 'grace@example.com',
          passwordHash: 'hash123',
          emailVerified: false,
        },
      });
      const validCode = '777888';
      await prisma.otpCode.create({
        data: {
          userId: user.id,
          code: validCode,
          expiresAt: new Date(Date.now() + 10 * 60 * 1000),
          used: false,
        },
      });

      // Pass spoofed userId in body
      const req = createMockReq({
        email: 'grace@example.com',
        otp: validCode,
        userId: 'spoofed_admin_id',
      });
      const res = createMockRes();

      await callRouter(authRouter, 'POST', '/verify-email', req, res);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.data.user.id, user.id);
      assert.strictEqual(res.data.user.email, 'grace@example.com');
    });
  });

  describe('5. Zod Payload Validation', () => {
    it('should fail with 400 when verify-email payload has malformed email or invalid OTP length', async () => {
      const req1 = createMockReq({ email: 'not-an-email', otp: '123456' });
      const res1 = createMockRes();
      await callRouter(authRouter, 'POST', '/verify-email', req1, res1);
      assert.strictEqual(res1.statusCode, 400);
      assert.strictEqual(res1.data.success, false);

      const req2 = createMockReq({ email: 'valid@example.com', otp: '123' }); // short OTP
      const res2 = createMockRes();
      await callRouter(authRouter, 'POST', '/verify-email', req2, res2);
      assert.strictEqual(res2.statusCode, 400);
      assert.strictEqual(res2.data.success, false);
    });

    it('should fail with 400 when resend-verification has invalid email format', async () => {
      const req = createMockReq({ email: 'invalid-email-address' });
      const res = createMockRes();
      await callRouter(authRouter, 'POST', '/resend-verification', req, res);
      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.data.success, false);
    });
  });

  describe('6. Email Service Dispatch', () => {
    it('should format and dispatch verification email via sendOtpEmail', async () => {
      process.env.SMTP_USER = 'test_sender@example.com';
      process.env.SMTP_PASS = 'app_password';

      const result = await sendOtpEmail('test_recipient@example.com', 'Test User', '987654');
      assert.ok(result);
      assert.strictEqual(sentEmails.length, 1);
      assert.strictEqual(sentEmails[0].to, 'test_recipient@example.com');
      assert.ok(sentEmails[0].text.includes('987654'));
      assert.ok(sentEmails[0].html.includes('987654'));
    });
  });
});
