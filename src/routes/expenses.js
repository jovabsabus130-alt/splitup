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
  splits: z.array(
    z.object({
      userId: z.string().trim().min(1),
      share: z.coerce.number().nonnegative(),
    })
  ).min(1),
});

router.use(auth);

router.post('/groups/:groupId/expenses', async (req, res) => {
  const { groupId } = req.params;
  const parsed = createExpenseSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid expense payload' });
  }

  const { amount, category, description, paidById, splits } = parsed.data;
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

    const expense = await prisma.$transaction(async (transaction) => {
      const createdExpense = await transaction.expense.create({
        data: {
          groupId,
          paidById: expensePayerId,
          amount: expenseAmount,
          category,
          description,
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
    return res.status(500).json({ message: 'Failed to create expense' });
  }
});

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
      },
    });

    return res.status(200).json({ expenses });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch expenses' });
  }
});

module.exports = router;
