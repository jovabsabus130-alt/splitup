const express = require('express');
const auth = require('../middleware/auth');
const prisma = require('../lib/prisma');

const router = express.Router();
router.use(auth);

// ── GET /api/history ─────────────────────────────────────────────────────────
// Concept: Server-side error handling (try/catch + error middleware)
// Secure transaction history for the authenticated user across their authorized groups.
router.get('/', async (req, res, next) => {
  try {
    // 1. Strict Security: Always use req.userId derived from authenticated JWT
    const authenticatedUserId = req.userId;

    // Fetch all groups the authenticated user belongs to
    const userMemberships = await prisma.groupMember.findMany({
      where: { userId: authenticatedUserId },
      select: { groupId: true },
    });

    const authorizedGroupIds = userMemberships.map((m) => m.groupId);

    if (authorizedGroupIds.length === 0) {
      return res.status(200).json({
        success: true,
        transactions: [],
        pagination: {
          page: 1,
          limit: 20,
          total: 0,
          totalPages: 0,
          hasMore: false,
        },
        summary: {
          totalCount: 0,
          userTotalPaid: 0,
          userTotalShare: 0,
        },
      });
    }

    // 2. Parse & sanitize query filters
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const { groupId, category, search } = req.query;

    // Build Prisma where filter restricted to authorized groups
    let targetGroupIds = authorizedGroupIds;
    if (groupId) {
      if (!authorizedGroupIds.includes(groupId)) {
        return res.status(403).json({
          success: false,
          message: 'You are not authorized to view transactions for this group',
        });
      }
      targetGroupIds = [groupId];
    }

    const whereClause = {
      groupId: { in: targetGroupIds },
    };

    if (category && category.trim()) {
      whereClause.category = {
        equals: category.trim(),
        mode: 'insensitive',
      };
    }

    if (search && search.trim()) {
      whereClause.OR = [
        { description: { contains: search.trim(), mode: 'insensitive' } },
        { category: { contains: search.trim(), mode: 'insensitive' } },
      ];
    }

    // 3. Count total matching transactions & fetch paginated records
    const [totalCount, expenses] = await Promise.all([
      prisma.expense.count({ where: whereClause }),
      prisma.expense.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          group: {
            select: { id: true, name: true },
          },
          paidBy: {
            select: { id: true, name: true, email: true },
          },
          splits: {
            include: {
              user: {
                select: { id: true, name: true, email: true },
              },
            },
          },
          concerns: {
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              reason: true,
              status: true,
              payerResponse: true,
              resolvedAt: true,
              createdAt: true,
              raisedBy: { select: { id: true, name: true } },
            },
          },
          editHistory: {
            orderBy: { createdAt: 'desc' },
            include: {
              editedBy: { select: { id: true, name: true, email: true } },
            },
          },
        },
      }),
    ]);

    // 4. Format transactions with user-specific context
    let userTotalPaid = 0;
    let userTotalShare = 0;

    const formattedTransactions = expenses.map((exp) => {
      const isUserPayer = exp.paidById === authenticatedUserId;
      const isDeleted = Boolean(exp.isDeleted);
      const totalAmount = Number(exp.amount);

      const userSplit = exp.splits.find((s) => s.userId === authenticatedUserId);
      const userShare = userSplit ? Number(userSplit.share) : 0;

      // Only active (non-deleted) transactions count towards paid & share totals
      if (!isDeleted) {
        if (isUserPayer) userTotalPaid += totalAmount;
        userTotalShare += userShare;
      }

      // Net impact for authenticated user on this transaction:
      // If deleted: 0
      // If user paid: gets back (totalAmount - userShare)
      // If user did not pay: owes userShare (-userShare)
      const userNet = isDeleted ? 0 : (isUserPayer ? totalAmount - userShare : -userShare);

      let userRole = 'none';
      if (isUserPayer && userSplit) userRole = 'both';
      else if (isUserPayer) userRole = 'payer';
      else if (userSplit) userRole = 'participant';

      return {
        id: exp.id,
        amount: totalAmount,
        category: exp.category,
        description: exp.description,
        isEdited: exp.isEdited,
        isDeleted,
        deletedAt: exp.deletedAt || null,
        date: exp.createdAt,
        createdAt: exp.createdAt,
        group: {
          id: exp.group.id,
          name: exp.group.name,
        },
        payer: {
          id: exp.paidBy.id,
          name: exp.paidBy.name,
          email: exp.paidBy.email,
          isYou: isUserPayer,
        },
        participants: exp.splits.map((s) => ({
          userId: s.userId,
          name: s.user?.name || 'Unknown',
          email: s.user?.email || '',
          share: Number(s.share),
          isYou: s.userId === authenticatedUserId,
        })),
        userShare: isDeleted ? 0 : Number(userShare.toFixed(2)),
        originalUserShare: Number(userShare.toFixed(2)),
        userNet: Number(userNet.toFixed(2)),
        userRole,
        concerns: exp.concerns || [],
        editHistory: exp.editHistory || [],
      };
    });

    const totalPages = Math.ceil(totalCount / limit);

    return res.status(200).json({
      success: true,
      transactions: formattedTransactions,
      pagination: {
        page,
        limit,
        total: totalCount,
        totalPages,
        hasMore: page < totalPages,
      },
      summary: {
        totalCount,
        userTotalPaid: Number(userTotalPaid.toFixed(2)),
        userTotalShare: Number(userTotalShare.toFixed(2)),
      },
    });
  } catch (error) {
    console.error('History fetch error:', error);
    next(error);
  }
});

module.exports = router;
