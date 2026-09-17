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

    // Notify the added user
    if (userId !== req.userId) {
      const requesterUser = await prisma.user.findUnique({
        where: { id: req.userId },
        select: { name: true },
      });

      await prisma.notification.create({
        data: {
          userId,
          groupId,
          type: 'group_invitation',
          title: 'Added to Group',
          message: `${requesterUser?.name || 'A group member'} added you to "${group.name}".`,
          data: {
            groupId,
            groupName: group.name,
            addedById: req.userId,
          },
        },
      });
    }

    return res.status(201).json({ success: true, member });
  } catch (error) {
    console.error('Add member error:', error);
    next(error);
  }
});

// ── Submit a join request via invite link ────────────────────────────────────
router.post('/:groupId/join-request', async (req, res, next) => {
  try {
    const rawGroupId = req.params.groupId || '';
    const groupId = rawGroupId.trim();

    if (!groupId) {
      return res.status(400).json({ success: false, message: 'Invalid group identifier' });
    }

    const group = await prisma.group.findUnique({
      where: { id: groupId },
      select: { id: true, name: true, adminId: true, isDeleted: true },
    });

    if (!group) return res.status(404).json({ success: false, message: 'Group not found' });

    if (group.isDeleted) {
      return res.status(400).json({ success: false, message: 'This group has been deleted/archived and is not accepting new members.' });
    }

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

    // Notify group admin of join request with safe error recovery
    try {
      if (group.adminId && group.adminId !== req.userId) {
        const requesterUser = await prisma.user.findUnique({
          where: { id: req.userId },
          select: { name: true },
        });

        await prisma.notification.create({
          data: {
            userId: group.adminId,
            groupId,
            type: 'join_request',
            title: 'New Join Request',
            message: `${requesterUser?.name || 'A user'} requested to join "${group.name}".`,
            data: {
              groupId,
              groupName: group.name,
              requestId: joinRequest.id,
              requesterId: req.userId,
              requesterName: requesterUser?.name,
            },
          },
        });
      }
    } catch (notifErr) {
      console.warn('Failed to create join request notification for admin:', notifErr.message);
    }

    return res.status(201).json({ success: true, message: 'Join request sent successfully', joinRequest, groupName: group.name });
  } catch (error) {
    console.error('Join request error:', error);
    next(error);
  }
});

// ── Preview group info for invite link ──────────────────────────────────────
router.get('/:groupId/preview', async (req, res, next) => {
  try {
    const rawGroupId = req.params.groupId || '';
    const groupId = rawGroupId.trim();

    const group = await prisma.group.findUnique({
      where: { id: groupId },
      select: {
        id: true,
        name: true,
        isDeleted: true,
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
        isDeleted: Boolean(group.isDeleted),
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

    // Notify requester of decision
    if (joinRequest.userId !== req.userId) {
      const isApproved = status === 'approved';
      const groupInfo = await prisma.group.findUnique({
        where: { id: groupId },
        select: { name: true },
      });

      await prisma.notification.create({
        data: {
          userId: joinRequest.userId,
          groupId,
          type: isApproved ? 'join_request_approved' : 'join_request_denied',
          title: isApproved ? 'Join Request Approved' : 'Join Request Denied',
          message: isApproved
            ? `Your request to join "${groupInfo?.name || 'the group'}" was approved! You can now view and log expenses.`
            : `Your request to join "${groupInfo?.name || 'the group'}" was denied by the group admin.`,
          data: {
            groupId,
            groupName: groupInfo?.name,
            status,
          },
        },
      });
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

// ── Delete group (admin only, allowed only when all expenses are settled / zero balance) ──
router.delete('/:groupId', async (req, res, next) => {
  try {
    const { groupId } = req.params;

    const group = await prisma.group.findUnique({
      where: { id: groupId },
      select: { id: true, name: true, adminId: true, isDeleted: true },
    });

    if (!group) {
      return res.status(404).json({ success: false, message: 'Group not found' });
    }

    if (group.adminId !== req.userId) {
      return res.status(403).json({ success: false, message: 'Only the group admin can delete this group' });
    }

    if (group.isDeleted) {
      return res.status(400).json({ success: false, message: 'Group is already deleted' });
    }

    // 1. Verify that all group expenses are settled (net balances for all members are 0)
    const { getGroupBalances } = require('../services/balanceService');
    const rawBalances = await getGroupBalances(groupId);
    const hasUnsettledBalances = rawBalances.some((b) => Math.abs(Number(b.netBalance) || 0) > 0.01);

    if (hasUnsettledBalances) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete group with unsettled balances. All members must settle up (balance = ₹0.00) before deleting.',
      });
    }

    // 2. Verify there are no pending / unconfirmed payments in progress
    const pendingSettlement = await prisma.settlement.findFirst({
      where: {
        groupId,
        status: { in: ['pending', 'pending_confirmation'] },
      },
    });

    if (pendingSettlement) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete group while there are pending payment confirmations. Please resolve all payments first.',
      });
    }

    // 3. Soft-delete the group to preserve complete transaction ledger and history
    const updated = await prisma.group.update({
      where: { id: groupId },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
      },
    });

    return res.status(200).json({
      success: true,
      message: 'Group deleted successfully. All transaction records have been archived.',
      group: updated,
    });
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
        status: { in: ['pending', 'pending_confirmation'] },
        amount: { gt: 0 },
      },
    });

    if (pendingDebt) {
      return res.status(409).json({
        success: false,
        message: `You have a pending or unconfirmed debt of ₹${Number(pendingDebt.amount).toFixed(2)} in this group. Settle up before leaving.`,
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
        isDeleted: Boolean(g.isDeleted),
        deletedAt: g.deletedAt || null,
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
