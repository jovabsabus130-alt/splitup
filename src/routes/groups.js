const express = require('express');
const { z } = require('zod');

const auth = require('../middleware/auth');
const prisma = require('../lib/prisma');
const { asyncHandler, NotFoundError, ForbiddenError, ValidationError } = require('../middleware/errorHandler');

const router = express.Router();

const createGroupSchema = z.object({
  name: z.string().trim().min(1, 'Group name cannot be empty'),
});

const addMemberSchema = z.object({
  userId: z.string().trim().min(1),
});

const approveRequestSchema = z.object({
  status: z.enum(['approved', 'denied']),
});

router.use(auth);

// ── Create group ────────────────────────────────────────────────────────────
// Error Handling Architecture:
// 1. Expected/Operational Error: Input validation (Zod) -> 400 Bad Request with field hint.
// 2. Unexpected/System Error: DB failure -> forward to next(error) for server-side logging & safe 500 response.
router.post('/', asyncHandler(async (req, res, next) => {
  const parsed = createGroupSchema.safeParse(req.body);

  // DECISION: Return 400 immediately for validation failures (safe to expose user input errors)
  if (!parsed.success) {
    return res.status(400).json({
      message: 'Invalid group payload',
      errors: parsed.error.issues.map(i => ({ path: i.path.join('.'), message: i.message })),
    });
  }

  const { name } = parsed.data;

  // DECISION: Do not write ad-hoc catch blocks that swallow stack traces.
  // asyncHandler forwards database connection drops or constraint violations to errorHandler.
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

  return res.status(201).json({ group });
}));

// ── Add member directly (existing flow) ─────────────────────────────────────
router.post('/:groupId/members', async (req, res) => {
  const { groupId } = req.params;
  const parsed = addMemberSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid add-member payload' });
  }

  const { userId } = parsed.data;

  try {
    const requesterMembership = await prisma.groupMember.findUnique({
      where: { userId_groupId: { userId: req.userId, groupId } },
    });

    if (!requesterMembership) {
      return res.status(403).json({ message: 'You are not a member of this group' });
    }

    const membership = await prisma.groupMember.findUnique({
      where: { userId_groupId: { userId, groupId } },
    });

    if (membership) {
      return res.status(409).json({ message: 'User is already a member of this group' });
    }

    const [group, user] = await Promise.all([
      prisma.group.findUnique({ where: { id: groupId } }),
      prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, email: true },
      }),
    ]);

    if (!group) return res.status(404).json({ message: 'Group not found' });
    if (!user) return res.status(404).json({ message: 'User not found' });

    const member = await prisma.groupMember.create({
      data: { userId, groupId },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });

    return res.status(201).json({ member });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to add member' });
  }
});

// ── Submit a join request via invite link ────────────────────────────────────
router.post('/:groupId/join-request', async (req, res) => {
  const { groupId } = req.params;

  try {
    const group = await prisma.group.findUnique({
      where: { id: groupId },
      select: { id: true, name: true },
    });

    if (!group) return res.status(404).json({ message: 'Group not found' });

    const alreadyMember = await prisma.groupMember.findUnique({
      where: { userId_groupId: { userId: req.userId, groupId } },
    });

    if (alreadyMember) {
      return res.status(409).json({ message: 'You are already a member of this group' });
    }

    // Upsert so re-requesting creates or refreshes a pending request
    const joinRequest = await prisma.joinRequest.upsert({
      where: { groupId_userId: { groupId, userId: req.userId } },
      update: { status: 'pending' },
      create: { groupId, userId: req.userId, status: 'pending' },
    });

    return res.status(201).json({ joinRequest, groupName: group.name });
  } catch (error) {
    console.error('Join request error:', error);
    return res.status(500).json({ message: error.message || 'Failed to submit join request' });
  }
});

// ── Preview group info for invite link ──────────────────────────────────────
router.get('/:groupId/preview', async (req, res) => {
  const { groupId } = req.params;

  try {
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
      return res.status(404).json({ message: 'This invite link is invalid or the group no longer exists.' });
    }

    const isMember = group.members.some((m) => m.userId === req.userId);
    const existingRequest = group.joinRequests?.[0]?.status || null;

    return res.status(200).json({
      group: {
        id: group.id,
        name: group.name,
      },
      isMember,
      requestStatus: existingRequest,
    });
  } catch (error) {
    console.error('Group preview error:', error);
    return res.status(500).json({ message: 'Failed to fetch group preview' });
  }
});

