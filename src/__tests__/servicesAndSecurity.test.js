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

  // ── 4. Scheduled Jobs / Cron ───────────────────────────────────────────────
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
});
