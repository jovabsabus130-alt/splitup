const express = require('express');

const auth = require('../middleware/auth');
const { getGroupBalances } = require('../services/balanceService');
const { simplifyDebts } = require('../services/debtSimplification');
const prisma = require('../lib/prisma');

const router = express.Router();
router.use(auth);

// ── GET /groups/:groupId/balances ─────────────────────────────────────────────
// Concept: Server-side error handling (try/catch + error middleware)
router.get('/groups/:groupId/balances', async (req, res, next) => {
  try {
    const { groupId } = req.params;

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

    const rawBalances = await getGroupBalances(groupId);
    const simplified = simplifyDebts(rawBalances);

    const settlements = await Promise.all(
      simplified.map(async (item) => {
        const amountFixed = Number(item.amount.toFixed(2));

        // Resolve member names for display
        const [fromUser, toUser] = await Promise.all([
          prisma.user.findUnique({ where: { id: item.from }, select: { id: true, name: true } }),
          prisma.user.findUnique({ where: { id: item.to }, select: { id: true, name: true } }),
        ]);

        const existing = await prisma.settlement.findFirst({
          where: {
            groupId,
            fromId: item.from,
            toId: item.to,
            amount: amountFixed,
            status: { in: ['pending', 'pending_confirmation', 'rejected'] },
          },
          orderBy: { createdAt: 'desc' },
        });

        if (existing) {
          return {
            id: existing.id,
            from: item.from,
            fromName: fromUser?.name || item.from,
            to: item.to,
            toName: toUser?.name || item.to,
            amount: amountFixed,
            status: existing.status,
            rejectionReason: existing.rejectionReason,
            paidAt: existing.paidAt,
          };
        }

        const created = await prisma.settlement.create({
          data: {
            groupId,
            fromId: item.from,
            toId: item.to,
            amount: amountFixed,
            status: 'pending',
          },
        });

        return {
          id: created.id,
          from: item.from,
          fromName: fromUser?.name || item.from,
          to: item.to,
          toName: toUser?.name || item.to,
          amount: amountFixed,
          status: created.status,
          rejectionReason: null,
          paidAt: null,
        };
      })
    );

    const completedSettlements = await prisma.settlement.findMany({
      where: {
        groupId,
        status: { in: ['completed', 'rejected'] },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        from: { select: { id: true, name: true, email: true } },
        to: { select: { id: true, name: true, email: true } },
        confirmedBy: { select: { id: true, name: true } },
      },
    });

    return res.status(200).json({
      success: true,
      balances: rawBalances,
      settlements,
      history: completedSettlements.map((s) => ({
        id: s.id,
        fromId: s.fromId,
        fromName: s.from?.name || 'Unknown',
        toId: s.toId,
        toName: s.to?.name || 'Unknown',
        amount: Number(s.amount.toString()),
        status: s.status,
        rejectionReason: s.rejectionReason,
        confirmedById: s.confirmedById,
        confirmedByName: s.confirmedBy?.name || null,
        confirmedAt: s.confirmedAt || s.paidAt || s.createdAt,
        createdAt: s.createdAt,
      })),
    });
  } catch (error) {
    console.error('Fetch balances error:', error);
    next(error);
  }
});

module.exports = router;
