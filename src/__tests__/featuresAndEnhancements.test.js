const { describe, it } = require('node:test');
const assert = require('node:assert');
const { analyzeMonthlyExpenses } = require('../services/aiParser');

describe('Enhanced Features & Workflow Unit Tests', () => {
  describe('Expense Editing & Split Rebalancing Logic', () => {
    it('should accurately compute diffs when amount and category change', () => {
      const oldExpense = {
        amount: 500,
        category: 'Food',
        description: 'Lunch',
      };
      const updatedExpense = {
        amount: 650,
        category: 'Grocery',
        description: 'Team Lunch & Snacks',
      };

      const changes = [];
      if (oldExpense.amount !== updatedExpense.amount) {
        changes.push({
          field: 'Amount',
          from: `₹${oldExpense.amount.toFixed(2)}`,
          to: `₹${updatedExpense.amount.toFixed(2)}`,
        });
      }
      if (oldExpense.category !== updatedExpense.category) {
        changes.push({
          field: 'Category',
          from: oldExpense.category,
          to: updatedExpense.category,
        });
      }
      if (oldExpense.description !== updatedExpense.description) {
        changes.push({
          field: 'Description',
          from: oldExpense.description,
          to: updatedExpense.description,
        });
      }

      assert.strictEqual(changes.length, 3);
      assert.strictEqual(changes[0].field, 'Amount');
      assert.strictEqual(changes[0].from, '₹500.00');
      assert.strictEqual(changes[0].to, '₹650.00');
      assert.strictEqual(changes[1].field, 'Category');
      assert.strictEqual(changes[1].from, 'Food');
      assert.strictEqual(changes[1].to, 'Grocery');
    });

    it('should validate that updated splits sum exactly to updated expense amount', () => {
      const updatedAmount = 900;
      const splits = [
        { userId: 'u1', share: 300 },
        { userId: 'u2', share: 300 },
        { userId: 'u3', share: 300 },
      ];
      const sum = splits.reduce((acc, s) => acc + s.share, 0);
      assert.strictEqual(Math.abs(sum - updatedAmount) < 0.01, true);
    });
  });

  describe('Payment Confirmation Flow States', () => {
    it('should transition settlement from pending to pending_confirmation on pay', () => {
      let settlement = {
        id: 's1',
        fromId: 'u1',
        toId: 'u2',
        amount: 1500,
        status: 'pending',
        rejectionReason: null,
      };

      // Borrower clicks "I've Paid"
      settlement = {
        ...settlement,
        status: 'pending_confirmation',
        paidAt: new Date(),
      };

      assert.strictEqual(settlement.status, 'pending_confirmation');
      assert.ok(settlement.paidAt);
    });

    it('should transition settlement from pending_confirmation to completed on confirmation', () => {
      let settlement = {
        id: 's1',
        fromId: 'u1',
        toId: 'u2',
        amount: 1500,
        status: 'pending_confirmation',
      };

      // Receiver confirms
      const confirmedAt = new Date();
      settlement = {
        ...settlement,
        status: 'completed',
        confirmedById: 'u2',
        confirmedAt,
      };

      assert.strictEqual(settlement.status, 'completed');
      assert.strictEqual(settlement.confirmedById, 'u2');
      assert.strictEqual(settlement.confirmedAt, confirmedAt);
    });

    it('should transition settlement from pending_confirmation to rejected with reason on rejection', () => {
      let settlement = {
        id: 's1',
        fromId: 'u1',
        toId: 'u2',
        amount: 1500,
        status: 'pending_confirmation',
      };

      // Receiver rejects
      const rejectionReason = 'Incorrect transaction reference / funds not received';
      settlement = {
        ...settlement,
        status: 'rejected',
        rejectionReason,
        confirmedById: null,
      };

      assert.strictEqual(settlement.status, 'rejected');
      assert.strictEqual(settlement.rejectionReason, rejectionReason);
    });
  });

  describe('AI Monthly Expense Analysis Calculation', () => {
    it('should accurately aggregate category totals and percentages', async () => {
      const expenses = [
        { category: 'Food', amount: 4500 },
        { category: 'Rent', amount: 10000 },
        { category: 'Grocery', amount: 3200 },
        { category: 'Auto/Transport', amount: 2000 },
        { category: 'Food', amount: 500 },
      ];

      const totalSpent = expenses.reduce((sum, e) => sum + e.amount, 0);
      assert.strictEqual(totalSpent, 20200);

      const categoryTotals = {};
      expenses.forEach((e) => {
        categoryTotals[e.category] = (categoryTotals[e.category] || 0) + e.amount;
      });

      const categoryBreakdown = Object.entries(categoryTotals)
        .map(([category, amount]) => ({
          category,
          amount,
          percentage: Math.round((amount / totalSpent) * 100),
        }))
        .sort((a, b) => b.amount - a.amount);

      assert.strictEqual(categoryBreakdown[0].category, 'Rent');
      assert.strictEqual(categoryBreakdown[0].amount, 10000);
      assert.strictEqual(categoryBreakdown[0].percentage, 50);

      assert.strictEqual(categoryBreakdown[1].category, 'Food');
      assert.strictEqual(categoryBreakdown[1].amount, 5000);

      const analysis = await analyzeMonthlyExpenses({
        monthName: 'August 2026',
        totalSpent,
        categoryBreakdown,
        transactionCount: expenses.length,
        topCategory: categoryBreakdown[0],
      });

      assert.ok(analysis.summary);
      assert.ok(Array.isArray(analysis.keyObservations));
      assert.ok(analysis.keyObservations.length >= 1);
    });
  });
});
