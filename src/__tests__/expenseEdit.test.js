const { describe, it } = require('node:test');
const assert = require('node:assert');

describe('Transaction Single-Edit Enforcement & Concurrency Protection Tests', () => {
  // In-memory mock database store simulating Prisma models & transactions
  class MockDb {
    constructor() {
      this.reset();
    }

    reset() {
      this.users = [
        { id: 'user_1', name: 'Jovab', email: 'jovab@example.com' },
        { id: 'user_2', name: 'Rahul', email: 'rahul@example.com' },
        { id: 'user_3', name: 'Arjun', email: 'arjun@example.com' },
      ];

      this.groups = [
        { id: 'group_1', name: 'Weekend Trip', adminId: 'user_1' },
      ];

      this.memberships = [
        { userId: 'user_1', groupId: 'group_1' },
        { userId: 'user_2', groupId: 'group_1' },
        { userId: 'user_3', groupId: 'group_1' },
      ];

      this.expenses = [
        {
          id: 'exp_100',
          groupId: 'group_1',
          paidById: 'user_1',
          amount: 1500,
          category: 'Food',
          description: 'Team Dinner',
          isEdited: false,
          createdAt: new Date('2026-09-10T12:00:00Z'),
          updatedAt: new Date('2026-09-10T12:00:00Z'),
        },
      ];

      this.splits = [
        { id: 'split_1', expenseId: 'exp_100', userId: 'user_1', share: 500 },
        { id: 'split_2', expenseId: 'exp_100', userId: 'user_2', share: 500 },
        { id: 'split_3', expenseId: 'exp_100', userId: 'user_3', share: 500 },
      ];

      this.editHistory = [];
      this.lock = Promise.resolve();
    }

    // Atomic transaction simulation with mutual exclusion
    async transaction(callback) {
      let release;
      const prevLock = this.lock;
      this.lock = new Promise((res) => { release = res; });
      await prevLock;

      try {
        const tx = {
          expense: {
            updateMany: async ({ where, data }) => {
              const exp = this.expenses.find((e) => e.id === where.id && e.groupId === where.groupId);
              if (!exp) return { count: 0 };
              if (where.isEdited !== undefined && exp.isEdited !== where.isEdited) {
                return { count: 0 };
              }

              // Apply update
              Object.assign(exp, data, { updatedAt: new Date() });
              return { count: 1 };
            },
            findUnique: async ({ where }) => {
              const exp = this.expenses.find((e) => e.id === where.id);
              if (!exp) return null;
              const payer = this.users.find((u) => u.id === exp.paidById);
              const expSplits = this.splits
                .filter((s) => s.expenseId === exp.id)
                .map((s) => ({
                  ...s,
                  user: this.users.find((u) => u.id === s.userId),
                }));
              const hist = this.editHistory
                .filter((h) => h.expenseId === exp.id)
                .map((h) => ({
                  ...h,
                  editedBy: this.users.find((u) => u.id === h.editedById),
                }));
              return {
                ...exp,
                paidBy: payer,
                splits: expSplits,
                editHistory: hist,
              };
            },
          },
          expenseSplit: {
            deleteMany: async ({ where }) => {
              this.splits = this.splits.filter((s) => s.expenseId !== where.expenseId);
            },
            createMany: async ({ data }) => {
              data.forEach((item, idx) => {
                this.splits.push({
                  id: `split_${Date.now()}_${idx}`,
                  ...item,
                });
              });
            },
          },
          expenseEditHistory: {
            create: async ({ data }) => {
              const record = {
                id: `hist_${Date.now()}_${Math.random()}`,
                ...data,
                createdAt: new Date(),
              };
              this.editHistory.push(record);
              return record;
            },
          },
        };

        return await callback(tx);
      } finally {
        release();
      }
    }

    async executeEditExpense(userId, groupId, expenseId, updatePayload) {
      // 1. Check membership
      const isMember = this.memberships.some((m) => m.userId === userId && m.groupId === groupId);
      if (!isMember) {
        return { status: 403, body: { success: false, message: 'You are not a member of this group' } };
      }

      // 2. Find existing expense
      const existing = this.expenses.find((e) => e.id === expenseId && e.groupId === groupId);
      if (!existing) {
        return { status: 404, body: { success: false, message: 'Expense not found' } };
      }

      // 3. Reject if already edited
      if (existing.isEdited) {
        return {
          status: 409,
          body: {
            success: false,
            message: 'This transaction has already been edited and cannot be modified again.',
          },
        };
      }

      const { amount, category, description, paidById, splits } = updatePayload;
      const newAmount = Number(amount);
      const splitTotal = splits.reduce((sum, s) => sum + Number(s.share || 0), 0);

      if (Math.abs(splitTotal - newAmount) > 0.01) {
        return {
          status: 400,
          body: { success: false, message: 'Splits must sum to the updated expense amount' },
        };
      }

      const newPayerId = paidById || existing.paidById;

      // Build changes
      const changes = [];
      const oldAmount = Number(existing.amount);
      if (Math.abs(oldAmount - newAmount) > 0.001) {
        changes.push({ field: 'Amount', from: `₹${oldAmount.toFixed(2)}`, to: `₹${newAmount.toFixed(2)}` });
      }
      if (existing.category !== category) {
        changes.push({ field: 'Category', from: existing.category, to: category });
      }
      if ((existing.description || '') !== (description || '')) {
        changes.push({ field: 'Description', from: existing.description || '(empty)', to: description || '(empty)' });
      }

      const previousData = {
        amount: Number(existing.amount),
        category: existing.category,
        description: existing.description || null,
        paidById: existing.paidById,
        createdAt: existing.createdAt,
        splits: this.splits
          .filter((s) => s.expenseId === existing.id)
          .map((s) => ({
            userId: s.userId,
            share: Number(s.share),
            userName: this.users.find((u) => u.id === s.userId)?.name,
          })),
      };

      // Atomic conditional update
      try {
        const finalExpense = await this.transaction(async (tx) => {
          const updateResult = await tx.expense.updateMany({
            where: {
              id: expenseId,
              groupId,
              isEdited: false,
            },
            data: {
              amount: newAmount,
              category,
              description: description || null,
              paidById: newPayerId,
              isEdited: true,
            },
          });

          if (updateResult.count === 0) {
            const err = new Error('This transaction has already been edited and cannot be modified again.');
            err.statusCode = 409;
            throw err;
          }

          await tx.expenseSplit.deleteMany({ where: { expenseId } });
          await tx.expenseSplit.createMany({
            data: splits.map((s) => ({
              expenseId,
              userId: s.userId,
              share: Number(s.share),
            })),
          });

          await tx.expenseEditHistory.create({
            data: {
              expenseId,
              editedById: userId,
              previousData,
              changes: changes.length > 0 ? changes : [{ field: 'Details', from: 'Original', to: 'Updated' }],
            },
          });

          return await tx.expense.findUnique({ where: { id: expenseId } });
        });

        return {
          status: 200,
          body: {
            success: true,
            expense: finalExpense,
            changes,
            message: 'Expense updated successfully! Edit history preserved.',
          },
        };
      } catch (txErr) {
        if (txErr.statusCode === 409) {
          return {
            status: 409,
            body: { success: false, message: txErr.message },
          };
        }
        throw txErr;
      }
    }
  }

  const db = new MockDb();

  it('1. First valid edit succeeds, sets isEdited = true, and records ExpenseEditHistory', async () => {
    db.reset();

    const response = await db.executeEditExpense('user_1', 'group_1', 'exp_100', {
      amount: 1800,
      category: 'Food',
      description: 'Grand Team Dinner',
      paidById: 'user_1',
      splits: [
        { userId: 'user_1', share: 600 },
        { userId: 'user_2', share: 600 },
        { userId: 'user_3', share: 600 },
      ],
    });

    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.body.success, true);
    assert.strictEqual(response.body.expense.isEdited, true);
    assert.strictEqual(response.body.expense.amount, 1800);
    assert.strictEqual(response.body.expense.description, 'Grand Team Dinner');

    // Verify ExpenseEditHistory
    assert.strictEqual(db.editHistory.length, 1);
    const historyEntry = db.editHistory[0];
    assert.strictEqual(historyEntry.expenseId, 'exp_100');
    assert.strictEqual(historyEntry.editedById, 'user_1');
    assert.strictEqual(historyEntry.previousData.amount, 1500);
    assert.strictEqual(historyEntry.previousData.category, 'Food');
    assert.strictEqual(historyEntry.previousData.description, 'Team Dinner');
    assert.strictEqual(historyEntry.previousData.splits.length, 3);
  });

  it('2. Any second edit attempt is strictly rejected with HTTP 409 Conflict', async () => {
    // Attempt second edit on the now edited expense
    const secondResponse = await db.executeEditExpense('user_1', 'group_1', 'exp_100', {
      amount: 2100,
      category: 'Food',
      description: 'Attempting second edit',
      paidById: 'user_1',
      splits: [
        { userId: 'user_1', share: 700 },
        { userId: 'user_2', share: 700 },
        { userId: 'user_3', share: 700 },
      ],
    });

    assert.strictEqual(secondResponse.status, 409);
    assert.strictEqual(secondResponse.body.success, false);
    assert.match(secondResponse.body.message, /already been edited/i);

    // Expense state remains intact from first edit
    const currentExp = db.expenses.find((e) => e.id === 'exp_100');
    assert.strictEqual(currentExp.amount, 1800);
    assert.strictEqual(currentExp.isEdited, true);
    assert.strictEqual(db.editHistory.length, 1); // No duplicate history record created
  });

  it('3. Direct API edit bypass attempt on already-edited expense is blocked by backend', async () => {
    // Another member (user_2) attempting direct PUT request to the same expense
    const directApiAttempt = await db.executeEditExpense('user_2', 'group_1', 'exp_100', {
      amount: 3000,
      category: 'Food',
      description: 'Hacked bypass edit',
      paidById: 'user_2',
      splits: [
        { userId: 'user_1', share: 1000 },
        { userId: 'user_2', share: 1000 },
        { userId: 'user_3', share: 1000 },
      ],
    });

    assert.strictEqual(directApiAttempt.status, 409);
    assert.strictEqual(directApiAttempt.body.success, false);
    assert.match(directApiAttempt.body.message, /already been edited/i);
  });

  it('4. Concurrency Protection: Two simultaneous edit requests cannot both succeed', async () => {
    db.reset(); // Reset to fresh unedited expense (isEdited: false)

    const payloadA = {
      amount: 1600,
      category: 'Food',
      description: 'Simultaneous Edit A',
      paidById: 'user_1',
      splits: [
        { userId: 'user_1', share: 800 },
        { userId: 'user_2', share: 800 },
      ],
    };

    const payloadB = {
      amount: 1700,
      category: 'Food',
      description: 'Simultaneous Edit B',
      paidById: 'user_2',
      splits: [
        { userId: 'user_2', share: 850 },
        { userId: 'user_3', share: 850 },
      ],
    };

    // Execute both requests simultaneously in parallel
    const [resA, resB] = await Promise.all([
      db.executeEditExpense('user_1', 'group_1', 'exp_100', payloadA),
      db.executeEditExpense('user_2', 'group_1', 'exp_100', payloadB),
    ]);

    const statuses = [resA.status, resB.status];
    assert.ok(statuses.includes(200), 'Exactly one request must succeed with 200');
    assert.ok(statuses.includes(409), 'The other competing request must fail with 409 Conflict');

    // Exactly one history record must be created
    assert.strictEqual(db.editHistory.length, 1);
    const exp = db.expenses.find((e) => e.id === 'exp_100');
    assert.strictEqual(exp.isEdited, true);
  });

  it('5. Validation: Mismatched splits sum is rejected before modifying state', async () => {
    db.reset();

    const badSplitPayload = {
      amount: 1500,
      category: 'Food',
      description: 'Invalid split sum',
      paidById: 'user_1',
      splits: [
        { userId: 'user_1', share: 500 },
        { userId: 'user_2', share: 500 },
        // Missing 500 -> total is 1000 != 1500
      ],
    };

    const res = await db.executeEditExpense('user_1', 'group_1', 'exp_100', badSplitPayload);
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.success, false);

    // Expense remains unedited
    const exp = db.expenses.find((e) => e.id === 'exp_100');
    assert.strictEqual(exp.isEdited, false);
    assert.strictEqual(db.editHistory.length, 0);
  });
});
