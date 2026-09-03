const express = require('express');
const { z } = require('zod');

const auth = require('../middleware/auth');
const prisma = require('../lib/prisma');
const {
  asyncHandler,
  NotFoundError,
  ForbiddenError,
  ConflictError,
  BadRequestError,
} = require('../middleware/errorHandler');

const router = express.Router();

const createGroupSchema = z.object({
  name: z.string().trim().min(1, 'Group name cannot be empty'),
});

const addMemberSchema = z.object({
  userId: z.string().trim().min(1, 'User ID is required'),
});

const approveRequestSchema = z.object({
  status: z.enum(['approved', 'denied']),
});

router.use(auth);

// ── Create group ────────────────────────────────────────────────────────────
// Concept: Server-side error handling (try/catch + error middleware)
router.post('/', async (req, res, next) => {
  try {
    const parsed = createGroupSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: 'Invalid group payload',
        errors: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }

    const { name } = parsed.data;

    const group = await prisma.group.create({
      data: {
        name,
        adminId: req.userId,
        members: {
          create: {
            userId: req.userId,
          },
        },
      },
      include: {
        members: {
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
          },
        },
      },
    });

    return res.status(201).json({ success: true, group });
  } catch (error) {
    console.error('Create group error:', error);
    next(error);
  }
});

// ── Add member directly (existing flow) ─────────────────────────────────────
router.post('/:groupId/members', async (req, res, next) => {
  try {
    const { groupId } = req.params;
    const parsed = addMemberSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: 'Invalid add-member payload',
        errors: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }

    const { userId } = parsed.data;

    const requesterMembership = await prisma.groupMember.findUnique({
      where: { userId_groupId: { userId: req.userId, groupId } },
    });

    if (!requesterMembership) {
      return res.status(403).json({ success: false, message: 'You are not a member of this group' });
    }

    const membership = await prisma.groupMember.findUnique({
      where: { userId_groupId: { userId, groupId } },
    });

    if (membership) {
      return res.status(409).json({ success: false, message: 'User is already a member of this group' });
    }

    const [group, user] = await Promise.all([
      prisma.group.findUnique({ where: { id: groupId } }),
      prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, email: true },
      }),
    ]);

    if (!group) return res.status(404).json({ success: false, message: 'Group not found' });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const member = await prisma.groupMember.create({
      data: { userId, groupId },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });

    return res.status(201).json({ success: true, member });
  } catch (error) {
    console.error('Add member error:', error);
    next(error);
  }
});

// ── Submit a join request via invite link ────────────────────────────────────
router.post('/:groupId/join-request', async (req, res, next) => {
  try {
    const { groupId } = req.params;

    const group = await prisma.group.findUnique({
      where: { id: groupId },
      select: { id: true, name: true },
    });

    if (!group) return res.status(404).json({ success: false, message: 'Group not found' });

    const alreadyMember = await prisma.groupMember.findUnique({
      where: { userId_groupId: { userId: req.userId, groupId } },
    });

    if (alreadyMember) {
      return res.status(409).json({ success: false, message: 'You are already a member of this group' });
    }

    const joinRequest = await prisma.joinRequest.upsert({
      where: { groupId_userId: { groupId, userId: req.userId } },
      update: { status: 'pending' },
      create: { groupId, userId: req.userId, status: 'pending' },
    });

    return res.status(201).json({ success: true, joinRequest, groupName: group.name });
  } catch (error) {
    console.error('Join request error:', error);
    next(error);
  }
});

// ── Preview group info for invite link ──────────────────────────────────────
router.get('/:groupId/preview', async (req, res, next) => {
  try {
    const { groupId } = req.params;

    const group = await prisma.group.findUnique({
      where: { id: groupId },
      select: {
        id: true,
        name: true,
        members: {
          select: { userId: true },
        },
        joinRequests: {
          where: { userId: req.userId },
          select: { status: true },
        },
      },
    });

    if (!group) {
      return res.status(404).json({ success: false, message: 'This invite link is invalid or the group no longer exists.' });
    }

    const isMember = group.members.some((m) => m.userId === req.userId);
    const existingRequest = group.joinRequests?.[0]?.status || null;

    return res.status(200).json({
      success: true,
      group: {
        id: group.id,
        name: group.name,
      },
      isMember,
      requestStatus: existingRequest,
    });
  } catch (error) {
    console.error('Group preview error:', error);
    next(error);
  }
});

// ── List pending join requests (admin only) ──────────────────────────────────
router.get('/:groupId/join-requests', async (req, res, next) => {
  try {
    const { groupId } = req.params;

    const group = await prisma.group.findUnique({
      where: { id: groupId },
      select: { adminId: true },
    });

    if (!group) return res.status(404).json({ success: false, message: 'Group not found' });

    if (group.adminId !== req.userId) {
      return res.status(403).json({ success: false, message: 'Only the group admin can view join requests' });
    }

    const requests = await prisma.joinRequest.findMany({
      where: { groupId, status: 'pending' },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return res.status(200).json({ success: true, requests });
  } catch (error) {
    console.error('List join requests error:', error);
    next(error);
  }
});

// ── Approve or deny a join request (admin only) ──────────────────────────────
router.patch('/:groupId/join-requests/:requestId', async (req, res, next) => {
  try {
    const { groupId, requestId } = req.params;
    const parsed = approveRequestSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ success: false, message: 'status must be "approved" or "denied"' });
    }

    const { status } = parsed.data;

    const group = await prisma.group.findUnique({
      where: { id: groupId },
      select: { adminId: true },
    });

    if (!group) return res.status(404).json({ success: false, message: 'Group not found' });

    if (group.adminId !== req.userId) {
      return res.status(403).json({ success: false, message: 'Only the group admin can manage join requests' });
    }

    const joinRequest = await prisma.joinRequest.findUnique({
      where: { id: requestId },
    });

    if (!joinRequest || joinRequest.groupId !== groupId) {
      return res.status(404).json({ success: false, message: 'Join request not found' });
    }

    // Update request status
    await prisma.joinRequest.update({
      where: { id: requestId },
      data: { status },
    });

    // On approval, create GroupMember (if not already present)
    if (status === 'approved') {
      const alreadyMember = await prisma.groupMember.findUnique({
        where: { userId_groupId: { userId: joinRequest.userId, groupId } },
      });

      if (!alreadyMember) {
        await prisma.groupMember.create({
          data: { userId: joinRequest.userId, groupId },
        });
      }
    }

    return res.status(200).json({ success: true, message: `Request ${status}` });
  } catch (error) {
    console.error('Update join request error:', error);
    next(error);
  }
});

