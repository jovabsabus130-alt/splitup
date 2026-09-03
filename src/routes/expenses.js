const express = require('express');
const { z } = require('zod');

const auth = require('../middleware/auth');
const prisma = require('../lib/prisma');
const { asyncHandler, BadRequestError, ForbiddenError, NotFoundError } = require('../middleware/errorHandler');

const router = express.Router();
const EPSILON = 0.01;

const createExpenseSchema = z.object({
  amount: z.coerce.number().positive(),
  category: z.string().trim().min(1),
  description: z.string().trim().optional().nullable(),
  paidById: z.string().trim().min(1).optional(),
  createdAt: z.string().optional().nullable(),
  splits: z.array(
    z.object({
      userId: z.string().trim().min(1),
      share: z.coerce.number().nonnegative(),
    })
  ).min(1),
});

const updateExpenseSchema = z.object({
  amount: z.coerce.number().positive(),
  category: z.string().trim().min(1),
  description: z.string().trim().optional().nullable(),
  paidById: z.string().trim().min(1).optional(),
  createdAt: z.string().optional().nullable(),
  splits: z.array(
    z.object({
      userId: z.string().trim().min(1),
      share: z.coerce.number().nonnegative(),
    })
  ).min(1),
});

router.use(auth);

// ── POST /groups/:groupId/expenses ───────────────────────────────────────────
// Concept: Server-side error handling (try/catch + error middleware)
router.post('/groups/:groupId/expenses', async (req, res, next) => {
  try {
    const { groupId } = req.params;
    const parsed = createExpenseSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ success: false, message: 'Invalid expense payload', errors: parsed.error.issues });
    }

    const { amount, category, description, paidById, splits, createdAt } = parsed.data;
    const expensePayerId = paidById || req.userId;
    const expenseAmount = Number(amount);

    if (!Number.isFinite(expenseAmount) || expenseAmount <= 0) {
      return res.status(400).json({ success: false, message: 'amount must be a positive number' });
    }

    const splitTotal = splits.reduce((sum, split) => sum + Number(split.share || 0), 0);

    if (Math.abs(splitTotal - expenseAmount) > EPSILON) {
      return res.status(400).json({
        success: false,
        message: 'Splits must sum to the total expense amount',
        splitTotal,
        expenseAmount,
      });
    }

    const groupMembership = await prisma.groupMember.findUnique({
      where: {
        userId_groupId: {
          userId: req.userId,
          groupId,
        },
      },
    });

    if (!groupMembership) {
      return res.status(403).json({ success: false, message: 'You are not a member of this group' });
    }

    const participantIds = Array.from(new Set([expensePayerId, ...splits.map((s) => s.userId)]));

    const validMembers = await prisma.groupMember.findMany({
      where: {
        groupId,
        userId: { in: participantIds },
      },
      select: { userId: true },
    });

    if (validMembers.length !== participantIds.length) {
      return res.status(400).json({
        success: false,
        message: 'All split participants and payer must be members of the group',
      });
    }

    const expenseDate = createdAt ? new Date(createdAt) : new Date();

    const expense = await prisma.$transaction(async (tx) => {
      const created = await tx.expense.create({
        data: {
          groupId,
          paidById: expensePayerId,
          amount: expenseAmount,
          category,
          description: description || null,
          createdAt: expenseDate,
        },
      });

      await tx.expenseSplit.createMany({
        data: splits.map((split) => ({
          expenseId: created.id,
          userId: split.userId,
          share: Number(split.share),
        })),
      });

      return created;
    });

    const fullExpense = await prisma.expense.findUnique({
      where: { id: expense.id },
      include: {
        paidBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        splits: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
      },
    });

    return res.status(201).json({ success: true, expense: fullExpense });
  } catch (error) {
    console.error('Create expense error:', error);
    next(error);
  }
});

// ── GET /groups/:groupId/expenses ────────────────────────────────────────────
router.get('/groups/:groupId/expenses', async (req, res, next) => {
  try {
    const { groupId } = req.params;

    const groupMembership = await prisma.groupMember.findUnique({
      where: {
        userId_groupId: {
          userId: req.userId,
          groupId,
        },
      },
    });

    if (!groupMembership) {
      return res.status(403).json({ success: false, message: 'You are not a member of this group' });
    }

    const expenses = await prisma.expense.findMany({
      where: { groupId },
      orderBy: { createdAt: 'desc' },
      include: {
        paidBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        splits: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
        editHistory: {
          orderBy: { createdAt: 'desc' },
          include: {
            editedBy: {
              select: { id: true, name: true, email: true },
            },
          },
        },
      },
    });

    return res.status(200).json({ success: true, expenses });
  } catch (error) {
    console.error('Fetch expenses error:', error);
    next(error);
  }
});

