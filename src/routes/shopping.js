const express = require('express');
const { z } = require('zod');

const auth = require('../middleware/auth');
const prisma = require('../lib/prisma');

const router = express.Router({ mergeParams: true });
router.use(auth);

// ── Helpers ───────────────────────────────────────────────────────────────────

async function assertMember(userId, groupId) {
  const m = await prisma.groupMember.findUnique({
    where: { userId_groupId: { userId, groupId } },
  });
  return !!m;
}

// ── Schemas ───────────────────────────────────────────────────────────────────

const addItemSchema = z.object({
  name: z.string().trim().min(1, 'Item name is required'),
  price: z.number().positive('Price must be a positive number').optional(),
  quantity: z.coerce.number().int().positive('Quantity must be a positive integer').optional().default(1),
  category: z.string().trim().min(1).optional().default('Shopping'),
});

const updateItemSchema = z.object({
  name: z.string().trim().min(1).optional(),
  price: z.number().positive().optional().nullable(),
  quantity: z.coerce.number().int().positive('Quantity must be a positive integer').optional(),
  category: z.string().trim().min(1).optional(),
  completed: z.boolean().optional(),
});

const splitItemSchema = z.object({
  paidById: z.string().min(1, 'Payer ID is required'),
  category: z.string().trim().min(1).optional(),
  splits: z.array(
    z.object({
      userId: z.string().min(1, 'User ID is required'),
      share: z.number().min(0, 'Share cannot be negative'),
    })
  ).min(1, 'At least one split is required'),
});

// ── GET /api/groups/:groupId/shopping ─────────────────────────────────────────
// Concept: Server-side error handling (try/catch + error middleware)
router.get('/', async (req, res, next) => {
  try {
    const { groupId } = req.params;
    if (!(await assertMember(req.userId, groupId))) {
      return res.status(403).json({ success: false, message: 'You are not a member of this group' });
    }

    const items = await prisma.shoppingItem.findMany({
      where: { groupId },
      include: { addedBy: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });

    return res.status(200).json({ success: true, items });
  } catch (error) {
    console.error('Fetch shopping items error:', error);
    next(error);
  }
});

// ── POST /api/groups/:groupId/shopping ────────────────────────────────────────
router.post('/', async (req, res, next) => {
  try {
    const { groupId } = req.params;
    if (!(await assertMember(req.userId, groupId))) {
      return res.status(403).json({ success: false, message: 'You are not a member of this group' });
    }

    const parsed = addItemSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: 'Invalid item payload',
        errors: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }

    const item = await prisma.shoppingItem.create({
      data: {
        groupId,
        addedById: req.userId,
        name: parsed.data.name,
        quantity: parsed.data.quantity ?? 1,
        category: parsed.data.category || 'Shopping',
        ...(parsed.data.price != null ? { price: parsed.data.price } : {}),
      },
      include: { addedBy: { select: { id: true, name: true } } },
    });

    return res.status(201).json({ success: true, item });
  } catch (error) {
    console.error('Create shopping item error:', error);
    next(error);
  }
});

// ── PATCH /api/groups/:groupId/shopping/:itemId ───────────────────────────────
router.patch('/:itemId', async (req, res, next) => {
  try {
    const { groupId, itemId } = req.params;
    if (!(await assertMember(req.userId, groupId))) {
      return res.status(403).json({ success: false, message: 'You are not a member of this group' });
    }

    const parsed = updateItemSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: 'Invalid update payload',
        errors: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }

    const item = await prisma.shoppingItem.findFirst({ where: { id: itemId, groupId } });
    if (!item) {
      return res.status(404).json({ success: false, message: 'Shopping item not found' });
    }

    const data = {};
    if (parsed.data.name !== undefined) data.name = parsed.data.name;
    if (parsed.data.completed !== undefined) data.completed = parsed.data.completed;
    if (parsed.data.quantity !== undefined) data.quantity = parsed.data.quantity;
    if (parsed.data.category !== undefined) data.category = parsed.data.category;
    if ('price' in parsed.data) {
      data.price = parsed.data.price;
    }

    const updated = await prisma.shoppingItem.update({
      where: { id: itemId },
      data,
      include: { addedBy: { select: { id: true, name: true } } },
    });

    return res.status(200).json({ success: true, item: updated });
  } catch (error) {
    console.error('Update shopping item error:', error);
    next(error);
  }
});

// ── DELETE /api/groups/:groupId/shopping/:itemId ──────────────────────────────
router.delete('/:itemId', async (req, res, next) => {
  try {
    const { groupId, itemId } = req.params;
    if (!(await assertMember(req.userId, groupId))) {
      return res.status(403).json({ success: false, message: 'You are not a member of this group' });
    }

    const item = await prisma.shoppingItem.findFirst({ where: { id: itemId, groupId } });
    if (!item) {
      return res.status(404).json({ success: false, message: 'Shopping item not found' });
    }

    await prisma.shoppingItem.delete({ where: { id: itemId } });
    return res.status(200).json({ success: true, message: 'Item removed' });
  } catch (error) {
    console.error('Delete shopping item error:', error);
    next(error);
  }
});

// ── POST /api/groups/:groupId/shopping/:itemId/expense ────────────────────────
router.post('/:itemId/expense', async (req, res, next) => {
  try {
    const { groupId, itemId } = req.params;
    if (!(await assertMember(req.userId, groupId))) {
      return res.status(403).json({ success: false, message: 'You are not a member of this group' });
    }

    const parsed = splitItemSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: 'Invalid split payload',
        errors: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }

    const { paidById, splits } = parsed.data;

    const item = await prisma.shoppingItem.findFirst({ where: { id: itemId, groupId } });
    if (!item) {
      return res.status(404).json({ success: false, message: 'Shopping item not found' });
    }
    if (item.completed) {
      return res.status(409).json({
        success: false,
        message: 'This shopping item has already been converted to an expense or marked completed',
      });
    }
    if (!item.price) {
      return res.status(400).json({ success: false, message: 'Item must have a price before splitting' });
    }

    const includedSplits = splits.filter((s) => s.share > 0);
    if (!includedSplits.length) {
      return res.status(400).json({ success: false, message: 'At least one person must be included in the split' });
    }

    // Verify payer and all participants belong to group
    const participantIds = Array.from(new Set([paidById, ...includedSplits.map((s) => s.userId)]));
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

    // Verify split sum matches item price
    const splitTotal = includedSplits.reduce((sum, s) => sum + s.share, 0);
    if (Math.abs(splitTotal - Number(item.price)) > 0.01) {
      return res.status(400).json({
        success: false,
        message: 'Splits must sum to the shopping item price',
      });
    }

    const expenseCategory = parsed.data.category || item.category || 'Shopping';

    const expense = await prisma.expense.create({
      data: {
        groupId,
        paidById,
        amount: item.price,
        category: expenseCategory,
        description: item.name,
        splits: {
          create: includedSplits.map((s) => ({ userId: s.userId, share: s.share })),
        },
      },
    });

    await prisma.shoppingItem.update({ where: { id: itemId }, data: { completed: true } });

    return res.status(201).json({ success: true, expense, message: `Expense created for "${item.name}"` });
  } catch (error) {
    console.error('Convert shopping item to expense error:', error);
    next(error);
  }
});

module.exports = router;