// ── Legacy join via link ─────────────────────────────────────────────────────
router.post('/:groupId/join', (req, res) => {
  return res.status(301).json({ message: 'Use POST /join-request instead' });
});

// ── Delete group (admin only) ─────────────────────────────────────────────────
router.delete('/:groupId', async (req, res, next) => {
  try {
    const { groupId } = req.params;

    const group = await prisma.group.findUnique({
      where: { id: groupId },
      select: { adminId: true },
    });

    if (!group) {
      return res.status(404).json({ success: false, message: 'Group not found' });
    }

    if (group.adminId !== req.userId) {
      return res.status(403).json({ success: false, message: 'Only the group admin can delete this group' });
    }

    // Cascade delete inside a transaction
    await prisma.$transaction(async (tx) => {
      await tx.settlement.deleteMany({ where: { groupId } });

      const expenses = await tx.expense.findMany({
        where: { groupId },
        select: { id: true },
      });
      const expenseIds = expenses.map((e) => e.id);

      await tx.expenseSplit.deleteMany({ where: { expenseId: { in: expenseIds } } });
      await tx.expense.deleteMany({ where: { groupId } });
      await tx.joinRequest.deleteMany({ where: { groupId } });
      await tx.groupMember.deleteMany({ where: { groupId } });
      await tx.group.delete({ where: { id: groupId } });
    });

    return res.status(200).json({ success: true, message: 'Group deleted successfully' });
  } catch (error) {
    console.error('Delete group error:', error);
    next(error);
  }
});

// ── Leave group ──────────────────────────────────────────────────────────────
router.delete('/:groupId/members/me', async (req, res, next) => {
  try {
    const { groupId } = req.params;

    const group = await prisma.group.findUnique({
      where: { id: groupId },
      select: { adminId: true },
    });

    if (!group) return res.status(404).json({ success: false, message: 'Group not found' });

    if (group.adminId === req.userId) {
      return res.status(403).json({
        success: false,
        message: 'Group admins cannot leave. Transfer ownership or delete the group.',
      });
    }

    const membership = await prisma.groupMember.findUnique({
      where: { userId_groupId: { userId: req.userId, groupId } },
    });

    if (!membership) {
      return res.status(404).json({ success: false, message: 'You are not a member of this group' });
    }

    const pendingDebt = await prisma.settlement.findFirst({
      where: {
        groupId,
        fromId: req.userId,
        status: 'pending',
        amount: { gt: 0 },
      },
    });

    if (pendingDebt) {
      return res.status(409).json({
        success: false,
        message: `You have a pending debt of ₹${Number(pendingDebt.amount).toFixed(2)} in this group. Settle up before leaving.`,
      });
    }

    await prisma.groupMember.delete({
      where: { userId_groupId: { userId: req.userId, groupId } },
    });

    return res.status(200).json({ success: true, message: 'You have left the group' });
  } catch (error) {
    console.error('Leave group error:', error);
    next(error);
  }
});

// ── Get single group ─────────────────────────────────────────────────────────
router.get('/:groupId', async (req, res, next) => {
  try {
    const { groupId } = req.params;

    const group = await prisma.group.findFirst({
      where: {
        id: groupId,
        members: { some: { userId: req.userId } },
      },
      include: {
        members: {
          include: {
            user: { select: { id: true, name: true, email: true, upiId: true } },
          },
        },
        joinRequests: {
          where: { status: 'pending' },
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!group) {
      return res.status(404).json({ success: false, message: 'Group not found' });
    }

    const isAdmin = group.adminId === req.userId;

    return res.status(200).json({
      success: true,
      group: {
        ...group,
        isAdmin,
        joinRequests: isAdmin ? group.joinRequests : [],
      },
    });
  } catch (error) {
    console.error('Get group error:', error);
    next(error);
  }
});

// ── List groups for current user ─────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const memberships = await prisma.groupMember.findMany({
      where: { userId: req.userId },
      include: {
        group: {
          include: {
            joinRequests: {
              where: { status: 'pending' },
              include: {
                user: { select: { id: true, name: true, email: true } },
              },
              orderBy: { createdAt: 'asc' },
            },
          },
        },
      },
      orderBy: { group: { createdAt: 'desc' } },
    });

    const groups = memberships.map((m) => {
      const g = m.group;
      const isAdmin = g.adminId === req.userId;
      return {
        id: g.id,
        name: g.name,
        adminId: g.adminId,
        isAdmin,
        createdAt: g.createdAt,
        pendingRequests: isAdmin ? g.joinRequests : [],
        pendingRequestsCount: isAdmin ? g.joinRequests.length : 0,
      };
    });

    return res.status(200).json({ success: true, groups });
  } catch (error) {
    console.error('List groups error:', error);
    next(error);
  }
});

module.exports = router;
