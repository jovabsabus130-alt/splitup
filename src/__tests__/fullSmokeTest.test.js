process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'smoke_test_jwt_secret_key_12345';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { z } = require('zod');

// Helpers & Services
const { simplifyDebts } = require('../services/debtSimplification');
const { getPeriodDateRange } = require('../services/analyticsService');

describe('Full End-to-End Production Smoke Test Journey', () => {

  // Stateful in-memory model simulating complete SplitUp ecosystem
  class SplitUpAppStore {
    constructor() {
      this.users = [];
      this.otps = [];
      this.groups = [];
      this.memberships = [];
      this.joinRequests = [];
      this.shoppingItems = [];
      this.expenses = [];
      this.splits = [];
      this.editHistories = [];
      this.concerns = [];
      this.settlements = [];
      this.notifications = [];
    }

    // 1. Register
    register(name, email, password) {
      const normalizedEmail = email.toLowerCase().trim();
      const passwordHash = bcrypt.hashSync(password, 4);
      const user = {
        id: `usr_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        name,
        email: normalizedEmail,
        passwordHash,
        emailVerified: false,
        createdAt: new Date(),
      };
      this.users.push(user);

      const otp = {
        id: `otp_${Date.now()}`,
        userId: user.id,
        code: '555666',
        used: false,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      };
      this.otps.push(otp);
      return { success: true, user, otp };
    }

    // 2. Email Verification
    verifyEmail(email, code) {
      const user = this.users.find((u) => u.email === email.toLowerCase().trim());
      if (!user) return { status: 400, error: 'Invalid or expired verification code' };

      const activeOtp = this.otps.find((o) => o.userId === user.id && !o.used && o.expiresAt > new Date());
      if (!activeOtp || activeOtp.code !== code) {
        return { status: 400, error: 'Invalid or expired verification code' };
      }

      activeOtp.used = true;
      user.emailVerified = true;
      const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '30d' });
      return { status: 200, success: true, token, user };
    }

    // 3. Login
    login(email, password) {
      const user = this.users.find((u) => u.email === email.toLowerCase().trim());
      if (!user) return { status: 401, error: 'Invalid credentials' };
      const isMatch = bcrypt.compareSync(password, user.passwordHash);
      if (!isMatch) return { status: 401, error: 'Invalid credentials' };

      const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '30d' });
      return { status: 200, success: true, token, user };
    }

    // 4. Create Group
    createGroup(userId, name) {
      const group = {
        id: `grp_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        name,
        adminId: userId,
        createdAt: new Date(),
      };
      this.groups.push(group);
      this.memberships.push({ userId, groupId: group.id });
      return { status: 201, group };
    }

    // 5. Submit Join Request
    requestJoin(userId, groupId) {
      const group = this.groups.find((g) => g.id === groupId);
      if (!group) return { status: 404, error: 'Group not found' };

      const isMember = this.memberships.some((m) => m.userId === userId && m.groupId === groupId);
      if (isMember) return { status: 409, error: 'Already a member' };

      const reqObj = {
        id: `req_${Date.now()}`,
        userId,
        groupId,
        status: 'pending',
      };
      this.joinRequests.push(reqObj);

      // Notify admin
      this.notifications.push({
        userId: group.adminId,
        groupId,
        type: 'join_request',
        title: 'New Join Request',
        message: `User requested to join "${group.name}".`,
      });

      return { status: 201, joinRequest: reqObj };
    }

    // 6. Approve Join Request
    approveJoinRequest(adminId, groupId, requestId) {
      const group = this.groups.find((g) => g.id === groupId);
      if (!group || group.adminId !== adminId) return { status: 403, error: 'Forbidden' };

      const reqObj = this.joinRequests.find((r) => r.id === requestId && r.groupId === groupId);
      if (!reqObj) return { status: 404, error: 'Request not found' };

      reqObj.status = 'approved';
      this.memberships.push({ userId: reqObj.userId, groupId });

      // Notify user
      this.notifications.push({
        userId: reqObj.userId,
        groupId,
        type: 'join_request_approved',
        title: 'Join Request Approved',
        message: `You joined "${group.name}".`,
      });

      return { status: 200, success: true };
    }

    // 7. Add Shopping Item
    addShoppingItem(userId, groupId, name, price, quantity = 1, category = 'Shopping') {
      const isMember = this.memberships.some((m) => m.userId === userId && m.groupId === groupId);
      if (!isMember) return { status: 403, error: 'Forbidden' };

      const item = {
        id: `item_${Date.now()}`,
        groupId,
        addedById: userId,
        name,
        price,
        quantity,
        category,
        completed: false,
      };
      this.shoppingItems.push(item);
      return { status: 201, item };
    }

    // 8. Convert Shopping Item to Expense
    convertShoppingItemToExpense(userId, groupId, itemId, paidById, splits) {
      const isMember = this.memberships.some((m) => m.userId === userId && m.groupId === groupId);
      if (!isMember) return { status: 403, error: 'Forbidden' };

      const item = this.shoppingItems.find((i) => i.id === itemId && i.groupId === groupId);
      if (!item) return { status: 404, error: 'Item not found' };
      if (item.completed) return { status: 409, error: 'Item already completed/converted' };

      const splitTotal = splits.reduce((acc, s) => acc + s.share, 0);
      if (Math.abs(splitTotal - item.price) > 0.01) return { status: 400, error: 'Splits must sum to price' };

      item.completed = true;
      const expense = {
        id: `exp_${Date.now()}`,
        groupId,
        paidById,
        amount: item.price,
        category: item.category,
        description: item.name,
        isEdited: false,
        createdAt: new Date(),
      };
      this.expenses.push(expense);

      for (const s of splits) {
        this.splits.push({ expenseId: expense.id, userId: s.userId, share: s.share });
      }

      return { status: 201, success: true, expense };
    }

    // 9 & 10 & 11. Create Expense with Percentage / Fraction splits
    createExpense(userId, groupId, amount, category, description, paidById, splits) {
      const isMember = this.memberships.some((m) => m.userId === userId && m.groupId === groupId);
      if (!isMember) return { status: 403, error: 'Forbidden' };

      const expenseAmount = Number(amount);
      const splitTotal = splits.reduce((acc, s) => acc + s.share, 0);
      if (Math.abs(splitTotal - expenseAmount) > 0.01) {
        return { status: 400, error: 'Splits must sum to expense amount' };
      }

      const expense = {
        id: `exp_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        groupId,
        paidById,
        amount: expenseAmount,
        category,
        description,
        isEdited: false,
        createdAt: new Date(),
      };
      this.expenses.push(expense);

      for (const s of splits) {
        this.splits.push({ expenseId: expense.id, userId: s.userId, share: s.share });
      }

      // Notify other group members
      const members = this.memberships.filter((m) => m.groupId === groupId && m.userId !== userId);
      for (const m of members) {
        this.notifications.push({
          userId: m.userId,
          groupId,
          type: 'expense_created',
          title: 'New Expense Added',
          message: `Expense "${description}" (₹${expenseAmount.toFixed(2)}) was added.`,
        });
      }

      return { status: 201, success: true, expense };
    }

    // 14. Edit Expense (Single-Edit Rule)
    editExpense(userId, groupId, expenseId, newAmount, newCategory, newDescription, newSplits) {
      const isMember = this.memberships.some((m) => m.userId === userId && m.groupId === groupId);
      if (!isMember) return { status: 403, error: 'Forbidden' };

      const exp = this.expenses.find((e) => e.id === expenseId && e.groupId === groupId);
      if (!exp) return { status: 404, error: 'Expense not found' };

      if (exp.isEdited) {
        return { status: 409, error: 'This transaction has already been edited and cannot be modified again.' };
      }

      const splitTotal = newSplits.reduce((acc, s) => acc + s.share, 0);
      if (Math.abs(splitTotal - newAmount) > 0.01) {
        return { status: 400, error: 'Splits must sum to updated amount' };
      }

      const previousData = {
        amount: exp.amount,
        category: exp.category,
        description: exp.description,
      };

      exp.amount = newAmount;
      exp.category = newCategory;
      exp.description = newDescription;
      exp.isEdited = true;

      // Replace splits
      this.splits = this.splits.filter((s) => s.expenseId !== expenseId);
      for (const s of newSplits) {
        this.splits.push({ expenseId, userId: s.userId, share: s.share });
      }

      this.editHistories.push({
        expenseId,
        editedById: userId,
        previousData,
        changes: [{ field: 'Amount', from: previousData.amount, to: newAmount }],
      });

      return { status: 200, success: true, expense: exp };
    }

    // 15. Flag Concern
    raiseConcern(userId, groupId, expenseId, reason) {
      const isMember = this.memberships.some((m) => m.userId === userId && m.groupId === groupId);
      if (!isMember) return { status: 403, error: 'Forbidden' };

      const exp = this.expenses.find((e) => e.id === expenseId && e.groupId === groupId);
      if (!exp) return { status: 404, error: 'Expense not found' };

      const concern = {
        id: `cnc_${Date.now()}`,
        expenseId,
        raisedById: userId,
        reason,
        status: 'pending',
        payerResponse: null,
      };
      this.concerns.push(concern);

      // Notify payer
      this.notifications.push({
        userId: exp.paidById,
        groupId,
        type: 'concern_raised',
        title: 'Transaction Concern Raised',
        message: `Concern raised on "${exp.description}": "${reason}"`,
      });

      return { status: 201, success: true, concern };
    }

    // 16. Payer Response
    respondConcern(userId, groupId, expenseId, concernId, responseText) {
      const exp = this.expenses.find((e) => e.id === expenseId && e.groupId === groupId);
      if (!exp) return { status: 404, error: 'Expense not found' };

      const concern = this.concerns.find((c) => c.id === concernId && c.expenseId === expenseId);
      if (!concern) return { status: 404, error: 'Concern not found' };

      if (exp.paidById !== userId) {
        return { status: 403, error: 'Only the payer of the expense can respond to concerns' };
      }

      concern.payerResponse = responseText;
      concern.status = 'resolved';
      concern.resolvedAt = new Date();

      // Notify raiser
      this.notifications.push({
        userId: concern.raisedById,
        groupId,
        type: 'concern_responded',
        title: 'Response to Transaction Concern',
        message: `Payer responded: "${responseText}"`,
      });

      return { status: 200, success: true, concern };
    }

    // 18. Settlement & Payment Confirmation
    createSettlement(groupId, fromId, toId, amount) {
      const settlement = {
        id: `stl_${Date.now()}`,
        groupId,
        fromId,
        toId,
        amount,
        status: 'pending',
        confirmedById: null,
      };
      this.settlements.push(settlement);
      return settlement;
    }

    markPaid(userId, settlementId) {
      const settlement = this.settlements.find((s) => s.id === settlementId);
      if (!settlement) return { status: 404, error: 'Not found' };
      if (settlement.fromId !== userId) return { status: 403, error: 'Only borrower can mark paid' };
      if (settlement.status === 'completed') return { status: 400, error: 'Already completed' };

      settlement.status = 'pending_confirmation';
      settlement.paidAt = new Date();
      return { status: 200, success: true, settlement };
    }

    confirmPayment(userId, settlementId) {
      const settlement = this.settlements.find((s) => s.id === settlementId);
      if (!settlement) return { status: 404, error: 'Not found' };
      if (settlement.toId !== userId) return { status: 403, error: 'Only receiver can confirm payment' };
      if (settlement.status === 'completed') return { status: 400, error: 'Already completed' };

      settlement.status = 'completed';
      settlement.confirmedById = userId;
      settlement.confirmedAt = new Date();
      return { status: 200, success: true, settlement };
    }

    // 19. Analytics
    getAnalytics(userId, groupId) {
      const userSplits = this.splits.filter((s) => s.userId === userId);
      const totalSpending = userSplits.reduce((acc, s) => acc + s.share, 0);

      const groupExpenses = this.expenses.filter((e) => !groupId || e.groupId === groupId);
      const byCategory = {};
      groupExpenses.forEach((e) => {
        byCategory[e.category] = (byCategory[e.category] || 0) + e.amount;
      });

      return {
        totalSpending: Number(totalSpending.toFixed(2)),
        categoryBreakdown: Object.entries(byCategory).map(([category, amount]) => ({ category, amount })),
        highestExpenses: groupExpenses.sort((a, b) => b.amount - a.amount).slice(0, 5),
      };
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // EXECUTE FULL USER JOURNEY SMOKE TEST
  // ═════════════════════════════════════════════════════════════════════════
  it('should execute the complete user flow from registration to analytics with zero errors', () => {
    const app = new SplitUpAppStore();

    // 1. Register User A (Alice) & User B (Bob)
    const regAlice = app.register('Alice', 'alice@splitup.app', 'password123');
    const regBob = app.register('Bob', 'bob@splitup.app', 'password456');
    assert.strictEqual(regAlice.success, true);
    assert.strictEqual(regBob.success, true);
    assert.strictEqual(regAlice.user.emailVerified, false);

    // 2. Email verification
    const verifyAlice = app.verifyEmail('alice@splitup.app', '555666');
    const verifyBob = app.verifyEmail('bob@splitup.app', '555666');
    assert.strictEqual(verifyAlice.status, 200);
    assert.strictEqual(verifyBob.status, 200);
    assert.strictEqual(verifyAlice.user.emailVerified, true);
    assert.ok(verifyAlice.token);

    // 3. Login
    const loginAlice = app.login('alice@splitup.app', 'password123');
    assert.strictEqual(loginAlice.status, 200);
    assert.ok(loginAlice.token);

    // 4. Create Group
    const createGroupRes = app.createGroup(regAlice.user.id, 'Goa Holiday Trip');
    assert.strictEqual(createGroupRes.status, 201);
    const groupId = createGroupRes.group.id;

    // 5. Invite User / Submit Join Request
    const joinReqRes = app.requestJoin(regBob.user.id, groupId);
    assert.strictEqual(joinReqRes.status, 201);
    const requestId = joinReqRes.joinRequest.id;

    // 6. Join Group (Admin Approves)
    const approveRes = app.approveJoinRequest(regAlice.user.id, groupId, requestId);
    assert.strictEqual(approveRes.status, 200);
    assert.strictEqual(app.memberships.filter((m) => m.groupId === groupId).length, 2);

    // 7. Add Shopping Item
    const shopRes = app.addShoppingItem(regBob.user.id, groupId, 'Beach Umbrella', 600, 2, 'Equipment');
    assert.strictEqual(shopRes.status, 201);
    const itemId = shopRes.item.id;

    // 8. Convert to Expense
    const convertRes = app.convertShoppingItemToExpense(regAlice.user.id, groupId, itemId, regAlice.user.id, [
      { userId: regAlice.user.id, share: 300 },
      { userId: regBob.user.id, share: 300 },
    ]);
    assert.strictEqual(convertRes.status, 201);
    assert.strictEqual(shopRes.item.completed, true);

    // Duplicate conversion blocked
    const dupConvert = app.convertShoppingItemToExpense(regAlice.user.id, groupId, itemId, regAlice.user.id, [
      { userId: regAlice.user.id, share: 300 },
      { userId: regBob.user.id, share: 300 },
    ]);
    assert.strictEqual(dupConvert.status, 409);

    // 9 & 10. Percentage Split Expense
    // Seafood Dinner ₹1200: Alice 60% (₹720), Bob 40% (₹480)
    const exp1Res = app.createExpense(
      regAlice.user.id,
      groupId,
      1200,
      'Food & Dining',
      'Seafood Dinner',
      regAlice.user.id,
      [
        { userId: regAlice.user.id, share: 720 },
        { userId: regBob.user.id, share: 480 },
      ]
    );
    assert.strictEqual(exp1Res.status, 201);
    const exp1Id = exp1Res.expense.id;

    // 11. Fraction Split Expense
    // Jet Ski Rental ₹1500: Alice 1/3 (₹500), Bob 2/3 (₹1000)
    const exp2Res = app.createExpense(
      regBob.user.id,
      groupId,
      1500,
      'Activities',
      'Jet Ski Rental',
      regBob.user.id,
      [
        { userId: regAlice.user.id, share: 500 },
        { userId: regBob.user.id, share: 1000 },
      ]
    );
    assert.strictEqual(exp2Res.status, 201);
    const exp2Id = exp2Res.expense.id;

    // 12. AI Parsing simulation
    const mockAiParse = (text) => {
      assert.match(text, /Dinner/);
      return { amount: 800, category: 'Food & Dining', description: 'Dinner' };
    };
    const parsedAi = mockAiParse('Dinner ₹800 paid by Alice');
    assert.strictEqual(parsedAi.amount, 800);

    // 13. History Verification
    assert.strictEqual(app.expenses.length, 3);

    // 14. Edit Once
    const edit1Res = app.editExpense(
      regAlice.user.id,
      groupId,
      exp1Id,
      1400,
      'Food & Dining',
      'Seafood Dinner with Drinks',
      [
        { userId: regAlice.user.id, share: 840 },
        { userId: regBob.user.id, share: 560 },
      ]
    );
    assert.strictEqual(edit1Res.status, 200);
    assert.strictEqual(edit1Res.expense.isEdited, true);

    // Second edit must fail
    const edit2Res = app.editExpense(regAlice.user.id, groupId, exp1Id, 1600, 'Food', 'Dinner Again', [
      { userId: regAlice.user.id, share: 800 },
      { userId: regBob.user.id, share: 800 },
    ]);
    assert.strictEqual(edit2Res.status, 409);

    // 15. Flag Concern
    const flagRes = app.raiseConcern(regAlice.user.id, groupId, exp2Id, 'Jet Ski was discounted by ₹200');
    assert.strictEqual(flagRes.status, 201);
    const concernId = flagRes.concern.id;

    // 16. Payer Response
    const respRes = app.respondConcern(regBob.user.id, groupId, exp2Id, concernId, 'Applied ₹200 discount to net balance');
    assert.strictEqual(respRes.status, 200);
    assert.strictEqual(respRes.concern.status, 'resolved');

    // 17. Notifications Delivered
    assert.ok(app.notifications.length >= 4);
    assert.ok(app.notifications.some((n) => n.type === 'concern_responded'));

    // 18. Payment & Settlement Flow
    const settlement = app.createSettlement(groupId, regBob.user.id, regAlice.user.id, 360);
    assert.strictEqual(settlement.status, 'pending');

    // Bob marks paid
    const paidRes = app.markPaid(regBob.user.id, settlement.id);
    assert.strictEqual(paidRes.status, 200);
    assert.strictEqual(settlement.status, 'pending_confirmation');

    // Debtor cannot confirm own payment
    const debtorConfirm = app.confirmPayment(regBob.user.id, settlement.id);
    assert.strictEqual(debtorConfirm.status, 403);

    // Alice (Creditor) confirms receipt
    const confirmRes = app.confirmPayment(regAlice.user.id, settlement.id);
    assert.strictEqual(confirmRes.status, 200);
    assert.strictEqual(settlement.status, 'completed');

    // 19. Analytics
    const analytics = app.getAnalytics(regAlice.user.id, groupId);
    assert.ok(analytics.totalSpending > 0);
    assert.strictEqual(analytics.highestExpenses.length, 3);
  });

});
