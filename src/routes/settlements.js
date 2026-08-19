const express = require('express');
const auth = require('../middleware/auth');
const prisma = require('../lib/prisma');

const router = express.Router();

router.use(auth);

// ── GET /groups/:groupId/settlements ─────────────────────────────────────────
router.get('/groups/:groupId/settlements', async (req, res) => {
  const { groupId } = req.params;

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

    const settlements = await prisma.settlement.findMany({
      where: { groupId },
      orderBy: { createdAt: 'desc' },
      include: {
        from: {
          select: { id: true, name: true, email: true, phone: true, upiId: true },
        },
        to: {
          select: { id: true, name: true, email: true, phone: true, upiId: true },
        },
      },
    });

    return res.status(200).json({ settlements });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch settlements' });
  }
});

// ── POST /groups/:groupId/settlements/:settlementId/settle ───────────────────
// Allows participants to record that a settlement was paid (e.g. via UPI)
router.post('/groups/:groupId/settlements/:settlementId/settle', async (req, res) => {
  const { groupId, settlementId } = req.params;

  try {
    const settlement = await prisma.settlement.findUnique({
      where: { id: settlementId },
    });

    if (!settlement || settlement.groupId !== groupId) {
      return res.status(404).json({ message: 'Settlement not found' });
    }

    if (settlement.fromId !== req.userId && settlement.toId !== req.userId) {
      return res.status(403).json({ message: 'Only participants in this settlement can mark it settled' });
    }

    const updated = await prisma.settlement.update({
      where: { id: settlementId },
      data: {
        status: 'completed',
        confirmedById: req.userId,
        confirmedAt: new Date(),
      },
      include: {
        from: { select: { id: true, name: true } },
        to: { select: { id: true, name: true } },
        confirmedBy: { select: { id: true, name: true } },
      },
    });

    return res.status(200).json({
      settlement: updated,
      message: 'Settlement confirmed and marked as completed! ✓',
    });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to complete settlement' });
  }
});

module.exports = {
  settlementsRouter: router,
};
