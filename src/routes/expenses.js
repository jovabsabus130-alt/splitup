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
router.post('/groups/:groupId/expenses', asyncHandler(async (req, res) => {
  const { groupId } = req.params;
  const parsed = createExpenseSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid expense payload', errors: parsed.error.issues });
  }

  const { amount, category, description, paidById, splits, createdAt } = parsed.data;
  const expensePayerId = paidById || req.userId;
  const expenseAmount = Number(amount);

  if (!Number.isFinite(expenseAmount) || expenseAmount <= 0) {
    throw new BadRequestError('amount must be a positive number');
  }

  const splitTotal = splits.reduce((sum, split) => sum + Number(split.share || 0), 0);

  if (Math.abs(splitTotal - expenseAmount) > EPSILON) {
    throw new BadRequestError('Splits must sum to the expense amount');
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
    throw new ForbiddenError('You are not a member of this group');
  }

  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: { id: true },
  });

  if (!group) {
    throw new NotFoundError('Group not found');
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
    throw new BadRequestError('The payer must belong to the group');
  }

  const uniqueUserIds = [...new Set(splits.map((split) => split.userId))];

  if (uniqueUserIds.length !== splits.length) {
    throw new BadRequestError('Each split userId must appear once per expense');
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
    throw new BadRequestError('All split users must belong to the group');
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
}));

// ── GET /groups/:groupId/expenses ────────────────────────────────────────────
router.get('/groups/:groupId/expenses', asyncHandler(async (req, res) => {
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
    throw new ForbiddenError('You are not a member of this group');
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
}));

// ── PUT /groups/:groupId/expenses/:expenseId ──────────────────────────────────
// Edit an existing transaction and record change history
router.put('/groups/:groupId/expenses/:expenseId', asyncHandler(async (req, res) => {
  const { groupId, expenseId } = req.params;
  const parsed = updateExpenseSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid update payload', errors: parsed.error.issues });
  }

  const { amount, category, description, paidById, splits, createdAt } = parsed.data;
  const newAmount = Number(amount);

  if (!Number.isFinite(newAmount) || newAmount <= 0) {
    throw new BadRequestError('amount must be a positive number');
  }

  const splitTotal = splits.reduce((sum, split) => sum + Number(split.share || 0), 0);
  if (Math.abs(splitTotal - newAmount) > EPSILON) {
    throw new BadRequestError('Splits must sum to the updated expense amount');
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
    throw new ForbiddenError('You are not a member of this group');
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
    throw new NotFoundError('Expense not found');
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
    throw new BadRequestError('The payer must belong to the group');
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
    const [oldPayerUser, newPayerUser] = await Promise.all([
      prisma.user.findUnique({ where: { id: existing.paidById }, select: { name: true } }),
      prisma.user.findUnique({ where: { id: newPayerId }, select: { name: true } }),
    ]);
    changes.push({
      field: 'Paid By',
      from: oldPayerUser?.name || existing.paidById,
      to: newPayerUser?.name || newPayerId,
    });
  }

  let parsedNewDate = existing.createdAt;
  if (createdAt) {
    const testDate = new Date(createdAt);
    if (!isNaN(testDate.getTime())) {
      parsedNewDate = testDate;
    }
  }

  const previousSnapshot = {
    amount: Number(existing.amount),
    category: existing.category,
    description: existing.description,
    paidById: existing.paidById,
    createdAt: existing.createdAt,
    splits: existing.splits.map((s) => ({
      userId: s.userId,
      userName: s.user?.name || s.userId,
      share: Number(s.share),
    })),
  };

  // Perform atomic update inside a transaction
  await prisma.$transaction(async (tx) => {
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
// ── GET /groups/:groupId/expenses/:expenseId/history ─────────────────────────
router.get('/groups/:groupId/expenses/:expenseId/history', asyncHandler(async (req, res) => {
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
    throw new ForbiddenError('You are not a member of this group');
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
}));

module.exports = router;
