const express = require('express');
const auth = require('../middleware/auth');
const prisma = require('../lib/prisma');
const {
  asyncHandler,
  ForbiddenError,
  NotFoundError,
} = require('../middleware/errorHandler');

const router = express.Router();

router.use(auth);

// ── GET /groups/:groupId/settlements ─────────────────────────────────────────
router.get('/groups/:groupId/settlements', asyncHandler(async (req, res) => {
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
    throw new ForbiddenError('You are not a member of this group');
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
      confirmedBy: {
        select: { id: true, name: true },
      },
    },
  });

  return res.status(200).json({ settlements });
}));

// ── POST /groups/:groupId/settlements/:settlementId/pay ───────────────────────
// Borrower marks "I've Paid" -> triggers notification for receiver
router.post('/groups/:groupId/settlements/:settlementId/pay', asyncHandler(async (req, res) => {
  const { groupId, settlementId } = req.params;

  const settlement = await prisma.settlement.findUnique({
    where: { id: settlementId },
    include: {
      from: { select: { id: true, name: true } },
      to: { select: { id: true, name: true } },
      group: { select: { id: true, name: true } },
    },
  });

  if (!settlement || settlement.groupId !== groupId) {
    throw new NotFoundError('Settlement not found');
  }

  if (settlement.fromId !== req.userId) {
    throw new ForbiddenError('Only the borrower can mark payment as paid');
  }

  const updated = await prisma.settlement.update({
    where: { id: settlementId },
    data: {
      status: 'pending_confirmation',
      paidAt: new Date(),
      rejectionReason: null,
    },
    include: {
      from: { select: { id: true, name: true } },
      to: { select: { id: true, name: true } },
      confirmedBy: { select: { id: true, name: true } },
    },
  });

  // Create notification for receiver
  const payerName = settlement.from?.name || 'Borrower';
  const groupName = settlement.group?.name || 'Group';
  const amountStr = Number(settlement.amount).toFixed(2);

  await prisma.notification.create({
    data: {
      userId: settlement.toId,
      groupId,
      type: 'payment_confirmation_request',
      title: 'Payment Confirmation Request',
      message: `${payerName} marked a payment of ₹${amountStr} as paid in ${groupName}. Please confirm or reject.`,
      data: {
        settlementId: settlement.id,
        groupId,
        groupName,
        fromId: settlement.fromId,
        fromName: payerName,
        toId: settlement.toId,
        amount: Number(settlement.amount),
      },
    },
  });

  return res.status(200).json({
    settlement: updated,
    message: 'Payment marked as sent! Waiting for receiver confirmation.',
  });
}));

// ── POST /groups/:groupId/settlements/:settlementId/confirm ───────────────────
// Receiver confirms payment received -> completes settlement
router.post('/groups/:groupId/settlements/:settlementId/confirm', asyncHandler(async (req, res) => {
  const { groupId, settlementId } = req.params;

  const settlement = await prisma.settlement.findUnique({
    where: { id: settlementId },
    include: {
      from: { select: { id: true, name: true } },
      to: { select: { id: true, name: true } },
      group: { select: { id: true, name: true } },
    },
  });

  if (!settlement || settlement.groupId !== groupId) {
    throw new NotFoundError('Settlement not found');
  }

  if (settlement.toId !== req.userId && settlement.fromId !== req.userId) {
    throw new ForbiddenError('Only participants in this settlement can confirm it');
  }

  const updated = await prisma.settlement.update({
    where: { id: settlementId },
    data: {
      status: 'completed',
      confirmedById: req.userId,
      confirmedAt: new Date(),
      rejectionReason: null,
    },
    include: {
      from: { select: { id: true, name: true } },
      to: { select: { id: true, name: true } },
      confirmedBy: { select: { id: true, name: true } },
    },
  });

  // Update pending notification actionTaken
  await prisma.notification.updateMany({
    where: {
      userId: req.userId,
      type: 'payment_confirmation_request',
      data: {
        path: ['settlementId'],
        equals: settlementId,
      },
    },
    data: { actionTaken: 'confirmed', isRead: true },
  }).catch(() => {});

  // Notify borrower
  const receiverName = settlement.to?.name || 'Receiver';
  const amountStr = Number(settlement.amount).toFixed(2);
  const groupName = settlement.group?.name || 'Group';

  await prisma.notification.create({
    data: {
      userId: settlement.fromId,
      groupId,
      type: 'payment_confirmed',
      title: 'Payment Confirmed ✓',
      message: `${receiverName} confirmed receiving your payment of ₹${amountStr} in ${groupName}!`,
      data: {
        settlementId: settlement.id,
        groupId,
        amount: Number(settlement.amount),
        confirmedById: req.userId,
      },
    },
  });

  return res.status(200).json({
    settlement: updated,
    message: 'Payment confirmed and marked as completed! ✓',
  });
}));

