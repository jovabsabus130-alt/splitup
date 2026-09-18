process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_jwt_secret_123';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const jwt = require('jsonwebtoken');

const prisma = require('../lib/prisma');
const authRouter = require('../routes/auth');

function createMockReq(method = 'GET', body = {}, token = null) {
  return {
    method,
    body,
    headers: token ? { authorization: `Bearer ${token}` } : {},
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
    const done = (err) => {
      if (!finished) {
        finished = true;
        if (err) return reject(err);
        resolve(res);
      }
    };
    try {
      router(req, res, done);
    } catch (err) {
      reject(err);
    }
  });
}

describe('User Profile & Rename Feature Unit Tests', () => {
  let originalFindUnique;
  let originalUpdate;
  let mockUser;

  beforeEach(() => {
    mockUser = {
      id: 'user_12345',
      name: 'Old Name',
      email: 'user@example.com',
      phone: null,
      upiId: null,
      emailVerified: true,
      createdAt: new Date(),
    };

    originalFindUnique = prisma.user.findUnique;
    originalUpdate = prisma.user.update;

    prisma.user.findUnique = async ({ where }) => {
      if (where.id === mockUser.id || where.email === mockUser.email) {
        return mockUser;
      }
      return null;
    };

    prisma.user.update = async ({ where, data }) => {
      if (where.id === mockUser.id) {
        mockUser = { ...mockUser, ...data };
        return mockUser;
      }
      throw new Error('User not found');
    };
  });

  afterEach(() => {
    prisma.user.findUnique = originalFindUnique;
    prisma.user.update = originalUpdate;
  });

  it('1. GET /me should return the authenticated user profile', async () => {
    const token = jwt.sign({ userId: 'user_12345' }, process.env.JWT_SECRET);
    const req = createMockReq('GET', {}, token);
    const res = createMockRes();

    await callRouter(authRouter, 'GET', '/me', req, res);

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.data.success, true);
    assert.strictEqual(res.data.user.name, 'Old Name');
    assert.strictEqual(res.data.user.email, 'user@example.com');
  });

  it('2. PUT /profile should rename the user and persist', async () => {
    const token = jwt.sign({ userId: 'user_12345' }, process.env.JWT_SECRET);
    const req = createMockReq('PUT', { name: 'Jovab Sabu (Renamed)', upiId: 'jovab@upi' }, token);
    const res = createMockRes();

    await callRouter(authRouter, 'PUT', '/profile', req, res);

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.data.success, true);
    assert.strictEqual(res.data.user.name, 'Jovab Sabu (Renamed)');
    assert.strictEqual(res.data.user.upiId, 'jovab@upi');
    assert.strictEqual(mockUser.name, 'Jovab Sabu (Renamed)');
  });

  it('3. PUT /profile should reject empty names with 400 Bad Request', async () => {
    const token = jwt.sign({ userId: 'user_12345' }, process.env.JWT_SECRET);
    const req = createMockReq('PUT', { name: '   ' }, token);
    const res = createMockRes();

    await callRouter(authRouter, 'PUT', '/profile', req, res);

    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.data.success, false);
  });
});
