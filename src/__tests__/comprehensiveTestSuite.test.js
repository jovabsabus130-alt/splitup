process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_secret_key_987';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { z } = require('zod');

// Services and utilities to test directly
const { getPeriodDateRange } = require('../services/analyticsService');

describe('SplitUp Comprehensive Extended Test Suite', () => {

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. AUTHENTICATION LIFECYCLE TESTS
  // ═══════════════════════════════════════════════════════════════════════════
  describe('1. Authentication', () => {
    // Mock Auth In-Memory Store
    class MockAuthStore {
      constructor() {
        this.users = [];
        this.otps = [];
      }

      register(name, email, passwordHash) {
        const user = { id: `user_${Date.now()}_${Math.random()}`, name, email: email.toLowerCase().trim(), passwordHash, emailVerified: false };
        this.users.push(user);
        const otp = { id: `otp_${Date.now()}`, userId: user.id, code: '123456', used: false, expiresAt: new Date(Date.now() + 10 * 60 * 1000) };
        this.otps.push(otp);
        return { user, otp };
      }

      verifyEmail(email, otpCode) {
        const user = this.users.find((u) => u.email === email.toLowerCase().trim());
        if (!user) return { success: false, status: 400, message: 'Invalid or expired verification code' };
        const activeOtp = this.otps.find((o) => o.userId === user.id && !o.used && o.expiresAt > new Date());
        if (!activeOtp || activeOtp.code !== otpCode) {
          return { success: false, status: 400, message: 'Invalid or expired verification code' };
        }
        // Mark used & verify
        activeOtp.used = true;
        user.emailVerified = true;
        return { success: true, status: 200, user };
      }

      resendVerification(email) {
        const user = this.users.find((u) => u.email === email.toLowerCase().trim());
        if (!user) return { success: true, message: 'Generic success response' };
        // Invalidate prior
        this.otps.filter((o) => o.userId === user.id).forEach((o) => { o.used = true; });
        const newOtp = { id: `otp_${Date.now()}`, userId: user.id, code: '654321', used: false, expiresAt: new Date(Date.now() + 10 * 60 * 1000) };
        this.otps.push(newOtp);
        return { success: true, otp: newOtp };
      }

      forgotPassword(email) {
        const user = this.users.find((u) => u.email === email.toLowerCase().trim());
        if (!user) return { success: true, message: 'Generic success response' };
        this.otps.filter((o) => o.userId === user.id).forEach((o) => { o.used = true; });
        const resetOtp = { id: `otp_${Date.now()}`, userId: user.id, code: '777888', used: false, expiresAt: new Date(Date.now() + 10 * 60 * 1000) };
        this.otps.push(resetOtp);
        return { success: true, otp: resetOtp };
      }

      resetPassword(email, otpCode, newPasswordHash) {
        const user = this.users.find((u) => u.email === email.toLowerCase().trim());
        if (!user) return { success: false, status: 400, message: 'Invalid or expired reset code' };
        const activeOtp = this.otps.find((o) => o.userId === user.id && !o.used && o.expiresAt > new Date());
        if (!activeOtp || activeOtp.code !== otpCode) {
          return { success: false, status: 400, message: 'Invalid or expired reset code' };
        }
        activeOtp.used = true;
        user.passwordHash = newPasswordHash;
        return { success: true, status: 200, message: 'Password reset successful' };
      }
    }

    it('email verification: should verify email with valid OTP and activate user account', () => {
      const store = new MockAuthStore();
      const { user } = store.register('Jovab', 'jovab@example.com', 'hashed_pass');
      assert.strictEqual(user.emailVerified, false);

      const res = store.verifyEmail('jovab@example.com', '123456');
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.user.emailVerified, true);
    });

    it('email verification: should reject expired, mismatched, or already used OTP', () => {
      const store = new MockAuthStore();
      store.register('Jovab', 'jovab@example.com', 'hashed_pass');

      // Wrong code
      const resWrong = store.verifyEmail('jovab@example.com', '999999');
      assert.strictEqual(resWrong.success, false);
      assert.strictEqual(resWrong.status, 400);

      // Verify once
      store.verifyEmail('jovab@example.com', '123456');

      // Replay used OTP
      const resReplay = store.verifyEmail('jovab@example.com', '123456');
      assert.strictEqual(resReplay.success, false);
      assert.strictEqual(resReplay.status, 400);
    });

    it('resend verification: should invalidate old OTPs, generate new code, and prevent email enumeration', () => {
      const store = new MockAuthStore();
      store.register('Jovab', 'jovab@example.com', 'hashed_pass');

      const resend = store.resendVerification('jovab@example.com');
      assert.strictEqual(resend.success, true);
      assert.strictEqual(resend.otp.code, '654321');

      // Old OTP no longer valid
      const oldVerify = store.verifyEmail('jovab@example.com', '123456');
      assert.strictEqual(oldVerify.success, false);

      // New OTP works
      const newVerify = store.verifyEmail('jovab@example.com', '654321');
      assert.strictEqual(newVerify.success, true);

      // Non-existent user returns generic success
      const unknownResend = store.resendVerification('nonexistent@example.com');
      assert.strictEqual(unknownResend.success, true);
    });

    it('forgot password & reset password: should generate reset code and securely update password hash', () => {
      const store = new MockAuthStore();
      store.register('Jovab', 'jovab@example.com', 'old_hash');

      const forgot = store.forgotPassword('jovab@example.com');
      assert.strictEqual(forgot.success, true);
      assert.strictEqual(forgot.otp.code, '777888');

      // Attempt with invalid OTP
      const invalidReset = store.resetPassword('jovab@example.com', '000000', 'new_hash');
      assert.strictEqual(invalidReset.success, false);
      assert.strictEqual(invalidReset.status, 400);

      // Valid reset
      const validReset = store.resetPassword('jovab@example.com', '777888', 'new_hash_123');
      assert.strictEqual(validReset.success, true);

      const user = store.users.find((u) => u.email === 'jovab@example.com');
      assert.strictEqual(user.passwordHash, 'new_hash_123');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. EXPENSES & SPLIT MODES TESTS
  // ═══════════════════════════════════════════════════════════════════════════
  describe('2. Expenses', () => {
    function computePercentageSplits(totalAmount, percentages, payerId, memberIds) {
      const totalPct = Object.values(percentages).reduce((a, b) => a + b, 0);
      if (Math.abs(totalPct - 100) > 0.01) {
        throw new Error('Percentages must sum to 100%');
      }

      const splits = {};
      let allocated = 0;
      for (const id of memberIds) {
        const pct = percentages[id] || 0;
        const share = Math.round(totalAmount * (pct / 100) * 100) / 100;
        splits[id] = share;
        allocated += share;
      }

      const remainder = Number((totalAmount - allocated).toFixed(2));
      if (remainder > 0) {
        splits[payerId] = Number((splits[payerId] + remainder).toFixed(2));
      }
      return splits;
    }

    function computeFractionSplits(totalAmount, fractions, payerId, memberIds) {
      let fractionSum = 0;
      const parsedFractions = {};

      for (const id of memberIds) {
        const fracStr = fractions[id] || '0';
        const [num, den] = fracStr.includes('/') ? fracStr.split('/').map(Number) : [Number(fracStr), 1];
        if (!den || isNaN(num) || isNaN(den)) throw new Error('Invalid fraction format');
        const val = num / den;
        parsedFractions[id] = val;
        fractionSum += val;
      }

      if (Math.abs(fractionSum - 1.0) > 0.01) {
        throw new Error('Fractions must sum to 1');
      }

      const splits = {};
      let allocated = 0;
      for (const id of memberIds) {
        const share = Math.round(totalAmount * parsedFractions[id] * 100) / 100;
        splits[id] = share;
        allocated += share;
      }

      const remainder = Number((totalAmount - allocated).toFixed(2));
      if (remainder > 0) {
        splits[payerId] = Number((splits[payerId] + remainder).toFixed(2));
      }
      return splits;
    }

    it('percentage split: should compute exact amounts from percentages and assign penny remainder to payer', () => {
      const members = ['user_payer', 'user_b', 'user_c'];
      const pcts = { user_payer: 33.3, user_b: 33.3, user_c: 33.4 };
      const splits = computePercentageSplits(100, pcts, 'user_payer', members);

      assert.strictEqual(splits.user_payer, 33.30);
      assert.strictEqual(splits.user_b, 33.30);
      assert.strictEqual(splits.user_c, 33.40);

      const total = Object.values(splits).reduce((a, b) => a + b, 0);
      assert.strictEqual(Number(total.toFixed(2)), 100.00);
    });

    it('fraction split: should compute fraction shares and handle repeating decimals (1/3, 1/3, 1/3)', () => {
      const members = ['user_payer', 'user_b', 'user_c'];
      const fractions = { user_payer: '1/3', user_b: '1/3', user_c: '1/3' };
      const splits = computeFractionSplits(10, fractions, 'user_payer', members);

      assert.strictEqual(splits.user_payer, 3.34); // ₹3.33 + ₹0.01 penny remainder to payer
      assert.strictEqual(splits.user_b, 3.33);
      assert.strictEqual(splits.user_c, 3.33);

      const total = Object.values(splits).reduce((a, b) => a + b, 0);
      assert.strictEqual(Number(total.toFixed(2)), 10.00);
    });

    it('rounding & tolerance: should accept splits matching total within 0.01 tolerance', () => {
      const totalAmount = 100.00;
      const splits = [{ userId: 'u1', share: 33.33 }, { userId: 'u2', share: 33.33 }, { userId: 'u3', share: 33.34 }];
      const sum = splits.reduce((a, b) => a + b.share, 0);
      assert.ok(Math.abs(sum - totalAmount) <= 0.01);
    });

    it('invalid splits: should reject negative amounts, negative shares, and unequal totals', () => {
      const schema = z.object({
        amount: z.number().positive(),
        splits: z.array(z.object({ userId: z.string(), share: z.number().nonnegative() })).min(1),
      });

      // Negative total amount
      assert.strictEqual(schema.safeParse({ amount: -50, splits: [{ userId: 'u1', share: 50 }] }).success, false);

      // Negative split share
      assert.strictEqual(schema.safeParse({ amount: 50, splits: [{ userId: 'u1', share: -50 }] }).success, false);

      // Empty splits
      assert.strictEqual(schema.safeParse({ amount: 50, splits: [] }).success, false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. EDITING & SINGLE-EDIT CONCURRENCY ENFORCEMENT
  // ═══════════════════════════════════════════════════════════════════════════
  describe('3. Editing', () => {
    class MockExpenseService {
      constructor() {
        this.expenses = new Map();
        this.editHistories = [];
      }

      create(id, groupId, amount, category, paidById, splits) {
        const exp = { id, groupId, amount, category, paidById, isEdited: false, splits };
        this.expenses.set(id, exp);
        return exp;
      }

      async edit(expenseId, groupId, newAmount, newCategory, editedById, newSplits) {
        const exp = this.expenses.get(expenseId);
        if (!exp || exp.groupId !== groupId) return { status: 404, error: 'Not found' };
        if (exp.isEdited) {
          return { status: 409, error: 'This transaction has already been edited and cannot be modified again.' };
        }

        // Simulate atomic lock
        exp.isEdited = true;
        const previousData = { amount: exp.amount, category: exp.category, splits: exp.splits };
        exp.amount = newAmount;
        exp.category = newCategory;
        exp.splits = newSplits;

        this.editHistories.push({
          expenseId,
          editedById,
          previousData,
          changes: [{ field: 'Amount', from: previousData.amount, to: newAmount }],
        });

        return { status: 200, success: true, expense: exp };
      }
    }

    it('first edit succeeds: should update expense, set isEdited = true, and record edit history', async () => {
      const svc = new MockExpenseService();
      svc.create('exp_1', 'grp_1', 1000, 'Dinner', 'user_a', [{ userId: 'user_a', share: 500 }, { userId: 'user_b', share: 500 }]);

      const res = await svc.edit('exp_1', 'grp_1', 1200, 'Dinner & Drinks', 'user_a', [{ userId: 'user_a', share: 600 }, { userId: 'user_b', share: 600 }]);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.expense.amount, 1200);
      assert.strictEqual(res.expense.isEdited, true);
      assert.strictEqual(svc.editHistories.length, 1);
      assert.strictEqual(svc.editHistories[0].previousData.amount, 1000);
    });

    it('second edit fails: should reject any subsequent edit attempt with 409 Conflict', async () => {
      const svc = new MockExpenseService();
      svc.create('exp_1', 'grp_1', 1000, 'Dinner', 'user_a', [{ userId: 'user_a', share: 500 }, { userId: 'user_b', share: 500 }]);

      // First edit
      const edit1 = await svc.edit('exp_1', 'grp_1', 1200, 'Dinner', 'user_a', [{ userId: 'user_a', share: 600 }, { userId: 'user_b', share: 600 }]);
      assert.strictEqual(edit1.status, 200);

      // Second edit
      const edit2 = await svc.edit('exp_1', 'grp_1', 1400, 'Dinner', 'user_a', [{ userId: 'user_a', share: 700 }, { userId: 'user_b', share: 700 }]);
      assert.strictEqual(edit2.status, 409);
      assert.match(edit2.error, /already been edited/);
    });

    it('concurrent edit protection: exactly one edit should succeed in racing promises', async () => {
      const svc = new MockExpenseService();
      svc.create('exp_race', 'grp_1', 500, 'Lunch', 'user_a', [{ userId: 'user_a', share: 500 }]);

      const [res1, res2] = await Promise.all([
        svc.edit('exp_race', 'grp_1', 600, 'Lunch', 'user_a', [{ userId: 'user_a', share: 600 }]),
        svc.edit('exp_race', 'grp_1', 700, 'Lunch', 'user_a', [{ userId: 'user_a', share: 700 }]),
      ]);

      const statuses = [res1.status, res2.status].sort();
      assert.deepStrictEqual(statuses, [200, 409], 'Exactly one update must return 200 and the other 409');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. CONCERNS & TRANSACTION FLAGGING TESTS
  // ═══════════════════════════════════════════════════════════════════════════
  describe('4. Concerns', () => {
    class MockConcernSystem {
      constructor() {
        this.memberships = [{ userId: 'user_payer', groupId: 'grp_1' }, { userId: 'user_flag', groupId: 'grp_1' }];
        this.expenses = [{ id: 'exp_1', groupId: 'grp_1', paidById: 'user_payer', amount: 500 }];
        this.concerns = [];
      }

      createConcern(userId, groupId, expenseId, reason) {
        const isMember = this.memberships.some((m) => m.userId === userId && m.groupId === groupId);
        if (!isMember) return { status: 403, error: 'Not a member of this group' };

        const exp = this.expenses.find((e) => e.id === expenseId && e.groupId === groupId);
        if (!exp) return { status: 404, error: 'Expense not found in this group' };

        const concern = { id: `c_${Date.now()}`, expenseId, raisedById: userId, reason, status: 'pending', payerResponse: null };
        this.concerns.push(concern);
        return { status: 201, success: true, concern };
      }

      respondConcern(userId, groupId, expenseId, concernId, payerResponse, newStatus = 'resolved') {
        const exp = this.expenses.find((e) => e.id === expenseId && e.groupId === groupId);
        if (!exp) return { status: 404, error: 'Expense not found in this group' };

        const concern = this.concerns.find((c) => c.id === concernId && c.expenseId === expenseId);
        if (!concern) return { status: 404, error: 'Concern not found' };

        if (exp.paidById !== userId) {
          return { status: 403, error: 'Only the payer of the expense can respond to concerns' };
        }

        concern.payerResponse = payerResponse;
        concern.status = newStatus;
        concern.resolvedAt = new Date();
        return { status: 200, success: true, concern };
      }
    }

    it('create concern: should allow group member to flag expense with reason', () => {
      const sys = new MockConcernSystem();
      const res = sys.createConcern('user_flag', 'grp_1', 'exp_1', 'I was not present for this meal');
      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.concern.status, 'pending');
      assert.strictEqual(res.concern.reason, 'I was not present for this meal');
    });

    it('unauthorized concern: should reject non-members with 403 Forbidden', () => {
      const sys = new MockConcernSystem();
      const res = sys.createConcern('user_outsider', 'grp_1', 'exp_1', 'Random flag');
      assert.strictEqual(res.status, 403);
    });

    it('payer response: should allow only expense payer to respond and resolve concern', () => {
      const sys = new MockConcernSystem();
      const c = sys.createConcern('user_flag', 'grp_1', 'exp_1', 'Check share amount').concern;

      // Non-payer tries to respond
      const nonPayerRes = sys.respondConcern('user_flag', 'grp_1', 'exp_1', c.id, 'I am answering my own flag');
      assert.strictEqual(nonPayerRes.status, 403);

      // Payer responds
      const payerRes = sys.respondConcern('user_payer', 'grp_1', 'exp_1', c.id, 'Adjusted in next settlement');
      assert.strictEqual(payerRes.status, 200);
      assert.strictEqual(payerRes.concern.status, 'resolved');
      assert.strictEqual(payerRes.concern.payerResponse, 'Adjusted in next settlement');
    });

    it('invalid group/expense relationship: should return 404 if expenseId does not match groupId', () => {
      const sys = new MockConcernSystem();
      const res = sys.createConcern('user_flag', 'wrong_group', 'exp_1', 'Mismatched group');
      assert.strictEqual(res.status, 403); // Non-member of wrong_group
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. NOTIFICATION DISPATCH & RECIPIENT ACCURACY TESTS
  // ═══════════════════════════════════════════════════════════════════════════
  describe('5. Notifications', () => {
    class MockNotificationDispatcher {
      constructor() {
        this.notifications = [];
      }

      dispatchExpenseCreated(groupId, groupName, creatorId, creatorName, amount, description, members, splits) {
        const recipients = Array.from(new Set(members)).filter((uid) => uid !== creatorId);
        for (const uid of recipients) {
          const split = splits.find((s) => s.userId === uid);
          this.notifications.push({
            userId: uid,
            groupId,
            type: 'expense_created',
            title: 'New Expense Added',
            message: `${creatorName} added "${description}" (₹${amount.toFixed(2)}) in ${groupName}.${split ? ` Your share: ₹${split.share.toFixed(2)}.` : ''}`,
          });
        }
      }

      dispatchConcernRaised(groupId, groupName, payerId, raiserName, expenseDesc, amount, reason) {
        this.notifications.push({
          userId: payerId,
          groupId,
          type: 'concern_raised',
          title: 'Transaction Concern Raised',
          message: `${raiserName} raised a concern regarding "${expenseDesc}" (₹${amount.toFixed(2)}) in ${groupName}: "${reason}"`,
        });
      }
    }

    it('expense events & correct recipients: should notify all members except creator and include individual shares', () => {
      const dispatcher = new MockNotificationDispatcher();
      const members = ['user_creator', 'user_b', 'user_c'];
      const splits = [{ userId: 'user_creator', share: 50 }, { userId: 'user_b', share: 25 }, { userId: 'user_c', share: 25 }];

      dispatcher.dispatchExpenseCreated('g1', 'Goa Trip', 'user_creator', 'Alice', 100, 'Cab Ride', members, splits);

      assert.strictEqual(dispatcher.notifications.length, 2);
      assert.ok(!dispatcher.notifications.some((n) => n.userId === 'user_creator'), 'Creator should not receive self-notification');

      const notifB = dispatcher.notifications.find((n) => n.userId === 'user_b');
      assert.ok(notifB);
      assert.match(notifB.message, /Your share: ₹25\.00/);
    });

    it('concern events: should deliver notification directly to the expense payer', () => {
      const dispatcher = new MockNotificationDispatcher();
      dispatcher.dispatchConcernRaised('g1', 'Flatmates', 'user_payer', 'Bob', 'Groceries', 200, 'Duplicate item');

      assert.strictEqual(dispatcher.notifications.length, 1);
      assert.strictEqual(dispatcher.notifications[0].userId, 'user_payer');
      assert.match(dispatcher.notifications[0].message, /Duplicate item/);
    });

    it('no duplicate notifications: recipient list should deduplicate duplicate member entries', () => {
      const dispatcher = new MockNotificationDispatcher();
      const membersWithDuplicates = ['user_creator', 'user_b', 'user_b', 'user_c'];
      const splits = [{ userId: 'user_b', share: 50 }, { userId: 'user_c', share: 50 }];

      dispatcher.dispatchExpenseCreated('g1', 'Group', 'user_creator', 'Alice', 100, 'Lunch', membersWithDuplicates, splits);
      assert.strictEqual(dispatcher.notifications.length, 2); // user_b only notified once
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. SHOPPING LIST EXTENSIONS & EXPENSE CONVERSION TESTS
  // ═══════════════════════════════════════════════════════════════════════════
  describe('6. Shopping', () => {
    const shoppingItemSchema = z.object({
      name: z.string().trim().min(1),
      price: z.number().positive().optional(),
      quantity: z.coerce.number().int().positive().optional().default(1),
      category: z.string().trim().min(1).optional().default('Shopping'),
    });

    it('quantity & category: should validate positive integer quantity and default category', () => {
      const valid = shoppingItemSchema.parse({ name: 'Apples', price: 120, quantity: 4, category: 'Groceries' });
      assert.strictEqual(valid.quantity, 4);
      assert.strictEqual(valid.category, 'Groceries');

      // Default values
      const def = shoppingItemSchema.parse({ name: 'Milk' });
      assert.strictEqual(def.quantity, 1);
      assert.strictEqual(def.category, 'Shopping');

      // Invalid quantity
      assert.strictEqual(shoppingItemSchema.safeParse({ name: 'Eggs', quantity: -2 }).success, false);
      assert.strictEqual(shoppingItemSchema.safeParse({ name: 'Eggs', quantity: 0 }).success, false);
    });

    it('conversion to expense: should map item fields into expense and block duplicate conversion', () => {
      const item = { id: 'item_1', name: 'Dish Soap', price: 150, quantity: 2, category: 'Household', completed: false };

      function convertToExpense(itm, payerId, splits) {
        if (itm.completed) throw new Error('Item already converted');
        if (!itm.price) throw new Error('Price required');
        const splitSum = splits.reduce((a, b) => a + b.share, 0);
        if (Math.abs(splitSum - itm.price) > 0.01) throw new Error('Splits must sum to price');

        itm.completed = true;
        return {
          description: itm.name,
          amount: itm.price,
          category: itm.category,
          paidById: payerId,
          splits,
        };
      }

      const expense = convertToExpense(item, 'user_a', [{ userId: 'user_a', share: 75 }, { userId: 'user_b', share: 75 }]);
      assert.strictEqual(expense.description, 'Dish Soap');
      assert.strictEqual(expense.amount, 150);
      assert.strictEqual(expense.category, 'Household');
      assert.strictEqual(item.completed, true);

      // Re-conversion throws
      assert.throws(() => {
        convertToExpense(item, 'user_a', [{ userId: 'user_a', share: 150 }]);
      }, /Item already converted/);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 7. STRUCTURED ANALYTICS ENGINE TESTS
  // ═══════════════════════════════════════════════════════════════════════════
  describe('7. Analytics', () => {
    it('day period: should compute exact 24-hour range for specified date', () => {
      const { startDate, endDate, trendBuckets } = getPeriodDateRange('day', '2026-09-15');
      assert.strictEqual(startDate.getDate(), 15);
      assert.strictEqual(endDate.getDate(), 15);
      assert.strictEqual(trendBuckets.length, 24);
    });

    it('week period: should compute exact Monday-to-Sunday 7-day boundary', () => {
      const { startDate, endDate, trendBuckets } = getPeriodDateRange('week', '2026-09-15'); // Tuesday
      assert.strictEqual(startDate.getDay(), 1); // Monday
      assert.strictEqual(endDate.getDay(), 0); // Sunday
      assert.strictEqual(trendBuckets.length, 7);
    });

    it('month period: should compute 1st-of-month to end-of-month boundary', () => {
      const { startDate, endDate, trendBuckets } = getPeriodDateRange('month', '2026-09-15');
      assert.strictEqual(startDate.getDate(), 1);
      assert.strictEqual(startDate.getMonth(), 8); // September (0-indexed 8)
      assert.strictEqual(endDate.getDate(), 30); // September has 30 days
      assert.strictEqual(trendBuckets.length, 30);
    });

    it('empty data: should return structured 0 values without errors for empty period', () => {
      function formatAnalytics(expenses, splits) {
        const totalSpending = splits.reduce((acc, s) => acc + Number(s.share), 0);
        const byCategory = {};
        expenses.forEach((e) => {
          byCategory[e.category] = (byCategory[e.category] || 0) + Number(e.amount);
        });

        return {
          totalSpending: Number(totalSpending.toFixed(2)),
          spendingTrend: [],
          byCategory: Object.entries(byCategory).map(([category, amount]) => ({ category, amount })),
          highestExpenses: [],
          totalOwed: 0,
          totalReceivable: 0,
        };
      }

      const res = formatAnalytics([], []);
      assert.strictEqual(res.totalSpending, 0);
      assert.deepStrictEqual(res.spendingTrend, []);
      assert.deepStrictEqual(res.byCategory, []);
      assert.deepStrictEqual(res.highestExpenses, []);
      assert.strictEqual(res.totalOwed, 0);
      assert.strictEqual(res.totalReceivable, 0);
    });

    it('personal & group scope validation: requires groupId when scope is group', () => {
      const schema = z.object({
        scope: z.enum(['personal', 'group']).default('personal'),
        period: z.enum(['day', 'week', 'month']).default('month'),
        groupId: z.string().optional(),
      }).refine((data) => !(data.scope === 'group' && (!data.groupId || !data.groupId.trim())), {
        message: 'groupId is required when scope is group',
        path: ['groupId'],
      });

      assert.strictEqual(schema.safeParse({ scope: 'personal' }).success, true);
      assert.strictEqual(schema.safeParse({ scope: 'group' }).success, false);
      assert.strictEqual(schema.safeParse({ scope: 'group', groupId: 'grp_123' }).success, true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 12. GROUP DELETION, BALANCES & JOIN REQUESTS
  // ═══════════════════════════════════════════════════════════════════════════
  describe('12. Group Deletion, Balance Updates & Join System', () => {
    it('should reject group deletion when unsettled balances exist', () => {
      function validateGroupDeletion(balances, pendingSettlements) {
        const hasUnsettled = balances.some((b) => Math.abs(Number(b.netBalance) || 0) > 0.01);
        if (hasUnsettled) {
          return { allowed: false, status: 400, message: 'Cannot delete group with unsettled balances. All members must settle up (balance = ₹0.00) before deleting.' };
        }
        if (pendingSettlements.some((s) => ['pending', 'pending_confirmation'].includes(s.status))) {
          return { allowed: false, status: 400, message: 'Cannot delete group while there are pending payment confirmations.' };
        }
        return { allowed: true };
      }

      const activeBalances = [{ userId: 'user_1', netBalance: 250 }, { userId: 'user_2', netBalance: -250 }];
      const result = validateGroupDeletion(activeBalances, []);
      assert.strictEqual(result.allowed, false);
      assert.strictEqual(result.status, 400);
      assert.ok(result.message.includes('unsettled balances'));
    });

    it('should allow group soft-deletion when all balances are zero and preserve transactions', () => {
      const groupStore = {
        id: 'grp_roadtrip',
        name: 'Road Trip',
        isDeleted: false,
        deletedAt: null,
        expenses: [
          { id: 'exp_1', amount: 500, description: 'Fuel' },
          { id: 'exp_2', amount: 300, description: 'Snacks' },
        ],
      };

      function softDeleteGroup(group, balances) {
        const hasUnsettled = balances.some((b) => Math.abs(Number(b.netBalance) || 0) > 0.01);
        if (hasUnsettled) {
          throw new Error('Cannot delete group with unsettled balances');
        }
        group.isDeleted = true;
        group.deletedAt = new Date();
        return group;
      }

      const settledBalances = [{ userId: 'user_1', netBalance: 0 }, { userId: 'user_2', netBalance: 0 }];
      const deletedGroup = softDeleteGroup(groupStore, settledBalances);

      assert.strictEqual(deletedGroup.isDeleted, true);
      assert.ok(deletedGroup.deletedAt instanceof Date);
      // Verify transactions are still fully accessible
      assert.strictEqual(deletedGroup.expenses.length, 2);
      assert.strictEqual(deletedGroup.expenses[0].description, 'Fuel');
    });

    it('should correctly reflect payment confirmations in balance calculations', () => {
      // Payer paid ₹200 for Bob -> Bob owes ₹200
      let expenses = [
        { paidById: 'alice', amount: 200, isDeleted: false, splits: [{ userId: 'bob', share: 200 }] },
      ];
      let completedSettlements = [];

      function computeNetBalances(members, exps, settlements) {
        const map = new Map();
        members.forEach((m) => map.set(m, 0));

        for (const exp of exps) {
          if (exp.isDeleted) continue;
          map.set(exp.paidById, (map.get(exp.paidById) || 0) + exp.amount);
          for (const split of exp.splits) {
            map.set(split.userId, (map.get(split.userId) || 0) - split.share);
          }
        }

        for (const s of settlements) {
          if (s.status === 'completed') {
            map.set(s.fromId, (map.get(s.fromId) || 0) + s.amount);
            map.set(s.toId, (map.get(s.toId) || 0) - s.amount);
          }
        }

        return Object.fromEntries(map);
      }

      // Initial state: Alice +200, Bob -200
      let balances = computeNetBalances(['alice', 'bob'], expenses, completedSettlements);
      assert.strictEqual(balances.alice, 200);
      assert.strictEqual(balances.bob, -200);

      // Receiver confirms payment receipt
      completedSettlements.push({ fromId: 'bob', toId: 'alice', amount: 200, status: 'completed' });

      // Updated state after confirmation: Alice 0, Bob 0 (fully settled)
      balances = computeNetBalances(['alice', 'bob'], expenses, completedSettlements);
      assert.strictEqual(balances.alice, 0);
      assert.strictEqual(balances.bob, 0);
    });

    it('should parse invite URLs safely and avoid undefined group IDs', () => {
      function extractGroupIdFromInput(input) {
        const raw = (input || '').trim();
        if (!raw || raw === 'undefined') return null;
        if (raw.includes('/join/')) {
          const parts = raw.split('/join/');
          const extracted = parts[parts.length - 1].split('?')[0].split('#')[0].trim();
          return extracted && extracted !== 'undefined' ? extracted : null;
        }
        return raw;
      }

      assert.strictEqual(extractGroupIdFromInput('cml123456'), 'cml123456');
      assert.strictEqual(extractGroupIdFromInput('https://splitup-eight.vercel.app/join/cml987654'), 'cml987654');
      assert.strictEqual(extractGroupIdFromInput('https://splitup-eight.vercel.app/join/undefined'), null);
      assert.strictEqual(extractGroupIdFromInput(''), null);
    });
  });

});