// ── POST /groups/:groupId/settlements/:settlementId/reject ────────────────────
// Receiver rejects payment -> notifies borrower
router.post('/groups/:groupId/settlements/:settlementId/reject', asyncHandler(async (req, res) => {
  const { groupId, settlementId } = req.params;
  const { reason } = req.body || {};

  const settlement = await prisma.settlement.findUnique({
    where: { id: settlementId },
    include: {
      from: { select: { id: true, name: true } },
      to: { select: { id: true, name: true } },
      group: { select: { id: true, name: true } },
    },
  });

  if (!settlement || settlement.groupId !== groupId) {
    throw new NotFoundError('Settlement not found');
  }

  if (settlement.toId !== req.userId) {
    throw new ForbiddenError('Only the receiver can reject a payment');
  }

  const rejectionText = reason && reason.trim() ? reason.trim() : 'Payment not received by receiver.';

  const updated = await prisma.settlement.update({
    where: { id: settlementId },
    data: {
      status: 'rejected',
      rejectionReason: rejectionText,
      confirmedById: null,
      confirmedAt: null,
    },
    include: {
      from: { select: { id: true, name: true } },
      to: { select: { id: true, name: true } },
      confirmedBy: { select: { id: true, name: true } },
    },
  });

  // Update pending notification actionTaken
  await prisma.notification.updateMany({
    where: {
      userId: req.userId,
      type: 'payment_confirmation_request',
      data: {
        path: ['settlementId'],
        equals: settlementId,
      },
    },
    data: { actionTaken: 'rejected', isRead: true },
  }).catch(() => {});

  // Notify borrower
  const receiverName = settlement.to?.name || 'Receiver';
  const amountStr = Number(settlement.amount).toFixed(2);
  const groupName = settlement.group?.name || 'Group';

  await prisma.notification.create({
    data: {
      userId: settlement.fromId,
      groupId,
      type: 'payment_rejected',
      title: 'Payment Rejected ✕',
      message: `${receiverName} rejected the payment of ₹${amountStr} in ${groupName}. Reason: ${rejectionText}`,
      data: {
        settlementId: settlement.id,
        groupId,
        amount: Number(settlement.amount),
        rejectedById: req.userId,
        reason: rejectionText,
      },
    },
  });

  return res.status(200).json({
    settlement: updated,
    message: 'Payment rejected. The borrower has been notified.',
  });
}));

// ── Legacy alias: POST /groups/:groupId/settlements/:settlementId/settle ──────
router.post('/groups/:groupId/settlements/:settlementId/settle', asyncHandler(async (req, res) => {
  const { groupId, settlementId } = req.params;

  const settlement = await prisma.settlement.findUnique({
    where: { id: settlementId },
  });

  if (!settlement || settlement.groupId !== groupId) {
    throw new NotFoundError('Settlement not found');
  }

  if (settlement.fromId !== req.userId && settlement.toId !== req.userId) {
    throw new ForbiddenError('Only participants in this settlement can mark it settled');
  }

  const updated = await prisma.settlement.update({
    where: { id: settlementId },
    data: {
      status: 'completed',
      confirmedById: req.userId,
      confirmedAt: new Date(),
      rejectionReason: null,
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
}));

module.exports = {
  settlementsRouter: router,
};
