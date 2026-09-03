const express = require('express');
const auth = require('../middleware/auth');
const prisma = require('../lib/prisma');
const { asyncHandler, NotFoundError } = require('../middleware/errorHandler');

const router = express.Router();
router.use(auth);

// ── GET /api/notifications ───────────────────────────────────────────────────
router.get('/', asyncHandler(async (req, res) => {
  const notifications = await prisma.notification.findMany({
    where: { userId: req.userId },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: {
      group: {
        select: { id: true, name: true },
      },
    },
  });

  const unreadCount = await prisma.notification.count({
    where: { userId: req.userId, isRead: false },
  });

  return res.status(200).json({
    notifications,
    unreadCount,
  });
}));

// ── PATCH /api/notifications/:id/read ─────────────────────────────────────────
router.patch('/:id/read', asyncHandler(async (req, res) => {
  const { id } = req.params;

  const notification = await prisma.notification.findUnique({
    where: { id },
  });

  if (!notification || notification.userId !== req.userId) {
    throw new NotFoundError('Notification not found');
  }

  const updated = await prisma.notification.update({
    where: { id },
    data: { isRead: true },
  });

  return res.status(200).json({ notification: updated });
}));

// ── POST /api/notifications/read-all ──────────────────────────────────────────
router.post('/read-all', asyncHandler(async (req, res) => {
  await prisma.notification.updateMany({
    where: { userId: req.userId, isRead: false },
    data: { isRead: true },
  });

  return res.status(200).json({ message: 'All notifications marked as read' });
}));

module.exports = router;
