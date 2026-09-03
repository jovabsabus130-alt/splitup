const express = require('express');
const { z } = require('zod');

const auth = require('../middleware/auth');
const prisma = require('../lib/prisma');

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
router.post('/groups/:groupId/expenses', async (req, res) => {
  const { groupId } = req.params;
  const parsed = createExpenseSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid expense payload', errors: parsed.error.issues });
  }

  const { amount, category, description, paidById, splits, createdAt } = parsed.data;
  const expensePayerId = paidById || req.userId;
  const expenseAmount = Number(amount);

  if (!Number.isFinite(expenseAmount) || expenseAmount <= 0) {
    return res.status(400).json({ message: 'amount must be a positive number' });
  }

  const splitTotal = splits.reduce((sum, split) => sum + Number(split.share || 0), 0);

  if (Math.abs(splitTotal - expenseAmount) > EPSILON) {
    return res.status(400).json({ message: 'Splits must sum to the expense amount' });
  }

  try {
    const groupMembership = await prisma.groupMember.findUnique({
      where: {
        userId_groupId: {
          userId: req.userId,
          groupId,
        },
      },
    });

    if (!groupMembership) {
      return res.status(403).json({ message: 'You are not a member of this group' });
    }

    const group = await prisma.group.findUnique({
      where: { id: groupId },
      select: { id: true },
    });

    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    // Verify payer is a member of the group
    const payerMembership = await prisma.groupMember.findUnique({
      where: {
        userId_groupId: {
          userId: expensePayerId,
          groupId,
        },
      },
    });

    if (!payerMembership) {
      return res.status(400).json({ message: 'The payer must belong to the group' });
    }

    const uniqueUserIds = [...new Set(splits.map((split) => split.userId))];

    if (uniqueUserIds.length !== splits.length) {
      return res.status(400).json({ message: 'Each split userId must appear once per expense' });
    }

    const groupMembers = await prisma.groupMember.findMany({
      where: {
        groupId,
        userId: {
          in: uniqueUserIds,
        },
      },
      select: {
        userId: true,
      },
    });

    if (groupMembers.length !== uniqueUserIds.length) {
      return res.status(400).json({ message: 'All split users must belong to the group' });
    }

    const expenseDate = createdAt ? new Date(createdAt) : new Date();

    const expense = await prisma.$transaction(async (transaction) => {
      const createdExpense = await transaction.expense.create({
        data: {
          groupId,
          paidById: expensePayerId,
          amount: expenseAmount,
          category,
          description: description || null,
          createdAt: isNaN(expenseDate.getTime()) ? new Date() : expenseDate,
        },
      });

      await transaction.expenseSplit.createMany({
        data: splits.map((split) => ({
          expenseId: createdExpense.id,
          userId: split.userId,
          share: Number(split.share),
        })),
      });

      return createdExpense;
    });

    return res.status(201).json({ expense });
  } catch (error) {
    console.error('Create expense error:', error);
    return res.status(500).json({ message: 'Failed to create expense' });
  }
});

