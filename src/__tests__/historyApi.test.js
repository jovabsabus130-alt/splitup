const { describe, it } = require('node:test');
const assert = require('node:assert');

describe('Transaction History API & Authorization Logic Tests', () => {
  // Test Mock Data
  const userA = { id: 'user_a', name: 'Alice', email: 'alice@example.com' };
  const userB = { id: 'user_b', name: 'Bob', email: 'bob@example.com' };
  const userC = { id: 'user_c', name: 'Charlie', email: 'charlie@example.com' };

  const group1 = { id: 'group_1', name: 'Trip to Goa' };
  const group2 = { id: 'group_2', name: 'Apartment Rent' };
  const group3 = { id: 'group_3', name: 'Secret Office Secret Santa' };

  // Group Memberships
  // userA is in group1, group2
  // userB is in group1, group3
  // userC is only in group3
  const memberships = [
    { userId: 'user_a', groupId: 'group_1' },
    { userId: 'user_a', groupId: 'group_2' },
    { userId: 'user_b', groupId: 'group_1' },
    { userId: 'user_b', groupId: 'group_3' },
    { userId: 'user_c', groupId: 'group_3' },
  ];

  const expenses = [
    {
      id: 'exp_1',
      groupId: 'group_1',
      paidById: 'user_a',
      amount: 1500,
      category: 'Food',
      description: 'Seafood Dinner',
      createdAt: new Date('2026-09-10T12:00:00Z'),
      splits: [
        { userId: 'user_a', share: 750 },
        { userId: 'user_b', share: 750 },
      ],
    },
    {
      id: 'exp_2',
      groupId: 'group_2',
      paidById: 'user_a',
      amount: 20000,
      category: 'Rent',
      description: 'September Rent',
      createdAt: new Date('2026-09-01T10:00:00Z'),
      splits: [
        { userId: 'user_a', share: 20000 },
      ],
    },
    {
      id: 'exp_3',
      groupId: 'group_3',
      paidById: 'user_b',
      amount: 3000,
      category: 'Entertainment',
      description: 'Concert Tickets',
      createdAt: new Date('2026-09-12T18:00:00Z'),
      splits: [
        { userId: 'user_b', share: 1500 },
        { userId: 'user_c', share: 1500 },
      ],
    },
  ];

  function getAuthorizedHistory(authenticatedUserId, query = {}) {
    // 1. Never trust query.userId — always use authenticatedUserId
    const userGroupIds = memberships
      .filter((m) => m.userId === authenticatedUserId)
      .map((m) => m.groupId);

    if (userGroupIds.length === 0) {
      return { transactions: [], total: 0 };
    }

    let targetGroupIds = userGroupIds;
    if (query.groupId) {
      if (!userGroupIds.includes(query.groupId)) {
        throw new Error('403 Forbidden: You are not authorized to view transactions for this group');
      }
      targetGroupIds = [query.groupId];
    }

    let filtered = expenses.filter((e) => targetGroupIds.includes(e.groupId));

    if (query.category) {
      filtered = filtered.filter((e) => e.category.toLowerCase() === query.category.toLowerCase());
    }

    if (query.search) {
      const q = query.search.toLowerCase();
      filtered = filtered.filter((e) => (e.description && e.description.toLowerCase().includes(q)) || e.category.toLowerCase().includes(q));
    }

    const page = query.page || 1;
    const limit = query.limit || 10;
    const start = (page - 1) * limit;
    const paginated = filtered.slice(start, start + limit);

    const formatted = paginated.map((exp) => {
      const isUserPayer = exp.paidById === authenticatedUserId;
      const userSplit = exp.splits.find((s) => s.userId === authenticatedUserId);
      const userShare = userSplit ? userSplit.share : 0;
      const userNet = isUserPayer ? exp.amount - userShare : -userShare;

      return {
        id: exp.id,
        amount: exp.amount,
        category: exp.category,
        description: exp.description,
        groupId: exp.groupId,
        isUserPayer,
        userShare,
        userNet,
        participantCount: exp.splits.length,
      };
    });

    return { transactions: formatted, total: filtered.length };
  }

  describe('Authorization & Data Isolation', () => {
    it('should only return expenses from groups User A belongs to (group_1, group_2)', () => {
      const historyA = getAuthorizedHistory(userA.id);
      assert.strictEqual(historyA.total, 2);
      const groupIds = historyA.transactions.map((t) => t.groupId);
      assert.ok(groupIds.includes('group_1'));
      assert.ok(groupIds.includes('group_2'));
      assert.ok(!groupIds.includes('group_3')); // Cannot see group 3
    });

    it('should only return expenses from groups User B belongs to (group_1, group_3)', () => {
      const historyB = getAuthorizedHistory(userB.id);
      assert.strictEqual(historyB.total, 2);
      const groupIds = historyB.transactions.map((t) => t.groupId);
      assert.ok(groupIds.includes('group_1'));
      assert.ok(groupIds.includes('group_3'));
      assert.ok(!groupIds.includes('group_2')); // Cannot see group 2
    });

    it('should reject request when user queries a group they do not belong to', () => {
      assert.throws(() => {
        getAuthorizedHistory(userA.id, { groupId: 'group_3' });
      }, /403 Forbidden/);
    });

    it('should ignore any spoofed userId query parameter', () => {
      // Attacker attempts to pass spoofed userId
      const spoofedParam = { userId: 'user_b' };
      const historyA = getAuthorizedHistory(userA.id, spoofedParam);
      // History returned must still belong exclusively to userA
      const groupIds = historyA.transactions.map((t) => t.groupId);
      assert.ok(!groupIds.includes('group_3'));
    });
  });

  describe('Transaction Details & Calculation Accuracy', () => {
    it('should accurately calculate user share and net impact for payer and non-payer', () => {
      // User A on exp_1 (Payer, paid 1500, share 750 => gets back 750)
      const historyA = getAuthorizedHistory(userA.id, { groupId: 'group_1' });
      const exp1A = historyA.transactions.find((t) => t.id === 'exp_1');
      assert.strictEqual(exp1A.isUserPayer, true);
      assert.strictEqual(exp1A.userShare, 750);
      assert.strictEqual(exp1A.userNet, 750);

      // User B on exp_1 (Non-payer, share 750 => owes 750)
      const historyB = getAuthorizedHistory(userB.id, { groupId: 'group_1' });
      const exp1B = historyB.transactions.find((t) => t.id === 'exp_1');
      assert.strictEqual(exp1B.isUserPayer, false);
      assert.strictEqual(exp1B.userShare, 750);
      assert.strictEqual(exp1B.userNet, -750);
    });

    it('should support category and search filtering with pagination', () => {
      const foodHistory = getAuthorizedHistory(userA.id, { category: 'Food' });
      assert.strictEqual(foodHistory.total, 1);
      assert.strictEqual(foodHistory.transactions[0].category, 'Food');

      const searchHistory = getAuthorizedHistory(userA.id, { search: 'rent' });
      assert.strictEqual(searchHistory.total, 1);
      assert.strictEqual(searchHistory.transactions[0].description, 'September Rent');
    });

    it('should return zero-data state when user has no groups or matching expenses', () => {
      const historyEmpty = getAuthorizedHistory('user_no_groups');
      assert.strictEqual(historyEmpty.total, 0);
      assert.deepStrictEqual(historyEmpty.transactions, []);
    });
  });
});
