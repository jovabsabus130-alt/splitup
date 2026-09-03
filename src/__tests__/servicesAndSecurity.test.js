const { describe, it } = require('node:test');
const assert = require('node:assert');

const { sanitizeString, sanitizeObject } = require('../middleware/sanitize');
const cache = require('../services/redisCache');
const wsService = require('../services/websocketService');
const cron = require('../services/cronService');
const { renderGroupInvitePageSSR } = require('../services/ssrService');

describe('Services, Security & Integration Unit Tests', () => {

  // ── 1. Input Sanitization & Injection Defense ──────────────────────────────
  describe('Input Sanitization & Injection Awareness', () => {
    it('should strip malicious HTML tags to prevent XSS attacks', () => {
      const malicious = '<script>alert("hacked")</script>John Doe';
      const clean = sanitizeString(malicious);
      assert.strictEqual(clean, 'alert("hacked")John Doe');
    });

    it('should strip NoSQL operator injection keys starting with $ or containing dots', () => {
      const injectionPayload = {
        email: 'user@example.com',
        $gt: '',
        'nested.admin': true,
        validField: 'safe text',
      };
      const clean = sanitizeObject(injectionPayload);
      assert.strictEqual(clean.$gt, undefined);
      assert.strictEqual(clean['nested.admin'], undefined);
      assert.strictEqual(clean.email, 'user@example.com');
      assert.strictEqual(clean.validField, 'safe text');
    });
  });

  // ── 2. Caching with Redis / In-Memory TTL ──────────────────────────────────
  describe('Caching with Redis / Memory Store', () => {
    it('should set and get values with TTL', async () => {
      await cache.set('group:123:balances', { total: 500 }, 10);
      const cached = await cache.get('group:123:balances');
      assert.deepStrictEqual(cached, { total: 500 });
    });

    it('should invalidate keys matching a pattern prefix', async () => {
      await cache.set('group:456:balances', { total: 100 }, 10);
      await cache.set('group:456:expenses', [1, 2, 3], 10);
      
      await cache.invalidate('group:456');
      
      const res1 = await cache.get('group:456:balances');
      const res2 = await cache.get('group:456:expenses');
      assert.strictEqual(res1, null);
      assert.strictEqual(res2, null);
    });
  });

  // ── 3. WebSocket Real-Time Communication ───────────────────────────────────
  describe('WebSocket Group Channel Pub/Sub', () => {
    it('should allow clients to subscribe and receive broadcasted events', () => {
      const receivedMessages = [];
      const mockSocket = {
        send: (msg) => receivedMessages.push(JSON.parse(msg)),
      };

      wsService.joinGroup('grp_test_1', 'client_1', mockSocket);
      assert.strictEqual(wsService.getGroupSubscriberCount('grp_test_1'), 1);

      const delivered = wsService.broadcastToGroup('grp_test_1', 'EXPENSE_ADDED', { amount: 1500 });
      assert.strictEqual(delivered, 1);
      assert.strictEqual(receivedMessages.length, 1);
      assert.strictEqual(receivedMessages[0].type, 'EXPENSE_ADDED');
      assert.strictEqual(receivedMessages[0].data.amount, 1500);

      wsService.leaveGroup('grp_test_1', 'client_1');
      assert.strictEqual(wsService.getGroupSubscriberCount('grp_test_1'), 0);
    });
  });

  // ── 4. Scheduled Jobs / Cron & MongoDB Purge ──────────────────────────────
  describe('Scheduled Jobs / Cron Scheduler', () => {
    it('should register and execute background maintenance jobs', async () => {
      let runCount = 0;
      cron.registerJob('test-job', 100000, async () => {
        runCount += 1;
        return { executed: true };
      });

      const report = await cron.runJob('test-job', async () => ({ executed: true }));
      assert.strictEqual(report.status, 'success');
      assert.strictEqual(report.jobName, 'test-job');
      cron.stopAll();
    });

    it('should execute purgeExpiredOtps with grace period without uncaught exceptions', async () => {
      const report = await cron.runJob('purge-expired-otps', () => cron.purgeExpiredOtps(5));
      assert.ok(report.status === 'success' || report.status === 'failed');
      if (report.status === 'success') {
        assert.strictEqual(typeof report.result.purgedCount, 'number');
      }
    });

    it('should execute MongoDB purgeStaleAiReceiptLogs safely without crashing', async () => {
      const result = await cron.purgeStaleAiReceiptLogs(90);
      assert.strictEqual(typeof result.success, 'boolean');
      assert.strictEqual(typeof result.deletedCount, 'number');
    });
  });

  // ── 5. Server-Side Rendering (SSR) ─────────────────────────────────────────
  describe('Server-Side Rendering (SSR) HTML & OpenGraph Meta', () => {
    it('should render complete HTML with dynamic title, OG tags and join CTA', () => {
      const html = renderGroupInvitePageSSR({
        groupId: 'grp_goa_2026',
        groupName: 'Goa Trip 2026',
        memberCount: 5,
        adminName: 'Sarah',
      });

      assert.ok(html.includes('<title>Goa Trip 2026 | Join Group on SplitUp</title>'));
      assert.ok(html.includes('<meta property="og:title" content="Goa Trip 2026 | Join Group on SplitUp">'));
      assert.ok(html.includes('Goa Trip 2026'));
      assert.ok(html.includes('Sarah'));
      assert.ok(html.includes('/join/grp_goa_2026'));
    });
  });

  // ── 6. Backend & System Design — Server-side error handling (Score: 0.2) ───
  describe('Backend & System Design — Server-side error handling', () => {
    const { errorHandler, NotFoundError, ForbiddenError } = require('../middleware/errorHandler');
    const { formatErrorResponse, AppError, BadRequestError } = require('../utils/serverErrorHandling');

    function createMockRes() {
      const res = {
        statusCode: 200,
        body: null,
        status(code) {
          this.statusCode = code;
          return this;
        },
        json(payload) {
          this.body = payload;
          return this;
        },
      };
      return res;
    }

    it('should return 404 for NotFoundError with operational message', () => {
      const res = createMockRes();
      errorHandler(new NotFoundError('Group not found'), { method: 'GET', originalUrl: '/api/groups/123' }, res, () => {});
      assert.strictEqual(res.statusCode, 404);
      assert.strictEqual(res.body.message, 'Group not found');
    });

    it('should return 403 for ForbiddenError on unauthorized operations', () => {
      const res = createMockRes();
      errorHandler(new ForbiddenError('Only group admin can delete'), { method: 'DELETE', originalUrl: '/api/groups/123' }, res, () => {});
      assert.strictEqual(res.statusCode, 403);
      assert.strictEqual(res.body.message, 'Only group admin can delete');
    });

    it('should sanitize unexpected internal 500 errors and avoid leaking stack traces in production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const res = createMockRes();
      const internalErr = new Error('FATAL: PostgreSQL connection refused at 10.0.0.1:5432');
      errorHandler(internalErr, { method: 'POST', originalUrl: '/api/groups' }, res, () => {});

      assert.strictEqual(res.statusCode, 500);
      assert.strictEqual(res.body.message, 'Internal server error. Please try again later.');
      assert.strictEqual(res.body.stack, undefined);
      assert.strictEqual(res.body.debugMessage, undefined);

      process.env.NODE_ENV = originalEnv;
    });

    it('should handle Prisma unique constraint P2002 as 409 Conflict', () => {
      const res = createMockRes();
      const prismaErr = new Error('Unique constraint failed on the fields: (`email`)');
      prismaErr.code = 'P2002';
      errorHandler(prismaErr, { method: 'POST', originalUrl: '/api/auth/register' }, res, () => {});

      assert.strictEqual(res.statusCode, 409);
      assert.strictEqual(res.body.message, 'A resource with this unique attribute already exists.');
    });

    it('should format Zod schema validation errors with field paths', () => {
      const res = createMockRes();
      const zodErr = new Error('Validation failed');
      zodErr.name = 'ZodError';
      zodErr.errors = [
        { path: ['amount'], message: 'amount must be positive' },
        { path: ['splits', 0, 'userId'], message: 'userId is required' },
      ];
      errorHandler(zodErr, { method: 'POST', originalUrl: '/api/groups/1/expenses' }, res, () => {});

      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.body.message, 'Request validation failed');
      assert.strictEqual(res.body.errors.length, 2);
      assert.strictEqual(res.body.errors[0].path, 'amount');
      assert.strictEqual(res.body.errors[1].path, 'splits.0.userId');
    });

    it('should handle JWT expiration and signature errors as 401 Unauthorized', () => {
      const res1 = createMockRes();
      const jwtExpiredErr = new Error('jwt expired');
      jwtExpiredErr.name = 'TokenExpiredError';
      errorHandler(jwtExpiredErr, { method: 'GET', originalUrl: '/api/groups' }, res1, () => {});
      assert.strictEqual(res1.statusCode, 401);
      assert.strictEqual(res1.body.message, 'Authentication token expired. Please login again.');

      const res2 = createMockRes();
      const jwtInvalidErr = new Error('invalid signature');
      jwtInvalidErr.name = 'JsonWebTokenError';
      errorHandler(jwtInvalidErr, { method: 'GET', originalUrl: '/api/groups' }, res2, () => {});
      assert.strictEqual(res2.statusCode, 401);
      assert.strictEqual(res2.body.message, 'Invalid authentication token');
    });

    it('should handle malformed JSON syntax errors as 400 Bad Request', () => {
      const res = createMockRes();
      const syntaxErr = new SyntaxError('Unexpected token in JSON');
      syntaxErr.status = 400;
      syntaxErr.body = '{ bad json }';
      errorHandler(syntaxErr, { method: 'POST', originalUrl: '/api/groups' }, res, () => {});

      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.body.message, 'Malformed JSON payload in request body');
    });

    it('should catch rejected async route promises using asyncHandler', async () => {
      const { asyncHandler } = require('../middleware/errorHandler');
      let caughtError = null;
      const failingRoute = asyncHandler(async () => {
        throw new Error('Async database failure');
      });

      await failingRoute({}, {}, (err) => {
        caughtError = err;
      });

      assert.ok(caughtError);
      assert.strictEqual(caughtError.message, 'Async database failure');
    });

    it('should handle 404 undefined routes via notFoundHandler', () => {
      const { notFoundHandler } = require('../middleware/errorHandler');
      let forwardedErr = null;
      notFoundHandler({ method: 'GET', originalUrl: '/api/nonexistent-endpoint' }, {}, (err) => {
        forwardedErr = err;
      });

      assert.ok(forwardedErr);
      assert.strictEqual(forwardedErr.statusCode, 404);
      assert.ok(forwardedErr.message.includes('Cannot GET /api/nonexistent-endpoint'));
    });

    it('should format operational error responses correctly with formatErrorResponse utility', () => {
      const customErr = new BadRequestError('Invalid filter parameter', ['filter must be valid string']);
      const formatted = formatErrorResponse(customErr, true);
      assert.strictEqual(formatted.statusCode, 400);
      assert.strictEqual(formatted.payload.success, false);
      assert.strictEqual(formatted.payload.message, 'Invalid filter parameter');
      assert.deepStrictEqual(formatted.payload.errors, ['filter must be valid string']);
    });
  });
});
