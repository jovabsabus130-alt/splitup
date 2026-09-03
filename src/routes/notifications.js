const express = require('express');
const auth = require('../middleware/auth');
const prisma = require('../lib/prisma');

const router = express.Router();
router.use(auth);

// ── GET /api/notifications ───────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
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
  } catch (error) {
    console.error('Failed to fetch notifications:', error);
    return res.status(500).json({ message: 'Failed to fetch notifications' });
  }
});

// ── PATCH /api/notifications/:id/read ─────────────────────────────────────────
router.patch('/:id/read', async (req, res) => {
  const { id } = req.params;
  try {
    const notification = await prisma.notification.findUnique({
      where: { id },
    });

    if (!notification || notification.userId !== req.userId) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    const updated = await prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });

    return res.status(200).json({ notification: updated });
  } catch (error) {
    console.error('Failed to mark notification as read:', error);
    return res.status(500).json({ message: 'Failed to update notification' });
  }
});

// ── POST /api/notifications/read-all ──────────────────────────────────────────
router.post('/read-all', async (req, res) => {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.userId, isRead: false },
      data: { isRead: true },
    });

    return res.status(200).json({ message: 'All notifications marked as read' });
  } catch (error) {
    console.error('Failed to mark all notifications as read:', error);
    return res.status(500).json({ message: 'Failed to update notifications' });
  }
});

module.exports = router;