// ── PUT /groups/:groupId/expenses/:expenseId ──────────────────────────────────
// Edit an existing transaction and record change history
router.put('/groups/:groupId/expenses/:expenseId', async (req, res, next) => {
  try {
    const { groupId, expenseId } = req.params;
    const parsed = updateExpenseSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ success: false, message: 'Invalid update payload', errors: parsed.error.issues });
    }

    const { amount, category, description, paidById, splits, createdAt } = parsed.data;
    const newAmount = Number(amount);

    if (!Number.isFinite(newAmount) || newAmount <= 0) {
      return res.status(400).json({ success: false, message: 'amount must be a positive number' });
    }

    const splitTotal = splits.reduce((sum, split) => sum + Number(split.share || 0), 0);
    if (Math.abs(splitTotal - newAmount) > EPSILON) {
      return res.status(400).json({ success: false, message: 'Splits must sum to the updated expense amount' });
    }

    const membership = await prisma.groupMember.findUnique({
      where: {
        userId_groupId: {
          userId: req.userId,
          groupId,
        },
      },
    });

    if (!membership) {
      return res.status(403).json({ success: false, message: 'You are not a member of this group' });
    }

    const existing = await prisma.expense.findUnique({
      where: { id: expenseId },
      include: {
        paidBy: { select: { id: true, name: true } },
        splits: {
          include: {
            user: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!existing || existing.groupId !== groupId) {
      return res.status(404).json({ success: false, message: 'Expense not found' });
    }

    const newPayerId = paidById || existing.paidById;
    const participantIds = Array.from(new Set([newPayerId, ...splits.map((s) => s.userId)]));
    const validMembers = await prisma.groupMember.findMany({
      where: {
        groupId,
        userId: { in: participantIds },
      },
      select: { userId: true },
    });

    if (validMembers.length !== participantIds.length) {
      return res.status(400).json({
        success: false,
        message: 'All split participants and payer must be members of the group',
      });
    }

    // Build human-readable changelog
    const changes = [];

    const oldAmount = Number(existing.amount);
    if (Math.abs(oldAmount - newAmount) > 0.001) {
      changes.push({
        field: 'Amount',
        from: `₹${oldAmount.toFixed(2)}`,
        to: `₹${newAmount.toFixed(2)}`,
      });
    }

    if (existing.category !== category) {
      changes.push({
        field: 'Category',
        from: existing.category,
        to: category,
      });
    }

    const oldDesc = existing.description || '';
    const newDesc = description || '';
    if (oldDesc !== newDesc) {
      changes.push({
        field: 'Description',
        from: oldDesc || '(empty)',
        to: newDesc || '(empty)',
      });
    }

    if (existing.paidById !== newPayerId) {
      const newPayerUser = await prisma.user.findUnique({
        where: { id: newPayerId },
        select: { name: true },
      });
      changes.push({
        field: 'Paid By',
        from: existing.paidBy?.name || 'Unknown',
        to: newPayerUser?.name || 'Unknown',
      });
    }

    // Check for split changes
    const oldSplitMap = {};
    existing.splits.forEach((s) => {
      oldSplitMap[s.userId] = {
        name: s.user?.name || s.userId,
        share: Number(s.share),
      };
    });

    const newSplitMap = {};
    splits.forEach((s) => {
      newSplitMap[s.userId] = Number(s.share);
    });

    const allSplitUsers = Array.from(
      new Set([...Object.keys(oldSplitMap), ...Object.keys(newSplitMap)])
    );

    let splitsChanged = false;
    for (const uid of allSplitUsers) {
      const oldVal = oldSplitMap[uid]?.share || 0;
      const newVal = newSplitMap[uid] || 0;
      if (Math.abs(oldVal - newVal) > 0.01) {
        splitsChanged = true;
        break;
      }
    }

    if (splitsChanged) {
      changes.push({
        field: 'Splits Rebalanced',
        from: `${existing.splits.length} member(s)`,
        to: `${splits.length} member(s)`,
      });
    }

    // Atomic update transaction
    await prisma.$transaction(async (tx) => {
      const updated = await tx.expense.update({
        where: { id: expenseId },
        data: {
          amount: newAmount,
          category,
          description: description || null,
          paidById: newPayerId,
          ...(createdAt ? { createdAt: new Date(createdAt) } : {}),
        },
      });

      await tx.expenseSplit.deleteMany({
        where: { expenseId },
      });

      await tx.expenseSplit.createMany({
        data: splits.map((s) => ({
          expenseId,
          userId: s.userId,
          share: Number(s.share),
        })),
      });

      if (changes.length > 0) {
        await tx.expenseEditHistory.create({
          data: {
            expenseId,
            editedById: req.userId,
            changes,
          },
        });
      }

      return updated;
    });

    const finalExpense = await prisma.expense.findUnique({
      where: { id: expenseId },
      include: {
        paidBy: { select: { id: true, name: true, email: true } },
        splits: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
        editHistory: {
          orderBy: { createdAt: 'desc' },
          include: {
            editedBy: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    return res.status(200).json({
      success: true,
      expense: finalExpense,
      changes,
      message: 'Expense updated successfully! Edit history preserved.',
    });
  } catch (error) {
    console.error('Update expense error:', error);
    next(error);
  }
});

// ── GET /groups/:groupId/expenses/:expenseId/history ─────────────────────────
router.get('/groups/:groupId/expenses/:expenseId/history', async (req, res, next) => {
  try {
    const { groupId, expenseId } = req.params;

    const membership = await prisma.groupMember.findUnique({
      where: {
        userId_groupId: {
          userId: req.userId,
          groupId,
        },
      },
    });

    if (!membership) {
      return res.status(403).json({ success: false, message: 'You are not a member of this group' });
    }

    const history = await prisma.expenseEditHistory.findMany({
      where: { expenseId },
      orderBy: { createdAt: 'desc' },
      include: {
        editedBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    return res.status(200).json({ success: true, history });
  } catch (error) {
    console.error('Fetch history error:', error);
    next(error);
  }
});

module.exports = router;