// ── List pending join requests (admin only) ──────────────────────────────────
router.get('/:groupId/join-requests', async (req, res) => {
  const { groupId } = req.params;

  try {
    const group = await prisma.group.findUnique({
      where: { id: groupId },
      select: { adminId: true },
    });

    if (!group) return res.status(404).json({ message: 'Group not found' });

    if (group.adminId !== req.userId) {
      return res.status(403).json({ message: 'Only the group admin can view join requests' });
    }

    const requests = await prisma.joinRequest.findMany({
      where: { groupId, status: 'pending' },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return res.status(200).json({ requests });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch join requests' });
  }
});

// ── Approve or deny a join request (admin only) ──────────────────────────────
router.patch('/:groupId/join-requests/:requestId', async (req, res) => {
  const { groupId, requestId } = req.params;
  const parsed = approveRequestSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ message: 'status must be "approved" or "denied"' });
  }

  const { status } = parsed.data;

  try {
    const group = await prisma.group.findUnique({
      where: { id: groupId },
      select: { adminId: true },
    });

    if (!group) return res.status(404).json({ message: 'Group not found' });

    if (group.adminId !== req.userId) {
      return res.status(403).json({ message: 'Only the group admin can manage join requests' });
    }

    const joinRequest = await prisma.joinRequest.findUnique({
      where: { id: requestId },
    });

    if (!joinRequest || joinRequest.groupId !== groupId) {
      return res.status(404).json({ message: 'Join request not found' });
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

    return res.status(200).json({ message: `Request ${status}` });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to update join request' });
  }
});

// ── Legacy join via link (kept for backward compat, now redirects to request) ─
router.post('/:groupId/join', async (req, res) => {
  return res.status(301).json({ message: 'Use POST /join-request instead' });
});

// ── Delete group (admin only) ─────────────────────────────────────────────────
// Error Handling Architecture:
// 1. Expected Operational Errors:
//    - 404 Not Found: Group does not exist (Safe to inform client)
//    - 403 Forbidden: Caller is not the admin of this group (Access Control)
// 2. Unexpected Internal Errors:
//    - Foreign key / Transaction issues: Delegated to centralized errorHandler.
//    - Internal database constraint errors are logged server-side; client gets a clean 500.
router.delete('/:groupId', asyncHandler(async (req, res, next) => {
  const { groupId } = req.params;

  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: { adminId: true },
  });

  // DECISION: Expected 404 - safe, clear client feedback
  if (!group) {
    throw new NotFoundError('Group not found');
  }

  // DECISION: Expected 403 - authorization check fails
  if (group.adminId !== req.userId) {
    throw new ForbiddenError('Only the group admin can delete this group');
  }

  // Execute cascade delete inside a transaction to prevent partial orphans on failure
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

  return res.status(200).json({ message: 'Group deleted successfully' });
}));

// ── Leave group ──────────────────────────────────────────────────────────────
// A member can leave only if they have no pending debt in the group.
router.delete('/:groupId/members/me', async (req, res) => {
  const { groupId } = req.params;

  try {
    const group = await prisma.group.findUnique({
      where: { id: groupId },
      select: { adminId: true },
    });

    if (!group) return res.status(404).json({ message: 'Group not found' });

    // Admin cannot leave their own group — they must delete it instead
    if (group.adminId === req.userId) {
      return res.status(403).json({
        message: 'Group admins cannot leave. Transfer ownership or delete the group.',
      });
    }

    const membership = await prisma.groupMember.findUnique({
      where: { userId_groupId: { userId: req.userId, groupId } },
    });

    if (!membership) {
      return res.status(404).json({ message: 'You are not a member of this group' });
    }

    // Check for pending debt: any settlement where this user is the payer
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
        message: `You have a pending debt of ₹${Number(pendingDebt.amount).toFixed(2)} in this group. Settle up before leaving.`,
      });
    }

    await prisma.groupMember.delete({
      where: { userId_groupId: { userId: req.userId, groupId } },
    });

    return res.status(200).json({ message: 'You have left the group' });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to leave group' });
  }
});

// ── Get single group ─────────────────────────────────────────────────────────
router.get('/:groupId', async (req, res) => {
  const { groupId } = req.params;

  try {
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
      return res.status(404).json({ message: 'Group not found' });
    }

    const isAdmin = group.adminId === req.userId;

    return res.status(200).json({
      group: {
        ...group,
        isAdmin,
        joinRequests: isAdmin ? group.joinRequests : [],
      },
    });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch group' });
  }
});

// ── List groups for current user ─────────────────────────────────────────────
router.get('/', async (req, res) => {
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

    return res.status(200).json({ groups });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to list groups' });
  }
});

module.exports = router;
