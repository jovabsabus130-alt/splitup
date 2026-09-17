process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_jwt_secret_xyz';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const jwt = require('jsonwebtoken');

const prisma = require('../lib/prisma');
const expensesRouter = require('../routes/expenses');
const { getGroupBalances } = require('../services/balanceService');

function signTestToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET);
}

function createMockReq({ userId, method = 'DELETE', url = '', body = {}, params = {} }) {
  const token = signTestToken(userId);
  return {
    method,
    url,
    originalUrl: url,
    params,
    body,
    userId,
    headers: {
      authorization: `Bearer ${token}`,
    },
  };
}

function createMockRes() {
  return {
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

describe('Transaction Deletion (Accidental Duplicate & Errant Removal) Unit & Security Tests', () => {
  let usersTable = [];
  let groupsTable = [];
  let groupMembersTable = [];
  let expensesTable = [];
  let splitsTable = [];
  let editHistoryTable = [];
  let notificationsTable = [];

  const originalUserFindUnique = prisma.user.findUnique;
  const originalFindUnique = prisma.expense.findUnique;
  const originalUpdate = prisma.expense.update;
  const originalFindMany = prisma.expense.findMany;
  const originalGroupMemberFindUnique = prisma.groupMember.findUnique;
  const originalGroupMemberFindMany = prisma.groupMember.findMany;
  const originalEditHistoryCreate = prisma.expenseEditHistory.create;
  const originalNotificationCreateMany = prisma.notification.createMany;
  const originalTransaction = prisma.$transaction;

  beforeEach(() => {
    usersTable = [
      { id: 'user_alice', name: 'Alice', email: 'alice@example.com' },
      { id: 'user_bob', name: 'Bob', email: 'bob@example.com' },
      { id: 'user_charlie', name: 'Charlie', email: 'charlie@example.com' },
    ];

    groupsTable = [
      { id: 'group_trip', name: 'Goa Trip', adminId: 'user_alice' },
    ];

    groupMembersTable = [
      { userId: 'user_alice', groupId: 'group_trip', user: usersTable[0] },
      { userId: 'user_bob', groupId: 'group_trip', user: usersTable[1] },
      { userId: 'user_charlie', groupId: 'group_trip', user: usersTable[2] },
    ];

    expensesTable = [
      {
        id: 'exp_duplicate_1',
        groupId: 'group_trip',
        paidById: 'user_alice',
        amount: 300,
        category: 'Food',
        description: 'Dinner at Beach',
        isEdited: false,
        isDeleted: false,
        createdAt: new Date('2026-09-17T10:00:00Z'),
        updatedAt: new Date('2026-09-17T10:00:00Z'),
      },
      {
        id: 'exp_duplicate_2', // Accidental duplicate
        groupId: 'group_trip',
        paidById: 'user_alice',
        amount: 300,
        category: 'Food',
        description: 'Dinner at Beach (accidental double submit)',
        isEdited: false,
        isDeleted: false,
        createdAt: new Date('2026-09-17T10:00:05Z'),
        updatedAt: new Date('2026-09-17T10:00:05Z'),
      },
    ];

    splitsTable = [
      { id: 's1', expenseId: 'exp_duplicate_1', userId: 'user_alice', share: 100 },
      { id: 's2', expenseId: 'exp_duplicate_1', userId: 'user_bob', share: 100 },
      { id: 's3', expenseId: 'exp_duplicate_1', userId: 'user_charlie', share: 100 },
      { id: 's4', expenseId: 'exp_duplicate_2', userId: 'user_alice', share: 100 },
      { id: 's5', expenseId: 'exp_duplicate_2', userId: 'user_bob', share: 100 },
      { id: 's6', expenseId: 'exp_duplicate_2', userId: 'user_charlie', share: 100 },
    ];

    editHistoryTable = [];
    notificationsTable = [];

    // Mock Prisma methods
    prisma.user.findUnique = async ({ where }) => {
      if (where.id) return usersTable.find((u) => u.id === where.id) || null;
      if (where.email) return usersTable.find((u) => u.email === where.email) || null;
      return null;
    };

    // Mock Prisma methods
    prisma.groupMember.findUnique = async ({ where }) => {
      const { userId, groupId } = where.userId_groupId || {};
      return groupMembersTable.find((m) => m.userId === userId && m.groupId === groupId) || null;
    };

    prisma.groupMember.findMany = async ({ where, include }) => {
      let res = groupMembersTable.filter((m) => m.groupId === where.groupId);
      if (include && include.user) {
        res = res.map((m) => ({ ...m, user: usersTable.find((u) => u.id === m.userId) }));
      }
      return res;
    };

    prisma.expense.findUnique = async ({ where, include }) => {
      const exp = expensesTable.find((e) => e.id === where.id);
      if (!exp) return null;
      const copy = { ...exp };
      if (include) {
        if (include.paidBy) copy.paidBy = usersTable.find((u) => u.id === exp.paidById);
        if (include.group) copy.group = groupsTable.find((g) => g.id === exp.groupId);
        if (include.splits) {
          copy.splits = splitsTable
            .filter((s) => s.expenseId === exp.id)
            .map((s) => ({ ...s, user: usersTable.find((u) => u.id === s.userId) }));
        }
      }
      return copy;
    };

    prisma.expense.findMany = async ({ where, include }) => {
      let filtered = expensesTable;
      if (where.groupId) filtered = filtered.filter((e) => e.groupId === where.groupId);
      return filtered.map((exp) => {
        const copy = { ...exp };
        if (include) {
          if (include.paidBy) copy.paidBy = usersTable.find((u) => u.id === exp.paidById);
          if (include.group) copy.group = groupsTable.find((g) => g.id === exp.groupId);
          if (include.splits) {
            copy.splits = splitsTable
              .filter((s) => s.expenseId === exp.id)
              .map((s) => ({ ...s, user: usersTable.find((u) => u.id === s.userId) }));
          }
        }
        return copy;
      });
    };

    prisma.expense.update = async ({ where, data }) => {
      const exp = expensesTable.find((e) => e.id === where.id);
      if (exp) Object.assign(exp, data);
      return exp;
    };

    prisma.expenseEditHistory.create = async ({ data }) => {
      const record = { id: 'hist_' + (editHistoryTable.length + 1), ...data, createdAt: new Date() };
      editHistoryTable.push(record);
      return record;
    };

    prisma.notification.createMany = async ({ data }) => {
      notificationsTable.push(...data);
      return { count: data.length };
    };

    prisma.settlement.findMany = async () => [];

    prisma.$transaction = async (cb) => {
      if (typeof cb === 'function') {
        return cb(prisma);
      }
      return Promise.all(cb);
    };
  });

  afterEach(() => {
    prisma.user.findUnique = originalUserFindUnique;
    prisma.expense.findUnique = originalFindUnique;
    prisma.expense.update = originalUpdate;
    prisma.expense.findMany = originalFindMany;
    prisma.groupMember.findUnique = originalGroupMemberFindUnique;
    prisma.groupMember.findMany = originalGroupMemberFindMany;
    prisma.expenseEditHistory.create = originalEditHistoryCreate;
    prisma.notification.createMany = originalNotificationCreateMany;
    prisma.$transaction = originalTransaction;
  });

  it('1. should allow the transaction creator to delete their duplicate expense and preserve history', async () => {
    const req = createMockReq({
      userId: 'user_alice',
      method: 'DELETE',
      url: '/groups/group_trip/expenses/exp_duplicate_2',
      params: { groupId: 'group_trip', expenseId: 'exp_duplicate_2' },
      body: { reason: 'Accidental double submit' },
    });
    const res = createMockRes();

    await callRouter(expensesRouter, 'DELETE', '/groups/group_trip/expenses/exp_duplicate_2', req, res);

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.data.success, true);
    assert.strictEqual(res.data.previousAmount, 300);

    // Verify soft deletion in DB
    const deletedExp = expensesTable.find((e) => e.id === 'exp_duplicate_2');
    assert.strictEqual(deletedExp.isDeleted, true);
    assert.ok(deletedExp.deletedAt);

    // Verify audit history was recorded with earlier amount and splits
    assert.strictEqual(editHistoryTable.length, 1);
    assert.strictEqual(editHistoryTable[0].expenseId, 'exp_duplicate_2');
    assert.strictEqual(editHistoryTable[0].editedById, 'user_alice');
    assert.strictEqual(editHistoryTable[0].previousData.amount, 300);
    assert.strictEqual(editHistoryTable[0].previousData.splits.length, 3);

    // Verify group members were notified
    assert.strictEqual(notificationsTable.length, 2); // Bob and Charlie
    assert.strictEqual(notificationsTable[0].type, 'expense_deleted');
  });

  it('2. should reject deletion when attempted by a non-creator with 403 Forbidden', async () => {
    // Bob tries to delete Alice's expense
    const req = createMockReq({
      userId: 'user_bob',
      method: 'DELETE',
      url: '/groups/group_trip/expenses/exp_duplicate_1',
      params: { groupId: 'group_trip', expenseId: 'exp_duplicate_1' },
    });
    const res = createMockRes();

    await callRouter(expensesRouter, 'DELETE', '/groups/group_trip/expenses/exp_duplicate_1', req, res);

    assert.strictEqual(res.statusCode, 403);
    assert.strictEqual(res.data.success, false);
    assert.strictEqual(res.data.message, 'Only the member who created this transaction can delete it.');

    // Expense must remain active
    const exp = expensesTable.find((e) => e.id === 'exp_duplicate_1');
    assert.strictEqual(exp.isDeleted, false);
  });

  it('3. should recalculate group balances immediately and exclude deleted expenses', async () => {
    // Before deletion: Alice paid ₹300 + ₹300 = ₹600.
    // Each member owes ₹100 + ₹100 = ₹200.
    // Alice net: +₹400, Bob net: -₹200, Charlie net: -₹200.
    let balances = await getGroupBalances('group_trip');
    let aliceBal = balances.find((b) => b.userId === 'user_alice');
    let bobBal = balances.find((b) => b.userId === 'user_bob');
    assert.strictEqual(aliceBal.netBalance, 400);
    assert.strictEqual(bobBal.netBalance, -200);

    // Delete exp_duplicate_2
    const req = createMockReq({
      userId: 'user_alice',
      method: 'DELETE',
      url: '/groups/group_trip/expenses/exp_duplicate_2',
      params: { groupId: 'group_trip', expenseId: 'exp_duplicate_2' },
    });
    const res = createMockRes();
    await callRouter(expensesRouter, 'DELETE', '/groups/group_trip/expenses/exp_duplicate_2', req, res);
    assert.strictEqual(res.statusCode, 200);

    // After deletion: Only exp_duplicate_1 (₹300) is active.
    // Alice net: +₹200, Bob net: -₹100, Charlie net: -₹100.
    balances = await getGroupBalances('group_trip');
    aliceBal = balances.find((b) => b.userId === 'user_alice');
    bobBal = balances.find((b) => b.userId === 'user_bob');
    let charlieBal = balances.find((b) => b.userId === 'user_charlie');

    assert.strictEqual(aliceBal.netBalance, 200);
    assert.strictEqual(bobBal.netBalance, -100);
    assert.strictEqual(charlieBal.netBalance, -100);
  });

  it('4. should reject deleting an already deleted transaction with 400 Bad Request', async () => {
    // First deletion
    const req1 = createMockReq({
      userId: 'user_alice',
      method: 'DELETE',
      url: '/groups/group_trip/expenses/exp_duplicate_2',
      params: { groupId: 'group_trip', expenseId: 'exp_duplicate_2' },
    });
    const res1 = createMockRes();
    await callRouter(expensesRouter, 'DELETE', '/groups/group_trip/expenses/exp_duplicate_2', req1, res1);
    assert.strictEqual(res1.statusCode, 200);

    // Second deletion attempt on the same ID
    const req2 = createMockReq({
      userId: 'user_alice',
      method: 'DELETE',
      url: '/groups/group_trip/expenses/exp_duplicate_2',
      params: { groupId: 'group_trip', expenseId: 'exp_duplicate_2' },
    });
    const res2 = createMockRes();
    await callRouter(expensesRouter, 'DELETE', '/groups/group_trip/expenses/exp_duplicate_2', req2, res2);

    assert.strictEqual(res2.statusCode, 400);
    assert.strictEqual(res2.data.message, 'This transaction has already been deleted.');
  });
});
