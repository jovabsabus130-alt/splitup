const express = require('express');
const { z } = require('zod');

const auth = require('../middleware/auth');
const prisma = require('../lib/prisma');
const {
  asyncHandler,
  ForbiddenError,
  NotFoundError,
  BadRequestError,
} = require('../middleware/errorHandler');

const router = express.Router({ mergeParams: true });

router.use(auth);

// ── Helpers ───────────────────────────────────────────────────────────────────

async function assertMember(userId, groupId) {
  const m = await prisma.groupMember.findUnique({
    where: { userId_groupId: { userId, groupId } },
  });
  if (!m) {
    throw new ForbiddenError('You are not a member of this group');
  }
}

// ── Schemas ───────────────────────────────────────────────────────────────────

const addItemSchema = z.object({
  name: z.string().trim().min(1, 'Item name is required'),
  price: z.number().positive('Price must be a positive number').optional(),
});

const updateItemSchema = z.object({
  name: z.string().trim().min(1).optional(),
  price: z.number().positive().optional().nullable(),
  completed: z.boolean().optional(),
});

const splitItemSchema = z.object({
  paidById: z.string().min(1, 'Payer ID is required'),
  splits: z.array(
    z.object({
      userId: z.string().min(1, 'User ID is required'),
      share: z.number().min(0, 'Share cannot be negative'),
    })
  ).min(1, 'At least one split is required'),
});

// ── GET /api/groups/:groupId/shopping ─────────────────────────────────────────
router.get('/', asyncHandler(async (req, res) => {
  const { groupId } = req.params;
  await assertMember(req.userId, groupId);

  const items = await prisma.shoppingItem.findMany({
    where: { groupId },
    include: { addedBy: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'asc' },
  });

  return res.status(200).json({ items });
}));

// ── POST /api/groups/:groupId/shopping ────────────────────────────────────────
router.post('/', asyncHandler(async (req, res) => {
  const { groupId } = req.params;
  await assertMember(req.userId, groupId);

  const parsed = addItemSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      message: 'Invalid item payload',
      errors: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }

  const item = await prisma.shoppingItem.create({
    data: {
      groupId,
      addedById: req.userId,
      name: parsed.data.name,
      ...(parsed.data.price != null ? { price: parsed.data.price } : {}),
    },
    include: { addedBy: { select: { id: true, name: true } } },
  });

  return res.status(201).json({ item });
}));

// ── PATCH /api/groups/:groupId/shopping/:itemId ───────────────────────────────
router.patch('/:itemId', asyncHandler(async (req, res) => {
  const { groupId, itemId } = req.params;
  await assertMember(req.userId, groupId);

  const parsed = updateItemSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      message: 'Invalid update payload',
      errors: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }

  const item = await prisma.shoppingItem.findFirst({ where: { id: itemId, groupId } });
  if (!item) {
    throw new NotFoundError('Shopping item not found');
  }

  const data = {};
  if (parsed.data.name !== undefined) data.name = parsed.data.name;
  if (parsed.data.completed !== undefined) data.completed = parsed.data.completed;
  if ('price' in parsed.data) {
    data.price = parsed.data.price; // allows null to clear price
  }

  const updated = await prisma.shoppingItem.update({
    where: { id: itemId },
    data,
    include: { addedBy: { select: { id: true, name: true } } },
  });

  return res.status(200).json({ item: updated });
}));

// ── DELETE /api/groups/:groupId/shopping/:itemId ──────────────────────────────
router.delete('/:itemId', asyncHandler(async (req, res) => {
  const { groupId, itemId } = req.params;
  await assertMember(req.userId, groupId);

  const item = await prisma.shoppingItem.findFirst({ where: { id: itemId, groupId } });
  if (!item) {
    throw new NotFoundError('Shopping item not found');
  }

  await prisma.shoppingItem.delete({ where: { id: itemId } });
  return res.status(200).json({ message: 'Item removed' });
}));

// ── POST /api/groups/:groupId/shopping/:itemId/expense ────────────────────────
// Converts a shopping item into a group expense with custom per-member splits.
router.post('/:itemId/expense', asyncHandler(async (req, res) => {
  const { groupId, itemId } = req.params;
  await assertMember(req.userId, groupId);

  const parsed = splitItemSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      message: 'Invalid split payload',
      errors: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }

  const { paidById, splits } = parsed.data;

  const item = await prisma.shoppingItem.findFirst({ where: { id: itemId, groupId } });
  if (!item) {
    throw new NotFoundError('Shopping item not found');
  }
  if (!item.price) {
    throw new BadRequestError('Item must have a price before splitting');
  }

  const includedSplits = splits.filter((s) => s.share > 0);
  if (!includedSplits.length) {
    throw new BadRequestError('At least one person must be included in the split');
  }

  const expense = await prisma.expense.create({
    data: {
      groupId,
      paidById,
      amount: item.price,
      category: 'Shopping',
      description: item.name,
      splits: {
        create: includedSplits.map((s) => ({ userId: s.userId, share: s.share })),
      },
    },
  });

  // Mark item as completed after converting to expense
  await prisma.shoppingItem.update({ where: { id: itemId }, data: { completed: true } });

  return res.status(201).json({ expense, message: `Expense created for "${item.name}"` });
}));

module.exports = router;
