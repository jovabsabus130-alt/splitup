const express = require('express');
const { z } = require('zod');

const auth = require('../middleware/auth');
const prisma = require('../lib/prisma');
const { asyncHandler, BadRequestError, ForbiddenError, NotFoundError, ConflictError } = require('../middleware/errorHandler');

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

    const group = await prisma.group.findUnique({
      where: { id: groupId },
      select: { id: true, isDeleted: true },
    });

    if (!group) {
      return res.status(404).json({ success: false, message: 'Group not found' });
    }

    if (group.isDeleted) {
      return res.status(400).json({
        success: false,
        message: 'This group is deleted/archived. New transactions cannot be added.',
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
          createdById: req.userId,
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

    // Notify group members (excluding creator)
    const [groupInfo, creatorUser, groupMembers] = await Promise.all([
      prisma.group.findUnique({ where: { id: groupId }, select: { name: true } }),
      prisma.user.findUnique({ where: { id: req.userId }, select: { name: true } }),
      prisma.groupMember.findMany({ where: { groupId }, select: { userId: true } }),
    ]);

    const recipientIds = Array.from(
      new Set(groupMembers.map((m) => m.userId))
    ).filter((uid) => uid !== req.userId);

    if (recipientIds.length > 0) {
      const expenseTitle = description || category;
      const amountStr = expenseAmount.toFixed(2);
      const creatorName = creatorUser?.name || 'A group member';
      const groupName = groupInfo?.name || 'Group';

      await prisma.notification.createMany({
        data: recipientIds.map((uid) => {
          const userSplit = splits.find((s) => s.userId === uid);
          const shareText = userSplit ? ` Your share: ₹${Number(userSplit.share).toFixed(2)}.` : '';
          return {
            userId: uid,
            groupId,
            type: 'expense_created',
            title: 'New Expense Added',
            message: `${creatorName} added "${expenseTitle}" (₹${amountStr}) in ${groupName}.${shareText}`,
            data: {
              expenseId: expense.id,
              groupId,
              groupName,
              amount: expenseAmount,
              category,
              description,
            },
          };
        }),
      });
    }

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
        createdBy: {
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
        concerns: {
          orderBy: { createdAt: 'desc' },
          include: {
            raisedBy: {
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
// Edit an existing transaction once, record change history and previous state, and lock from future edits
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

    // Strictly authorize ONLY the person who logged/created this transaction (with fallback for legacy records)
    const isCreator = existing.createdById
      ? existing.createdById === req.userId
      : existing.paidById === req.userId;

    if (!isCreator) {
      return res.status(403).json({
        success: false,
        message: 'Only the person who logged this transaction has permission to edit it.',
      });
    }

    // Strictly enforce single-edit rule
    if (existing.isEdited) {
      return res.status(409).json({
        success: false,
        message: 'This transaction has already been edited and cannot be modified again.',
      });
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

    // Preserve previous transaction state snapshot
    const previousData = {
      amount: Number(existing.amount),
      category: existing.category,
      description: existing.description || null,
      paidById: existing.paidById,
      createdAt: existing.createdAt,
      splits: existing.splits.map((s) => ({
        userId: s.userId,
        share: Number(s.share),
        userName: s.user?.name || null,
      })),
    };

    // Concurrency-safe atomic update transaction
    try {
      await prisma.$transaction(async (tx) => {
        // Atomic conditional update ensuring isEdited is still false
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
            ...(createdAt ? { createdAt: new Date(createdAt) } : {}),
          },
        });

        if (updateResult.count === 0) {
          throw new ConflictError('This transaction has already been edited and cannot be modified again.');
        }

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

        await tx.expenseEditHistory.create({
          data: {
            expenseId,
            editedById: req.userId,
            previousData,
            changes: changes.length > 0 ? changes : [{ field: 'Details', from: 'Original', to: 'Updated' }],
          },
        });
      });
    } catch (txError) {
      if (txError instanceof ConflictError || txError.statusCode === 409 || txError.status === 409) {
        return res.status(409).json({
          success: false,
          message: txError.message || 'This transaction has already been edited and cannot be modified again.',
        });
      }
      throw txError;
    }

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

    // Notify group members (excluding editor)
    const [groupInfo, editorUser, groupMembers] = await Promise.all([
      prisma.group.findUnique({ where: { id: groupId }, select: { name: true } }),
      prisma.user.findUnique({ where: { id: req.userId }, select: { name: true } }),
      prisma.groupMember.findMany({ where: { groupId }, select: { userId: true } }),
    ]);

    const recipientIds = Array.from(
      new Set(groupMembers.map((m) => m.userId))
    ).filter((uid) => uid !== req.userId);

    if (recipientIds.length > 0) {
      const expenseTitle = description || category;
      const amountStr = newAmount.toFixed(2);
      const editorName = editorUser?.name || 'A group member';
      const groupName = groupInfo?.name || 'Group';

      await prisma.notification.createMany({
        data: recipientIds.map((uid) => ({
          userId: uid,
          groupId,
          type: 'expense_edited',
          title: 'Expense Updated',
          message: `${editorName} updated "${expenseTitle}" (₹${amountStr}) in ${groupName}.`,
          data: {
            expenseId,
            groupId,
            groupName,
            amount: newAmount,
            category,
            description,
          },
        })),
      });
    }

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

// ── DELETE /groups/:groupId/expenses/:expenseId ───────────────────────────────
// Delete an accidental duplicate or errant transaction.
// Enforces authorization: ONLY the transaction creator/payer (paidById) can delete this transaction.
async function handleDeleteExpense(req, res, next) {
  try {
    const { groupId, expenseId } = req.params;

    // 1. Fetch existing expense
    const existing = await prisma.expense.findUnique({
      where: { id: expenseId },
      include: {
        paidBy: { select: { id: true, name: true, email: true } },
        group: { select: { id: true, name: true } },
        splits: {
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    const targetGroupId = groupId || existing?.groupId;

    if (!existing || (groupId && existing.groupId !== groupId)) {
      return res.status(404).json({ success: false, message: 'Expense not found' });
    }

    // 2. Verify authenticated user is a group member
    const membership = await prisma.groupMember.findUnique({
      where: {
        userId_groupId: {
          userId: req.userId,
          groupId: targetGroupId,
        },
      },
    });

    if (!membership) {
      return res.status(403).json({ success: false, message: 'You are not a member of this group' });
    }

    // 3. Strict Authorization: ONLY the creator/payer can delete this transaction
    if (existing.paidById !== req.userId) {
      return res.status(403).json({
        success: false,
        message: 'Only the member who created this transaction can delete it.',
      });
    }

    if (existing.isDeleted) {
      return res.status(400).json({
        success: false,
        message: 'This transaction has already been deleted.',
      });
    }

    const oldAmount = Number(existing.amount);
    const reason = (req.body && typeof req.body.reason === 'string' && req.body.reason.trim())
      ? req.body.reason.trim()
      : 'Accidental duplicate / errant transaction deleted by creator';

    // 4. Atomic soft deletion + audit history preservation
    const deletedDate = new Date();
    await prisma.$transaction(async (tx) => {
      // Mark expense as deleted
      await tx.expense.update({
        where: { id: expenseId },
        data: {
          isDeleted: true,
          deletedAt: deletedDate,
        },
      });

      // Record in EditHistory for complete audit trail
      await tx.expenseEditHistory.create({
        data: {
          expenseId,
          editedById: req.userId,
          changes: [
            {
              field: 'Status',
              from: 'Active',
              to: 'Deleted 🗑️',
            },
            {
              field: 'Amount',
              from: `₹${oldAmount.toFixed(2)}`,
              to: '₹0.00 (Deleted/Voided)',
            },
            {
              field: 'Reason',
              from: 'Active Transaction',
              to: reason,
            },
          ],
          previousData: {
            amount: oldAmount,
            category: existing.category,
            description: existing.description || null,
            paidById: existing.paidById,
            createdAt: existing.createdAt,
            deletedAt: deletedDate,
            deletedById: req.userId,
            isDeleted: true,
            splits: existing.splits.map((s) => ({
              userId: s.userId,
              share: Number(s.share),
              userName: s.user?.name || null,
            })),
          },
        },
      });
    });

    // 5. Notify group members (excluding the creator who deleted it)
    const groupMembers = await prisma.groupMember.findMany({
      where: { groupId: targetGroupId },
      select: { userId: true },
    });

    const recipientIds = Array.from(new Set(groupMembers.map((m) => m.userId))).filter(
      (uid) => uid !== req.userId
    );

    if (recipientIds.length > 0) {
      const expenseTitle = existing.description || existing.category;
      const amountStr = oldAmount.toFixed(2);
      const creatorName = existing.paidBy?.name || 'The creator';
      const groupName = existing.group?.name || 'Group';

      await prisma.notification.createMany({
        data: recipientIds.map((uid) => ({
          userId: uid,
          groupId: targetGroupId,
          type: 'expense_deleted',
          title: 'Transaction Deleted',
          message: `${creatorName} deleted transaction "${expenseTitle}" (₹${amountStr}) in ${groupName}. Balances have been updated.`,
          data: {
            expenseId,
            groupId: targetGroupId,
            groupName,
            amount: oldAmount,
            category: existing.category,
            description: existing.description,
            deletedAt: deletedDate,
          },
        })),
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Transaction has been deleted successfully and archived in history.',
      deletedExpenseId: expenseId,
      previousAmount: oldAmount,
    });
  } catch (error) {
    console.error('Delete expense error:', error);
    next(error);
  }
}

router.delete('/groups/:groupId/expenses/:expenseId', handleDeleteExpense);
router.delete('/expenses/:expenseId', handleDeleteExpense);

const createConcernSchema = z.object({
  reason: z.string().trim().min(1, 'Reason is required'),
});

const respondConcernSchema = z.object({
  payerResponse: z.string().trim().min(1, 'Response is required'),
  status: z.enum(['resolved', 'dismissed', 'pending']).optional().default('resolved'),
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

    const expense = await prisma.expense.findUnique({
      where: { id: expenseId },
      select: { id: true, groupId: true },
    });

    if (!expense || expense.groupId !== groupId) {
      return res.status(404).json({ success: false, message: 'Expense not found in this group' });
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

// ── POST /groups/:groupId/expenses/:expenseId/concerns ────────────────────────
// Raise a concern/flag against a specific transaction and notify the payer
router.post('/groups/:groupId/expenses/:expenseId/concerns', async (req, res, next) => {
  try {
    const { groupId, expenseId } = req.params;
    const parsed = createConcernSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: 'Invalid concern payload',
        errors: parsed.error.issues,
      });
    }

    // 1. Verify authenticated user belongs to group
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

    // 2. Verify expense exists and belongs to group
    const expense = await prisma.expense.findUnique({
      where: { id: expenseId },
      include: {
        group: { select: { id: true, name: true } },
        paidBy: { select: { id: true, name: true, email: true } },
      },
    });

    if (!expense || expense.groupId !== groupId) {
      return res.status(404).json({ success: false, message: 'Expense not found in this group' });
    }

    // 3. Create concern
    const concern = await prisma.transactionConcern.create({
      data: {
        expenseId,
        raisedById: req.userId,
        reason: parsed.data.reason,
        status: 'pending',
      },
      include: {
        raisedBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    // 4. Notify the expense payer
    const raiserUser = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { id: true, name: true },
    });

    const raiserName = raiserUser?.name || 'A group member';
    const groupName = expense.group?.name || 'Group';
    const expenseDesc = expense.description || expense.category;
    const amountFormatted = Number(expense.amount).toFixed(2);

    await prisma.notification.create({
      data: {
        userId: expense.paidById,
        groupId,
        type: 'concern_raised',
        title: 'Transaction Concern Raised',
        message: `${raiserName} raised a concern regarding "${expenseDesc}" (₹${amountFormatted}) in ${groupName}: "${parsed.data.reason}"`,
        data: {
          concernId: concern.id,
          expenseId,
          groupId,
          raisedById: req.userId,
          reason: parsed.data.reason,
        },
      },
    });

    return res.status(201).json({
      success: true,
      concern,
      message: 'Concern raised successfully and payer notified.',
    });
  } catch (error) {
    console.error('Create concern error:', error);
    next(error);
  }
});

// ── GET /groups/:groupId/expenses/:expenseId/concerns ─────────────────────────
// Retrieve all concerns/flags for a specific transaction
router.get('/groups/:groupId/expenses/:expenseId/concerns', async (req, res, next) => {
  try {
    const { groupId, expenseId } = req.params;

    // 1. Verify authenticated user belongs to group
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

    // 2. Verify expense exists and belongs to group
    const expense = await prisma.expense.findUnique({
      where: { id: expenseId },
      select: { id: true, groupId: true },
    });

    if (!expense || expense.groupId !== groupId) {
      return res.status(404).json({ success: false, message: 'Expense not found in this group' });
    }

    // 3. Fetch concerns for this expense
    const concerns = await prisma.transactionConcern.findMany({
      where: { expenseId },
      orderBy: { createdAt: 'desc' },
      include: {
        raisedBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    return res.status(200).json({ success: true, concerns });
  } catch (error) {
    console.error('Fetch concerns error:', error);
    next(error);
  }
});

// ── PATCH /groups/:groupId/expenses/:expenseId/concerns/:concernId/respond ────
// Only the payer of the expense can respond to and resolve/dismiss concerns
router.patch('/groups/:groupId/expenses/:expenseId/concerns/:concernId/respond', async (req, res, next) => {
  try {
    const { groupId, expenseId, concernId } = req.params;
    const parsed = respondConcernSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: 'Invalid response payload',
        errors: parsed.error.issues,
      });
    }

    // 1. Verify authenticated user belongs to group
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

    // 2. Verify expense exists and belongs to group
    const expense = await prisma.expense.findUnique({
      where: { id: expenseId },
      include: {
        group: { select: { id: true, name: true } },
        paidBy: { select: { id: true, name: true } },
      },
    });

    if (!expense || expense.groupId !== groupId) {
      return res.status(404).json({ success: false, message: 'Expense not found in this group' });
    }

    // 3. Verify concern exists and belongs to this expense
    const concern = await prisma.transactionConcern.findUnique({
      where: { id: concernId },
      include: {
        raisedBy: { select: { id: true, name: true, email: true } },
      },
    });

    if (!concern || concern.expenseId !== expenseId) {
      return res.status(404).json({ success: false, message: 'Concern not found for this expense' });
    }

    // 4. Strictly verify that authenticated user is the payer of the expense
    if (expense.paidById !== req.userId) {
      return res.status(403).json({
        success: false,
        message: 'Only the payer of the expense can respond to concerns',
      });
    }

    // 5. Update concern status, response, and resolved timestamp
    const resolvedAt = new Date();
    const updatedConcern = await prisma.transactionConcern.update({
      where: { id: concernId },
      data: {
        payerResponse: parsed.data.payerResponse,
        status: parsed.data.status || 'resolved',
        resolvedAt,
      },
      include: {
        raisedBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    // 6. Notify the user who raised the concern
    const payerUser = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { id: true, name: true },
    });

    const payerName = payerUser?.name || 'The expense payer';
    const groupName = expense.group?.name || 'Group';
    const expenseDesc = expense.description || expense.category;

    await prisma.notification.create({
      data: {
        userId: concern.raisedById,
        groupId,
        type: 'concern_responded',
        title: 'Response to Transaction Concern',
        message: `${payerName} responded to your concern on "${expenseDesc}" in ${groupName}: "${parsed.data.payerResponse}"`,
        data: {
          concernId: concern.id,
          expenseId,
          groupId,
          payerId: req.userId,
          status: parsed.data.status || 'resolved',
          payerResponse: parsed.data.payerResponse,
        },
      },
    });

    return res.status(200).json({
      success: true,
      concern: updatedConcern,
      message: 'Response recorded and raiser notified.',
    });
  } catch (error) {
    console.error('Respond to concern error:', error);
    next(error);
  }
});

module.exports = router;
