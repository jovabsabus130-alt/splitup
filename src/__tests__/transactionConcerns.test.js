const { describe, it } = require('node:test');
const assert = require('node:assert');
const { z } = require('zod');

describe('Transaction Concern / Flag System Unit & End-to-End Workflow Tests', () => {
  const createConcernSchema = z.object({
    reason: z.string().trim().min(1, 'Reason is required'),
  });

  const respondConcernSchema = z.object({
    payerResponse: z.string().trim().min(1, 'Response is required'),
    status: z.enum(['resolved', 'dismissed', 'pending']).optional().default('resolved'),
  });

  class MockConcernDb {
    constructor() {
      this.reset();
    }

    reset() {
      this.users = [
        { id: 'user_a', name: 'Alice Payer', email: 'alice@example.com' },
        { id: 'user_b', name: 'Bob Member', email: 'bob@example.com' },
        { id: 'user_c', name: 'Charlie Member', email: 'charlie@example.com' },
        { id: 'user_outsider', name: 'Dave Outsider', email: 'dave@example.com' },
      ];

      this.groups = [
        { id: 'group_1', name: 'Apartment Rent & Utilities', adminId: 'user_a' },
        { id: 'group_2', name: 'Work Project', adminId: 'user_outsider' },
      ];

      this.memberships = [
        { userId: 'user_a', groupId: 'group_1' },
        { userId: 'user_b', groupId: 'group_1' },
        { userId: 'user_c', groupId: 'group_1' },
        { userId: 'user_outsider', groupId: 'group_2' },
      ];

      this.expenses = [];
      this.splits = [];
      this.concerns = [];
      this.notifications = [];
    }

    async createExpense(authenticatedUserId, groupId, payload) {
      const isMember = this.memberships.some((m) => m.userId === authenticatedUserId && m.groupId === groupId);
      if (!isMember) {
        return { status: 403, body: { success: false, message: 'You are not a member of this group' } };
      }

      const expense = {
        id: `exp_${Date.now()}_${Math.random()}`,
        groupId,
        paidById: authenticatedUserId,
        amount: payload.amount,
        category: payload.category,
        description: payload.description,
        createdAt: new Date(),
        paidBy: this.users.find((u) => u.id === authenticatedUserId),
      };
      this.expenses.push(expense);

      (payload.splits || []).forEach((s) => {
        this.splits.push({
          id: `split_${Date.now()}_${Math.random()}`,
          expenseId: expense.id,
          userId: s.userId,
          share: s.share,
        });
      });

      return { status: 201, body: { success: true, expense } };
    }

    async raiseConcern(authenticatedUserId, groupId, expenseId, body) {
      const parsed = createConcernSchema.safeParse(body);
      if (!parsed.success) {
        return { status: 400, body: { success: false, message: 'Invalid concern payload', errors: parsed.error.issues } };
      }

      const isMember = this.memberships.some((m) => m.userId === authenticatedUserId && m.groupId === groupId);
      if (!isMember) {
        return { status: 403, body: { success: false, message: 'You are not a member of this group' } };
      }

      const expense = this.expenses.find((e) => e.id === expenseId && e.groupId === groupId);
      if (!expense) {
        return { status: 404, body: { success: false, message: 'Expense not found in this group' } };
      }

      const concern = {
        id: `concern_${Date.now()}_${Math.random()}`,
        expenseId,
        raisedById: authenticatedUserId,
        reason: parsed.data.reason,
        status: 'pending',
        payerResponse: null,
        resolvedAt: null,
        createdAt: new Date(),
        raisedBy: this.users.find((u) => u.id === authenticatedUserId),
      };
      this.concerns.push(concern);

      // Create notification for payer
      const raiserUser = this.users.find((u) => u.id === authenticatedUserId);
      const group = this.groups.find((g) => g.id === groupId);
      const notification = {
        id: `notif_${Date.now()}_${Math.random()}`,
        userId: expense.paidById,
        groupId,
        type: 'concern_raised',
        title: 'Transaction Concern Raised',
        message: `${raiserUser?.name || 'A group member'} raised a concern regarding "${expense.description || expense.category}" in ${group?.name}: "${parsed.data.reason}"`,
        data: {
          concernId: concern.id,
          expenseId,
          groupId,
          raisedById: authenticatedUserId,
          reason: parsed.data.reason,
        },
        isRead: false,
        createdAt: new Date(),
      };
      this.notifications.push(notification);

      return { status: 201, body: { success: true, concern, message: 'Concern raised successfully and payer notified.' } };
    }

    async getConcerns(authenticatedUserId, groupId, expenseId) {
      const isMember = this.memberships.some((m) => m.userId === authenticatedUserId && m.groupId === groupId);
      if (!isMember) {
        return { status: 403, body: { success: false, message: 'You are not a member of this group' } };
      }

      const expense = this.expenses.find((e) => e.id === expenseId && e.groupId === groupId);
      if (!expense) {
        return { status: 404, body: { success: false, message: 'Expense not found in this group' } };
      }

      const list = this.concerns
        .filter((c) => c.expenseId === expenseId)
        .sort((a, b) => b.createdAt - a.createdAt);

      return { status: 200, body: { success: true, concerns: list } };
    }

    async respondToConcern(authenticatedUserId, groupId, expenseId, concernId, body) {
      const parsed = respondConcernSchema.safeParse(body);
      if (!parsed.success) {
        return { status: 400, body: { success: false, message: 'Invalid response payload', errors: parsed.error.issues } };
      }

      const isMember = this.memberships.some((m) => m.userId === authenticatedUserId && m.groupId === groupId);
      if (!isMember) {
        return { status: 403, body: { success: false, message: 'You are not a member of this group' } };
      }

      const expense = this.expenses.find((e) => e.id === expenseId && e.groupId === groupId);
      if (!expense) {
        return { status: 404, body: { success: false, message: 'Expense not found in this group' } };
      }

      const concern = this.concerns.find((c) => c.id === concernId && c.expenseId === expenseId);
      if (!concern) {
        return { status: 404, body: { success: false, message: 'Concern not found for this expense' } };
      }

      if (expense.paidById !== authenticatedUserId) {
        return { status: 403, body: { success: false, message: 'Only the payer of the expense can respond to concerns' } };
      }

      concern.payerResponse = parsed.data.payerResponse;
      concern.status = parsed.data.status || 'resolved';
      concern.resolvedAt = new Date();

      // Create notification for concern raiser
      const payerUser = this.users.find((u) => u.id === authenticatedUserId);
      const group = this.groups.find((g) => g.id === groupId);
      const notification = {
        id: `notif_${Date.now()}_${Math.random()}`,
        userId: concern.raisedById,
        groupId,
        type: 'concern_responded',
        title: 'Response to Transaction Concern',
        message: `${payerUser?.name} responded to your concern on "${expense.description || expense.category}" in ${group?.name}: "${parsed.data.payerResponse}"`,
        data: {
          concernId: concern.id,
          expenseId,
          groupId,
          payerId: authenticatedUserId,
          status: concern.status,
          payerResponse: parsed.data.payerResponse,
        },
        isRead: false,
        createdAt: new Date(),
      };
      this.notifications.push(notification);

      return { status: 200, body: { success: true, concern, message: 'Response recorded and raiser notified.' } };
    }
  }

  const db = new MockConcernDb();

  it('1. End-to-End Workflow: User A creates expense -> User B flags -> User A notified & responds -> User B sees response', async () => {
    db.reset();

    // Step 1: User A creates expense in group_1
    const createRes = await db.createExpense('user_a', 'group_1', {
      amount: 4500,
      category: 'Utilities',
      description: 'Electricity & High-Speed Internet',
      splits: [
        { userId: 'user_a', share: 1500 },
        { userId: 'user_b', share: 1500 },
        { userId: 'user_c', share: 1500 },
      ],
    });
    assert.strictEqual(createRes.status, 201);
    const expenseId = createRes.body.expense.id;

    // Step 2: User B flags the expense with a concern
    const flagRes = await db.raiseConcern('user_b', 'group_1', expenseId, {
      reason: 'Internet billing period covers next month after I move out.',
    });
    assert.strictEqual(flagRes.status, 201);
    assert.strictEqual(flagRes.body.concern.status, 'pending');
    assert.strictEqual(flagRes.body.concern.raisedById, 'user_b');
    const concernId = flagRes.body.concern.id;

    // Step 3: User A receives notification
    const userANotifs = db.notifications.filter((n) => n.userId === 'user_a');
    assert.strictEqual(userANotifs.length, 1);
    assert.strictEqual(userANotifs[0].type, 'concern_raised');
    assert.match(userANotifs[0].message, /move out/i);

    // Step 4: User A responds as the payer
    const respondRes = await db.respondToConcern('user_a', 'group_1', expenseId, concernId, {
      payerResponse: 'Noted! I will adjust the split to exclude the post-move-out internet charge.',
      status: 'resolved',
    });
    assert.strictEqual(respondRes.status, 200);
    assert.strictEqual(respondRes.body.concern.status, 'resolved');

    // Step 5: User B receives notification & sees response in concerns list
    const userBNotifs = db.notifications.filter((n) => n.userId === 'user_b');
    assert.strictEqual(userBNotifs.length, 1);
    assert.strictEqual(userBNotifs[0].type, 'concern_responded');
    assert.strictEqual(userBNotifs[0].data.status, 'resolved');

    const listRes = await db.getConcerns('user_b', 'group_1', expenseId);
    assert.strictEqual(listRes.status, 200);
    assert.strictEqual(listRes.body.concerns.length, 1);
    assert.strictEqual(listRes.body.concerns[0].payerResponse, 'Noted! I will adjust the split to exclude the post-move-out internet charge.');
  });

  it('2. Multiple concerns on one expense are all displayed rather than hiding older ones', async () => {
    const expenseId = db.expenses[0].id;

    // User C also raises a concern on the same expense
    const secondConcernRes = await db.raiseConcern('user_c', 'group_1', expenseId, {
      reason: 'Was the AC unit surcharge included in the electricity bill?',
    });
    assert.strictEqual(secondConcernRes.status, 201);

    // Fetch all concerns on this expense
    const listRes = await db.getConcerns('user_a', 'group_1', expenseId);
    assert.strictEqual(listRes.status, 200);
    assert.strictEqual(listRes.body.concerns.length, 2);

    const reasons = listRes.body.concerns.map((c) => c.reason);
    assert.ok(reasons.includes('Internet billing period covers next month after I move out.'));
    assert.ok(reasons.includes('Was the AC unit surcharge included in the electricity bill?'));
  });

  it('3. Unauthorized non-members cannot raise concerns or view concerns', async () => {
    const expenseId = db.expenses[0].id;

    // user_outsider belongs to group_2, not group_1
    const raiseAttempt = await db.raiseConcern('user_outsider', 'group_1', expenseId, {
      reason: 'Illegitimate concern',
    });
    assert.strictEqual(raiseAttempt.status, 403);

    const getAttempt = await db.getConcerns('user_outsider', 'group_1', expenseId);
    assert.strictEqual(getAttempt.status, 403);
  });

  it('4. Non-payers cannot respond to concerns (only the expense payer can respond)', async () => {
    const expenseId = db.expenses[0].id;
    const concernId = db.concerns[0].id;

    // User B is a member but NOT the payer of this expense (User A paid)
    const illegalResponse = await db.respondToConcern('user_b', 'group_1', expenseId, concernId, {
      payerResponse: 'User B attempting to impersonate payer',
      status: 'resolved',
    });

    assert.strictEqual(illegalResponse.status, 403);
    assert.match(illegalResponse.body.message, /only the payer/i);
  });
});
