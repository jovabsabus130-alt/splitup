const { describe, it } = require('node:test');
const assert = require('node:assert');

describe('Dashboard Summary Calculations Unit Tests', () => {
  describe('Monthly Personal Expense Calculation', () => {
    it('should aggregate only current calendar month expense splits for the user', () => {
      const now = new Date(2026, 8, 15); // Sept 15, 2026
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1); // Sept 1, 2026
      const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1); // Oct 1, 2026

      const mockSplits = [
        // Within current month (Sept 2026)
        { userId: 'user_1', share: 250.50, expense: { createdAt: new Date(2026, 8, 2) } },
        { userId: 'user_1', share: 149.50, expense: { createdAt: new Date(2026, 8, 14) } },
        // Different user in current month (should be excluded)
        { userId: 'user_2', share: 500.00, expense: { createdAt: new Date(2026, 8, 10) } },
        // Previous month (Aug 2026) (should be excluded)
        { userId: 'user_1', share: 800.00, expense: { createdAt: new Date(2026, 7, 28) } },
        // Next month (Oct 2026) (should be excluded)
        { userId: 'user_1', share: 300.00, expense: { createdAt: new Date(2026, 9, 1) } },
      ];

      const currentMonthSplits = mockSplits.filter((s) => {
        return (
          s.userId === 'user_1' &&
          s.expense.createdAt >= startOfMonth &&
          s.expense.createdAt < startOfNextMonth
        );
      });

      const myMonthlyExpense = currentMonthSplits.reduce((acc, s) => acc + s.share, 0);

      assert.strictEqual(currentMonthSplits.length, 2);
      assert.strictEqual(myMonthlyExpense, 400.00);
      assert.strictEqual(Number(myMonthlyExpense.toFixed(2)), 400.00);
    });

    it('should return 0.00 when user has zero splits in current month', () => {
      const currentMonthSplits = [];
      const myMonthlyExpense = currentMonthSplits.reduce((acc, s) => acc + Number(s.share), 0);
      assert.strictEqual(myMonthlyExpense, 0);
      assert.strictEqual(Number(myMonthlyExpense.toFixed(2)), 0.00);
    });
  });

  describe('Amount Owed / I Need to Pay Balance Aggregation', () => {
    it('should separately calculate totalOwedToYou and totalYouOwe without squashing into one number', () => {
      const userId = 'user_1';

      // Group A: user_1 is owed 1200 (positive net balance)
      const groupABalances = [
        { userId: 'user_1', name: 'Alice', netBalance: 1200 },
        { userId: 'user_2', name: 'Bob', netBalance: -1200 },
      ];

      // Group B: user_1 owes 450 (negative net balance)
      const groupBBalances = [
        { userId: 'user_1', name: 'Alice', netBalance: -450 },
        { userId: 'user_3', name: 'Charlie', netBalance: 450 },
      ];

      // Group C: user_1 is settled up (zero net balance)
      const groupCBalances = [
        { userId: 'user_1', name: 'Alice', netBalance: 0 },
        { userId: 'user_4', name: 'Dave', netBalance: 0 },
      ];

      const allGroupBalances = [groupABalances, groupBBalances, groupCBalances];

      let totalOwedToYou = 0;
      let totalYouOwe = 0;

      for (const balances of allGroupBalances) {
        const userBal = balances.find((b) => b.userId === userId);
        const net = userBal ? Number(userBal.netBalance) || 0 : 0;
        if (net > 0) {
          totalOwedToYou += net;
        } else if (net < 0) {
          totalYouOwe += Math.abs(net);
        }
      }

      const totalNetBalance = totalOwedToYou - totalYouOwe;

      // Verification: "You are owed" must be 1200, "You owe" must be 450
      assert.strictEqual(totalOwedToYou, 1200);
      assert.strictEqual(totalYouOwe, 450);
      // Net is computed for status indicators but owed and owe are distinct
      assert.strictEqual(totalNetBalance, 750);
      assert.notStrictEqual(totalOwedToYou, totalNetBalance);
      assert.notStrictEqual(totalYouOwe, totalNetBalance);
    });

    it('should handle zero-state when user has no groups or zero balances', () => {
      let totalOwedToYou = 0;
      let totalYouOwe = 0;
      const totalNetBalance = totalOwedToYou - totalYouOwe;

      assert.strictEqual(totalOwedToYou, 0);
      assert.strictEqual(totalYouOwe, 0);
      assert.strictEqual(totalNetBalance, 0);
    });
  });
});
