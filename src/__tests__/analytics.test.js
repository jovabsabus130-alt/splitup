const { describe, it } = require('node:test');
const assert = require('node:assert');
const { z } = require('zod');
const { getPeriodDateRange } = require('../services/analyticsService');

const analyticsQuerySchema = z.object({
  scope: z.enum(['personal', 'group']).default('personal'),
  period: z.enum(['day', 'week', 'month']).default('month'),
  date: z.string().optional(),
  groupId: z.string().optional(),
}).refine((data) => {
  if (data.scope === 'group' && (!data.groupId || !data.groupId.trim())) {
    return false;
  }
  return true;
}, {
  message: 'groupId is required when scope is group',
  path: ['groupId'],
});

describe('Structured Analytics Engine & Date Aggregation Tests', () => {
  describe('1. Zod Parameter Validation', () => {
    it('should accept valid personal query params with default values', () => {
      const parsed = analyticsQuerySchema.safeParse({});
      assert.strictEqual(parsed.success, true);
      assert.strictEqual(parsed.data.scope, 'personal');
      assert.strictEqual(parsed.data.period, 'month');
    });

    it('should accept valid group query params when groupId is provided', () => {
      const parsed = analyticsQuerySchema.safeParse({
        scope: 'group',
        groupId: 'grp_123',
        period: 'week',
      });
      assert.strictEqual(parsed.success, true);
      assert.strictEqual(parsed.data.scope, 'group');
      assert.strictEqual(parsed.data.groupId, 'grp_123');
      assert.strictEqual(parsed.data.period, 'week');
    });

    it('should reject group scope when groupId is missing or empty', () => {
      const parsed = analyticsQuerySchema.safeParse({
        scope: 'group',
      });
      assert.strictEqual(parsed.success, false);
      assert.strictEqual(parsed.error.issues[0].path.join('.'), 'groupId');
    });

    it('should reject invalid period or scope values', () => {
      const parsed = analyticsQuerySchema.safeParse({
        period: 'year',
      });
      assert.strictEqual(parsed.success, false);
    });
  });

  describe('2. Period Date Range & Trend Bucketing Calculations', () => {
    it('should accurately compute 24-hour range for "day" period with 24 trend buckets', () => {
      const refDate = '2026-09-15T12:00:00Z';
      const range = getPeriodDateRange('day', refDate);

      assert.strictEqual(range.period, 'day');
      assert.strictEqual(range.trendBuckets.length, 24);
      assert.strictEqual(range.trendBuckets[0].label, '00:00');
      assert.strictEqual(range.trendBuckets[12].label, '12:00');
      assert.strictEqual(range.trendBuckets[23].label, '23:00');
    });

    it('should accurately compute 7-day range for "week" period (Monday to Sunday)', () => {
      const refDate = '2026-09-15'; // Tuesday
      const range = getPeriodDateRange('week', refDate);

      assert.strictEqual(range.period, 'week');
      assert.strictEqual(range.trendBuckets.length, 7);
      assert.strictEqual(range.trendBuckets[0].label, 'Mon');
      assert.strictEqual(range.trendBuckets[6].label, 'Sun');
    });

    it('should accurately compute month range (1st to last day) for "month" period', () => {
      const refDate = '2026-09-15';
      const range = getPeriodDateRange('month', refDate);

      assert.strictEqual(range.period, 'month');
      // September has 30 days
      assert.strictEqual(range.trendBuckets.length, 30);
      assert.strictEqual(range.trendBuckets[0].label, '1');
      assert.strictEqual(range.trendBuckets[29].label, '30');
    });
  });

  describe('3. In-Memory Mock Structured Analytics Workflow', () => {
    class MockAnalyticsEngine {
      constructor() {
        this.reset();
      }

      reset() {
        this.users = [
          { id: 'user_1', name: 'Jovab' },
          { id: 'user_2', name: 'Rahul' },
          { id: 'user_3', name: 'Arjun' },
        ];
        this.groups = [
          { id: 'grp_flat', name: 'Apartment Flatmates' },
          { id: 'grp_trip', name: 'Goa Trip' },
        ];
        this.memberships = [
          { userId: 'user_1', groupId: 'grp_flat' },
          { userId: 'user_2', groupId: 'grp_flat' },
          { userId: 'user_1', groupId: 'grp_trip' },
          { userId: 'user_3', groupId: 'grp_trip' },
        ];
        this.expenses = [
          {
            id: 'exp_1',
            groupId: 'grp_flat',
            paidById: 'user_1',
            amount: 1200,
            category: 'Grocery',
            description: 'Weekly Groceries',
            createdAt: new Date('2026-09-10T10:00:00Z'),
            splits: [
              { userId: 'user_1', share: 600 },
              { userId: 'user_2', share: 600 },
            ],
          },
          {
            id: 'exp_2',
            groupId: 'grp_flat',
            paidById: 'user_2',
            amount: 800,
            category: 'Food',
            description: 'Dinner Takeaway',
            createdAt: new Date('2026-09-12T19:30:00Z'),
            splits: [
              { userId: 'user_1', share: 400 },
              { userId: 'user_2', share: 400 },
            ],
          },
          {
            id: 'exp_3',
            groupId: 'grp_trip',
            paidById: 'user_1',
            amount: 2500,
            category: 'Auto/Transport',
            description: 'Fuel & Tolls',
            createdAt: new Date('2026-09-15T08:00:00Z'),
            splits: [
              { userId: 'user_1', share: 1250 },
              { userId: 'user_3', share: 1250 },
            ],
          },
        ];
      }

      getPersonalAnalytics(userId, period = 'month', dateStr = '2026-09-15') {
        const { startDate, endDate, trendBuckets } = getPeriodDateRange(period, dateStr);
        const userGroups = this.memberships.filter((m) => m.userId === userId).map((m) => m.groupId);

        const matchingSplits = [];
        for (const exp of this.expenses) {
          if (exp.createdAt >= startDate && exp.createdAt <= endDate && userGroups.includes(exp.groupId)) {
            const split = exp.splits.find((s) => s.userId === userId);
            if (split) {
              matchingSplits.push({ split, expense: exp });
            }
          }
        }

        let totalSpending = 0;
        const categoryTotals = {};
        const groupTotals = {};

        for (const { split, expense } of matchingSplits) {
          totalSpending += split.share;
          categoryTotals[expense.category] = (categoryTotals[expense.category] || 0) + split.share;
          groupTotals[expense.groupId] = (groupTotals[expense.groupId] || 0) + split.share;
        }

        const categoryBreakdown = Object.entries(categoryTotals)
          .map(([category, amount]) => ({
            category,
            amount,
            percentage: Math.round((amount / (totalSpending || 1)) * 100),
          }))
          .sort((a, b) => b.amount - a.amount);

        const groupBreakdown = Object.entries(groupTotals)
          .map(([groupId, amount]) => {
            const grp = this.groups.find((g) => g.id === groupId);
            return {
              groupId,
              groupName: grp ? grp.name : groupId,
              amount,
              percentage: Math.round((amount / (totalSpending || 1)) * 100),
            };
          })
          .sort((a, b) => b.amount - a.amount);

        return {
          scope: 'personal',
          period,
          totalSpending,
          categoryBreakdown,
          groupBreakdown,
          transactionCount: matchingSplits.length,
        };
      }

      getGroupAnalytics(userId, groupId, period = 'month', dateStr = '2026-09-15') {
        const isMember = this.memberships.some((m) => m.userId === userId && m.groupId === groupId);
        if (!isMember) {
          throw new Error('Forbidden: You are not a member of this group');
        }

        const { startDate, endDate } = getPeriodDateRange(period, dateStr);
        const matchingExpenses = this.expenses.filter(
          (e) => e.groupId === groupId && e.createdAt >= startDate && e.createdAt <= endDate
        );

        let totalGroupSpending = 0;
        const categoryTotals = {};

        for (const exp of matchingExpenses) {
          totalGroupSpending += exp.amount;
          categoryTotals[exp.category] = (categoryTotals[exp.category] || 0) + exp.amount;
        }

        const categoryBreakdown = Object.entries(categoryTotals)
          .map(([category, amount]) => ({
            category,
            amount,
            percentage: Math.round((amount / (totalGroupSpending || 1)) * 100),
          }))
          .sort((a, b) => b.amount - a.amount);

        return {
          scope: 'group',
          groupId,
          period,
          totalGroupSpending,
          categoryBreakdown,
          expenseCount: matchingExpenses.length,
        };
      }
    }

    const engine = new MockAnalyticsEngine();

    it('should calculate personal monthly spending across all user groups accurately', () => {
      const res = engine.getPersonalAnalytics('user_1', 'month', '2026-09-15');
      // user_1 shares: 600 (Groceries) + 400 (Dinner) + 1250 (Fuel) = 2250
      assert.strictEqual(res.totalSpending, 2250);
      assert.strictEqual(res.categoryBreakdown.length, 3);
      assert.strictEqual(res.categoryBreakdown[0].category, 'Auto/Transport');
      assert.strictEqual(res.categoryBreakdown[0].amount, 1250);
      assert.strictEqual(res.groupBreakdown.length, 2);
    });

    it('should calculate group monthly spending for a specific group', () => {
      const res = engine.getGroupAnalytics('user_1', 'grp_flat', 'month', '2026-09-15');
      // grp_flat total: 1200 + 800 = 2000
      assert.strictEqual(res.totalGroupSpending, 2000);
      assert.strictEqual(res.categoryBreakdown.length, 2);
      assert.strictEqual(res.categoryBreakdown[0].category, 'Grocery');
      assert.strictEqual(res.categoryBreakdown[0].amount, 1200);
    });

    it('should reject unauthorized member querying a group they do not belong to', () => {
      assert.throws(() => {
        engine.getGroupAnalytics('user_3', 'grp_flat', 'month', '2026-09-15');
      }, /not a member of this group/);
    });

    it('should handle empty periods by returning zero values instead of errors', () => {
      const res = engine.getPersonalAnalytics('user_1', 'day', '2026-01-01');
      assert.strictEqual(res.totalSpending, 0);
      assert.strictEqual(res.categoryBreakdown.length, 0);
      assert.strictEqual(res.groupBreakdown.length, 0);
      assert.strictEqual(res.transactionCount, 0);
    });
  });
});
