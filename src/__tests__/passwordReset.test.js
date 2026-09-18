process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_jwt_secret_123';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const bcrypt = require('bcrypt');

const prisma = require('../lib/prisma');
const authRouter = require('../routes/auth');
const { setTransporter } = require('../services/emailService');

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

describe('Forgot Password & Password Reset Lifecycle Tests', () => {
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
        return { messageId: 'mock-mail-id-pwd-reset' };
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

  describe('1. Forgot Password Request (POST /api/auth/forgot-password)', () => {
    it('should generate OTP and dispatch reset email for an existing email without leaking token in API response', async () => {
      const oldHash = await bcrypt.hash('oldPassword123', 10);
      await prisma.user.create({
        data: {
          name: 'Alice User',
          email: 'alice@example.com',
          passwordHash: oldHash,
          emailVerified: true,
        },
      });

      const req = createMockReq({ email: 'alice@example.com' });
      const res = createMockRes();

      await callRouter(authRouter, 'POST', '/forgot-password', req, res);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.data.success, true);
      assert.strictEqual(
        res.data.message,
        'A password reset code has been sent to your email.'
      );
      // Security: never return reset token in response
      assert.strictEqual(res.data.otp, undefined);
      assert.strictEqual(res.data.token, undefined);

      // Verify OTP was stored in DB
      assert.strictEqual(otpCodesTable.length, 1);
      assert.strictEqual(otpCodesTable[0].used, false);
      assert.strictEqual(otpCodesTable[0].code.length, 6);
      assert.ok(new Date(otpCodesTable[0].expiresAt) > new Date());
    });

    it('should return 404 with notRegistered flag for a non-existing email without creating OTP', async () => {
      const req = createMockReq({ email: 'ghost@example.com' });
      const res = createMockRes();

      await callRouter(authRouter, 'POST', '/forgot-password', req, res);

      assert.strictEqual(res.statusCode, 404);
      assert.strictEqual(res.data.success, false);
      assert.strictEqual(res.data.notRegistered, true);
      assert.strictEqual(
        res.data.message,
        'No account found with this email address. Please create an account first.'
      );
      assert.strictEqual(otpCodesTable.length, 0);
    });
  });

  describe('2. Password Reset Flow (POST /api/auth/reset-password)', () => {
    it('should successfully reset password with valid OTP, hash new password with bcrypt, and invalidate OTP', async () => {
      const initialPassword = 'oldPassword123';
      const newPassword = 'newSecretPassword456';
      const oldHash = await bcrypt.hash(initialPassword, 10);

      const user = await prisma.user.create({
        data: {
          name: 'Bob User',
          email: 'bob@example.com',
          passwordHash: oldHash,
          emailVerified: true,
        },
      });

      const resetCode = '391827';
      await prisma.otpCode.create({
        data: {
          userId: user.id,
          code: resetCode,
          expiresAt: new Date(Date.now() + 10 * 60 * 1000),
          used: false,
        },
      });

      const reqReset = createMockReq({
        email: 'bob@example.com',
        otp: resetCode,
        newPassword,
      });
      const resReset = createMockRes();

      await callRouter(authRouter, 'POST', '/reset-password', reqReset, resReset);

      assert.strictEqual(resReset.statusCode, 200);
      assert.strictEqual(resReset.data.success, true);
      assert.strictEqual(
        resReset.data.message,
        'Password has been reset successfully. You can now sign in.'
      );

      // Verify OTP is marked used
      assert.strictEqual(otpCodesTable[0].used, true);

      // Verify new password is validly hashed and different from old hash
      const updatedUser = usersTable.find((u) => u.id === user.id);
      assert.notStrictEqual(updatedUser.passwordHash, oldHash);
      const isNewMatch = await bcrypt.compare(newPassword, updatedUser.passwordHash);
      assert.strictEqual(isNewMatch, true);
    });

    it('should reject reset attempt when using an expired OTP', async () => {
      const oldHash = await bcrypt.hash('pass123456', 10);
      const user = await prisma.user.create({
        data: {
          name: 'Charlie',
          email: 'charlie@example.com',
          passwordHash: oldHash,
          emailVerified: true,
        },
      });

      const expiredCode = '999888';
      await prisma.otpCode.create({
        data: {
          userId: user.id,
          code: expiredCode,
          expiresAt: new Date(Date.now() - 2 * 60 * 1000), // Expired 2 min ago
          used: false,
        },
      });

      const req = createMockReq({
        email: 'charlie@example.com',
        otp: expiredCode,
        newPassword: 'newPassword999',
      });
      const res = createMockRes();

      await callRouter(authRouter, 'POST', '/reset-password', req, res);

      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.data.success, false);
      assert.strictEqual(res.data.message, 'Invalid or expired reset code');

      // Password must remain unchanged
      assert.strictEqual(usersTable[0].passwordHash, oldHash);
    });

    it('should reject reset attempt when using an already used OTP token', async () => {
      const oldHash = await bcrypt.hash('initialPass123', 10);
      const user = await prisma.user.create({
        data: {
          name: 'Dave',
          email: 'dave@example.com',
          passwordHash: oldHash,
          emailVerified: true,
        },
      });

      const usedCode = '555444';
      await prisma.otpCode.create({
        data: {
          userId: user.id,
          code: usedCode,
          expiresAt: new Date(Date.now() + 10 * 60 * 1000),
          used: true, // Already consumed
        },
      });

      const req = createMockReq({
        email: 'dave@example.com',
        otp: usedCode,
        newPassword: 'attemptedNewPassword123',
      });
      const res = createMockRes();

      await callRouter(authRouter, 'POST', '/reset-password', req, res);

      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.data.success, false);
      assert.strictEqual(res.data.message, 'Invalid or expired reset code');
      assert.strictEqual(usersTable[0].passwordHash, oldHash);
    });
  });

  describe('3. Login Verification after Password Reset', () => {
    it('should succeed logging in with new password and fail when using old password', async () => {
      const oldPassword = 'originalPassword123';
      const newPassword = 'updatedPassword456';
      const oldHash = await bcrypt.hash(oldPassword, 10);

      const user = await prisma.user.create({
        data: {
          name: 'Eve Smith',
          email: 'eve@example.com',
          passwordHash: oldHash,
          emailVerified: true,
        },
      });

      // Request forgot password
      const reqForgot = createMockReq({ email: 'eve@example.com' });
      const resForgot = createMockRes();
      await callRouter(authRouter, 'POST', '/forgot-password', reqForgot, resForgot);
      assert.strictEqual(resForgot.statusCode, 200);

      const activeOtp = otpCodesTable.find((o) => o.userId === user.id && !o.used);
      assert.ok(activeOtp);

      // Perform password reset
      const reqReset = createMockReq({
        email: 'eve@example.com',
        otp: activeOtp.code,
        newPassword,
      });
      const resReset = createMockRes();
      await callRouter(authRouter, 'POST', '/reset-password', reqReset, resReset);
      assert.strictEqual(resReset.statusCode, 200);

      // Try login with old password -> must fail
      const reqOldLogin = createMockReq({ email: 'eve@example.com', password: oldPassword });
      const resOldLogin = createMockRes();
      await callRouter(authRouter, 'POST', '/login', reqOldLogin, resOldLogin);
      assert.strictEqual(resOldLogin.statusCode, 401);
      assert.strictEqual(resOldLogin.data.success, false);

      // Try login with new password -> must succeed
      const reqNewLogin = createMockReq({ email: 'eve@example.com', password: newPassword });
      const resNewLogin = createMockRes();
      await callRouter(authRouter, 'POST', '/login', reqNewLogin, resNewLogin);
      assert.strictEqual(resNewLogin.statusCode, 200);
      assert.strictEqual(resNewLogin.data.success, true);
      assert.strictEqual(resNewLogin.data.user.email, 'eve@example.com');
      assert.ok(resNewLogin.data.token);
    });
  });
});
