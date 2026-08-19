const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
  legacyCalculateSplitCallback,
  calculateSplitPromise,
  computeMultipleGroupSplits,
  computeTaxAddition,
  demonstrateHoistingRules,
  createExpenseRateLimiter,
} = require('../utils/jsCoreConcepts');

describe('JavaScript Core Concepts & Engine Behavior Unit Tests', () => {

  // ── 1. Event Loop & Microtasks vs Macrotasks ───────────────────────────────
  describe('JavaScript — Event Loop', () => {
    it('should process microtasks (Promises) before macrotasks (setTimeout)', async () => {
      const order = [];

      order.push('sync-1');

      setTimeout(() => {
        order.push('macrotask-timeout');
      }, 0);

      Promise.resolve().then(() => {
        order.push('microtask-promise');
      });

      order.push('sync-2');

      // Wait 10ms for all queued tasks to settle
      await new Promise((res) => setTimeout(res, 10));

      assert.deepStrictEqual(order, [
        'sync-1',
        'sync-2',
        'microtask-promise',
        'macrotask-timeout',
      ]);
    });
  });

  // ── 2. Promises vs Callbacks ───────────────────────────────────────────────
  describe('JavaScript — Promises vs Callbacks', () => {
    it('should handle legacy error-first callbacks successfully', (t, done) => {
      legacyCalculateSplitCallback(600, 3, (err, res) => {
        assert.strictEqual(err, null);
        assert.strictEqual(res.perPersonShare, 200);
        done();
      });
    });

    it('should handle errors in legacy callback pattern', (t, done) => {
      legacyCalculateSplitCallback(-100, 3, (err, res) => {
        assert.ok(err instanceof Error);
        assert.strictEqual(res, null);
        done();
      });
    });

    it('should resolve modern Promise-based async split calculation', async () => {
      const res = await calculateSplitPromise(1200, 4);
      assert.strictEqual(res.totalAmount, 1200);
      assert.strictEqual(res.perPersonShare, 300);
    });

    it('should reject Promise on invalid input', async () => {
      await assert.rejects(
        async () => {
          await calculateSplitPromise(1200, 0);
        },
        {
          name: 'Error',
          message: 'Member count must be greater than 0',
        }
      );
    });

    it('should compute concurrent splits with Promise.all', async () => {
      const batch = [
        { amount: 300, count: 3 },
        { amount: 500, count: 2 },
      ];
      const results = await computeMultipleGroupSplits(batch);
      assert.strictEqual(results.length, 2);
      assert.strictEqual(results[0].perPersonShare, 100);
      assert.strictEqual(results[1].perPersonShare, 250);
    });
  });

  // ── 3. Hoisting ────────────────────────────────────────────────────────────
  describe('JavaScript — Hoisting', () => {
    it('should hoist function declarations allowing pre-declaration invocation', () => {
      // computeTaxAddition is declared below its caller in source file
      const total = computeTaxAddition(200, 10);
      assert.strictEqual(total, 220);
    });

    it('should verify hoisting rules and TDZ boundaries', () => {
      const report = demonstrateHoistingRules();
      assert.strictEqual(report.functionDeclarationHoisted, true);
      assert.strictEqual(report.taxCalculation, 118);
      assert.strictEqual(report.blockScopedConst, 'Safe within TDZ boundary');
    });
  });

  // ── 4. Closures ────────────────────────────────────────────────────────────
  describe('JavaScript — Closures', () => {
    it('should retain lexical state across multiple invocations', () => {
      const limiter = createExpenseRateLimiter(2);
      assert.strictEqual(limiter().allowed, true);
      assert.strictEqual(limiter().allowed, true);
      assert.strictEqual(limiter().allowed, false); // Exceeded 2 requests
    });
  });
});
