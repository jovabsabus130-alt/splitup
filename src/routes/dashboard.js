const express = require('express');
const auth = require('../middleware/auth');
const prisma = require('../lib/prisma');
const { getGroupBalances } = require('../services/balanceService');

const router = express.Router();
router.use(auth);

router.get('/', async (req, res) => {
  try {
    const memberships = await prisma.groupMember.findMany({
      where: { userId: req.userId },
      include: {
        group: {
          include: {
            members: {
              include: {
                user: { select: { id: true, name: true, email: true } },
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
        membersCount: g.members ? g.members.length : 0,
        createdAt: g.createdAt,
        pendingRequests: isAdmin ? g.joinRequests : [],
        pendingRequestsCount: isAdmin && g.joinRequests ? g.joinRequests.length : 0,
      };
    });

    const groupIds = groups.map((g) => g.id);

    // Compute balances for each group
    let totalOwedToYou = 0;
    let totalYouOwe = 0;
    const groupBalancesSummary = [];

    if (groupIds.length > 0) {
      await Promise.all(
        groupIds.map(async (groupId) => {
          try {
            const balances = await getGroupBalances(groupId);
            const userBal = balances.find((b) => b.userId === req.userId);
            const net = userBal ? Number(userBal.netBalance) || 0 : 0;
            if (net > 0) {
              totalOwedToYou += net;
            } else if (net < 0) {
              totalYouOwe += Math.abs(net);
            }
            const groupObj = groups.find((g) => g.id === groupId);
            groupBalancesSummary.push({
              groupId,
              groupName: groupObj?.name || '',
              netBalance: net,
            });
          } catch (e) {
            console.error('Balance calc error for group:', groupId, e);
          }
        })
      );
    }

    const totalNetBalance = totalOwedToYou - totalYouOwe;

    // Get recent expenses across all user groups
    let recentExpenses = [];
    if (groupIds.length > 0) {
      const recentExpensesRaw = await prisma.expense.findMany({
        where: { groupId: { in: groupIds } },
        orderBy: { createdAt: 'desc' },
        take: 6,
        include: {
          group: { select: { id: true, name: true } },
          paidBy: { select: { id: true, name: true, email: true } },
          splits: {
            where: { userId: req.userId },
            select: { share: true },
          },
        },
      });

      recentExpenses = recentExpensesRaw.map((e) => {
        const userShare = e.splits?.[0]?.share ? Number(e.splits[0].share.toString()) : 0;
        const isPayer = e.paidById === req.userId;
        return {
          id: e.id,
          groupId: e.groupId,
          groupName: e.group ? e.group.name : '',
          amount: Number(e.amount.toString()),
          category: e.category,
          description: e.description,
          createdAt: e.createdAt,
          paidById: e.paidById,
          paidByName: isPayer ? 'You' : (e.paidBy ? e.paidBy.name : 'Unknown'),
          isPayer,
          userShare,
        };
      });
    }

    // Get pending settlements involving the user
    let pendingSettlements = [];
    if (groupIds.length > 0) {
      const pendingSettlementsRaw = await prisma.settlement.findMany({
        where: {
          groupId: { in: groupIds },
          status: 'pending',
          OR: [{ fromId: req.userId }, { toId: req.userId }],
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: {
          group: { select: { id: true, name: true } },
          from: { select: { id: true, name: true, email: true, upiId: true } },
          to: { select: { id: true, name: true, email: true, upiId: true } },
        },
      });

      pendingSettlements = pendingSettlementsRaw.map((s) => ({
        id: s.id,
        groupId: s.groupId,
        groupName: s.group ? s.group.name : '',
        amount: Number(s.amount.toString()),
        status: s.status,
        fromId: s.fromId,
        fromName: s.fromId === req.userId ? 'You' : (s.from ? s.from.name : 'Unknown'),
        toId: s.toId,
        toName: s.toId === req.userId ? 'You' : (s.to ? s.to.name : 'Unknown'),
        isPayer: s.fromId === req.userId,
        isReceiver: s.toId === req.userId,
        toUpiId: s.to?.upiId || null,
        createdAt: s.createdAt,
      }));
    }

    // Category breakdown across all user groups
    let categoryBreakdown = [];
    if (groupIds.length > 0) {
      const categoryAggregates = {};
      const allExpenses = await prisma.expense.findMany({
        where: { groupId: { in: groupIds } },
        select: { category: true, amount: true },
      });

      let totalGroupSpending = 0;
      allExpenses.forEach((exp) => {
        const amt = Number(exp.amount.toString()) || 0;
        totalGroupSpending += amt;
        categoryAggregates[exp.category] = (categoryAggregates[exp.category] || 0) + amt;
      });

      categoryBreakdown = Object.entries(categoryAggregates)
        .map(([category, amount]) => ({
          category,
          amount,
          percentage: totalGroupSpending > 0 ? Math.round((amount / totalGroupSpending) * 100) : 0,
        }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5);
    }

    return res.status(200).json({
      summary: {
        totalNetBalance: Number(totalNetBalance.toFixed(2)),
        totalOwedToYou: Number(totalOwedToYou.toFixed(2)),
        totalYouOwe: Number(totalYouOwe.toFixed(2)),
        groupsCount: groups.length,
        adminGroupsCount: groups.filter((g) => g.isAdmin).length,
      },
      groups,
      groupBalances: groupBalancesSummary,
      recentExpenses,
      pendingSettlements,
      categoryBreakdown,
    });
  } catch (error) {
    console.error('Dashboard fetch error:', error);
    return res.status(500).json({ message: 'Failed to load dashboard data' });
  }
});

module.exports = router;
