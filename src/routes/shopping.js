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
  name: z.string().trim().min(1),
  price: z.number().positive().optional(),
});

const updateItemSchema = z.object({
  name: z.string().trim().min(1).optional(),
  price: z.number().positive().optional().nullable(),
  completed: z.boolean().optional(),
});

const splitItemSchema = z.object({
  paidById: z.string().min(1),
  splits: z.array(
    z.object({
      userId: z.string().min(1),
      share: z.number().min(0),
    })
  ).min(1),
});

// ── GET /api/groups/:groupId/shopping ─────────────────────────────────────────
router.get('/', async (req, res) => {
  const { groupId } = req.params;
  if (!(await assertMember(req.userId, groupId))) {
    return res.status(403).json({ message: 'Not a member of this group' });
  }

  try {
    const items = await prisma.shoppingItem.findMany({
      where: { groupId },
      include: { addedBy: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return res.status(200).json({ items });
  } catch {
    return res.status(500).json({ message: 'Failed to fetch shopping list' });
  }
});

// ── POST /api/groups/:groupId/shopping ────────────────────────────────────────
router.post('/', async (req, res) => {
  const { groupId } = req.params;
  if (!(await assertMember(req.userId, groupId))) {
    return res.status(403).json({ message: 'Not a member of this group' });
  }

  const parsed = addItemSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Item name is required' });
  }

  try {
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
  } catch {
    return res.status(500).json({ message: 'Failed to add item' });
  }
});

// ── PATCH /api/groups/:groupId/shopping/:itemId ───────────────────────────────
router.patch('/:itemId', async (req, res) => {
  const { groupId, itemId } = req.params;
  if (!(await assertMember(req.userId, groupId))) {
    return res.status(403).json({ message: 'Not a member of this group' });
  }

  const parsed = updateItemSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid update payload' });
  }

  try {
    const item = await prisma.shoppingItem.findFirst({ where: { id: itemId, groupId } });
    if (!item) return res.status(404).json({ message: 'Item not found' });

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
  } catch {
    return res.status(500).json({ message: 'Failed to update item' });
  }
});

// ── DELETE /api/groups/:groupId/shopping/:itemId ──────────────────────────────
router.delete('/:itemId', async (req, res) => {
  const { groupId, itemId } = req.params;
  if (!(await assertMember(req.userId, groupId))) {
    return res.status(403).json({ message: 'Not a member of this group' });
  }

  try {
    const item = await prisma.shoppingItem.findFirst({ where: { id: itemId, groupId } });
    if (!item) return res.status(404).json({ message: 'Item not found' });

    await prisma.shoppingItem.delete({ where: { id: itemId } });
    return res.status(200).json({ message: 'Item removed' });
  } catch {
    return res.status(500).json({ message: 'Failed to delete item' });
  }
});

// ── POST /api/groups/:groupId/shopping/:itemId/expense ────────────────────────
// Converts a shopping item into a group expense with custom per-member splits.
router.post('/:itemId/expense', async (req, res) => {
  const { groupId, itemId } = req.params;
  if (!(await assertMember(req.userId, groupId))) {
    return res.status(403).json({ message: 'Not a member of this group' });
  }

  const parsed = splitItemSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'paidById and splits are required' });
  }

  const { paidById, splits } = parsed.data;

  try {
    const item = await prisma.shoppingItem.findFirst({ where: { id: itemId, groupId } });
    if (!item) return res.status(404).json({ message: 'Shopping item not found' });
    if (!item.price) return res.status(400).json({ message: 'Item must have a price before splitting' });

    const includedSplits = splits.filter((s) => s.share > 0);
    if (!includedSplits.length) {
      return res.status(400).json({ message: 'At least one person must be included in the split' });
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
  } catch {
    return res.status(500).json({ message: 'Failed to create expense from shopping item' });
  }
});

module.exports = router;