// ── GET /groups/:groupId/expenses ────────────────────────────────────────────
router.get('/groups/:groupId/expenses', async (req, res) => {
  const { groupId } = req.params;

  try {
    const groupMembership = await prisma.groupMember.findUnique({
      where: {
        userId_groupId: {
          userId: req.userId,
          groupId,
        },
      },
    });

    if (!groupMembership) {
      return res.status(403).json({ message: 'You are not a member of this group' });
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

    return res.status(200).json({ expenses });
  } catch (error) {
    console.error('Fetch expenses error:', error);
    return res.status(500).json({ message: 'Failed to fetch expenses' });
  }
});

// ── PUT /groups/:groupId/expenses/:expenseId ──────────────────────────────────
// Edit an existing transaction and record change history
router.put('/groups/:groupId/expenses/:expenseId', async (req, res) => {
  const { groupId, expenseId } = req.params;
  const parsed = updateExpenseSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid update payload', errors: parsed.error.issues });
  }

  const { amount, category, description, paidById, splits, createdAt } = parsed.data;
  const newAmount = Number(amount);

  if (!Number.isFinite(newAmount) || newAmount <= 0) {
    return res.status(400).json({ message: 'amount must be a positive number' });
  }

  const splitTotal = splits.reduce((sum, split) => sum + Number(split.share || 0), 0);
  if (Math.abs(splitTotal - newAmount) > EPSILON) {
    return res.status(400).json({ message: 'Splits must sum to the updated expense amount' });
  }

  try {
    const membership = await prisma.groupMember.findUnique({
      where: {
        userId_groupId: {
          userId: req.userId,
          groupId,
        },
      },
    });

    if (!membership) {
      return res.status(403).json({ message: 'You are not a member of this group' });
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
      return res.status(404).json({ message: 'Expense not found' });
    }

    const newPayerId = paidById || existing.paidById;

    // Verify new payer is member
    const payerMembership = await prisma.groupMember.findUnique({
      where: {
        userId_groupId: {
          userId: newPayerId,
          groupId,
        },
      },
    });

    if (!payerMembership) {
      return res.status(400).json({ message: 'The payer must belong to the group' });
    }

    // Compare and build change log
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
      const newPayerUser = await prisma.user.findUnique({ where: { id: newPayerId }, select: { name: true } });
      changes.push({
        field: 'Paid By',
        from: existing.paidBy?.name || existing.paidById,
        to: newPayerUser?.name || newPayerId,
      });
    }

    let parsedNewDate = createdAt ? new Date(createdAt) : null;
    if (parsedNewDate && !isNaN(parsedNewDate.getTime())) {
      const oldDateStr = new Date(existing.createdAt).toISOString().split('T')[0];
      const newDateStr = parsedNewDate.toISOString().split('T')[0];
      if (oldDateStr !== newDateStr) {
        changes.push({
          field: 'Date',
          from: oldDateStr,
          to: newDateStr,
        });
      }
    } else {
      parsedNewDate = existing.createdAt;
    }

    // Check splits change
    const oldSplitsMap = {};
    existing.splits.forEach((s) => {
      oldSplitsMap[s.userId] = Number(s.share);
    });

    let splitsChanged = false;
    if (splits.length !== existing.splits.length) {
      splitsChanged = true;
    } else {
      for (const s of splits) {
        if (Math.abs((oldSplitsMap[s.userId] || 0) - Number(s.share)) > 0.005) {
          splitsChanged = true;
          break;
        }
      }
    }

    if (splitsChanged) {
      changes.push({
        field: 'Splits / Participants',
        from: `${existing.splits.length} members`,
        to: `${splits.length} members`,
      });
    }

    const previousSnapshot = {
      amount: oldAmount,
      category: existing.category,
      description: existing.description,
      paidById: existing.paidById,
      paidByName: existing.paidBy?.name,
      createdAt: existing.createdAt,
      splits: existing.splits.map((s) => ({
        userId: s.userId,
        userName: s.user?.name,
        share: Number(s.share),
      })),
    };

    // Execute atomic update
    const updatedExpense = await prisma.$transaction(async (tx) => {
      // 1. Update expense
      const updated = await tx.expense.update({
        where: { id: expenseId },
        data: {
          amount: newAmount,
          category,
          description: description || null,
          paidById: newPayerId,
          createdAt: parsedNewDate,
          isEdited: true,
          updatedAt: new Date(),
        },
      });

      // 2. Replace splits
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

      // 3. Record history if there were changes
      if (changes.length > 0) {
        await tx.expenseEditHistory.create({
          data: {
            expenseId,
            editedById: req.userId,
            previousData: previousSnapshot,
            changes: changes,
          },
        });
      }

      return updated;
    });

    // Fetch complete updated expense with relations
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
      expense: finalExpense,
      changes,
      message: 'Expense updated successfully! Edit history preserved.',
    });
  } catch (error) {
    console.error('Update expense error:', error);
    return res.status(500).json({ message: 'Failed to update expense' });
  }
});

// ── GET /groups/:groupId/expenses/:expenseId/history ─────────────────────────
router.get('/groups/:groupId/expenses/:expenseId/history', async (req, res) => {
  const { groupId, expenseId } = req.params;

  try {
    const membership = await prisma.groupMember.findUnique({
      where: {
        userId_groupId: {
          userId: req.userId,
          groupId,
        },
      },
    });

    if (!membership) {
      return res.status(403).json({ message: 'You are not a member of this group' });
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

    return res.status(200).json({ history });
  } catch (error) {
    console.error('Fetch history error:', error);
    return res.status(500).json({ message: 'Failed to fetch expense history' });
  }
});

module.exports = router;
