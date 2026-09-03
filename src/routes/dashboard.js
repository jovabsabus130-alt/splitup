const express = require('express');
const auth = require('../middleware/auth');
const prisma = require('../lib/prisma');
const { getGroupBalances } = require('../services/balanceService');
const { analyzeMonthlyExpenses } = require('../services/aiParser');

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
        take: 8,
        include: {
          group: { select: { id: true, name: true } },
          paidBy: { select: { id: true, name: true, email: true } },
          splits: {
            where: { userId: req.userId },
            select: { share: true },
          },
          editHistory: {
            take: 1,
            select: { id: true },
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
          updatedAt: e.updatedAt,
          isEdited: e.isEdited,
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
          status: { in: ['pending', 'pending_confirmation', 'rejected'] },
          OR: [{ fromId: req.userId }, { toId: req.userId }],
        },
        orderBy: { createdAt: 'desc' },
        take: 8,
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
        rejectionReason: s.rejectionReason,
        paidAt: s.paidAt,
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
          amount: Number(amount.toFixed(2)),
          percentage: totalGroupSpending > 0 ? Math.round((amount / totalGroupSpending) * 100) : 0,
        }))
        .sort((a, b) => b.amount - a.amount);
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
      categoryBreakdown: categoryBreakdown.slice(0, 6),
    });
  } catch (error) {
    console.error('Dashboard fetch error:', error);
    return res.status(500).json({ message: 'Failed to load dashboard data' });
  }
});

// ── GET /api/dashboard/ai-analysis ───────────────────────────────────────────
// AI Monthly Expense Analysis endpoint
router.get('/ai-analysis', async (req, res) => {
  try {
    const { month, groupId } = req.query;

    // Get all groups of user
    const memberships = await prisma.groupMember.findMany({
      where: { userId: req.userId },
      select: { groupId: true },
    });

    let targetGroupIds = memberships.map((m) => m.groupId);
    if (groupId && targetGroupIds.includes(groupId)) {
      targetGroupIds = [groupId];
    }

    if (targetGroupIds.length === 0) {
      return res.status(200).json({
        monthName: 'Current Month',
        totalSpent: 0,
        transactionCount: 0,
        categoryBreakdown: [],
        topCategory: null,
        aiInsights: {
          summary: 'No groups or expenses found to analyze.',
          keyObservations: ['Join or create a group to start tracking expenses and viewing AI spending insights.'],
          savingTips: ['Create a shared pool for rent, utilities or group outings.'],
        },
        availableMonths: [],
      });
    }

    // Fetch all user expenses to compute available months
    const allExpenses = await prisma.expense.findMany({
      where: { groupId: { in: targetGroupIds } },
      select: { id: true, amount: true, category: true, description: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });

    // Determine available months
    const monthSet = new Set();
    allExpenses.forEach((e) => {
      const d = new Date(e.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthSet.add(key);
    });

    const now = new Date();
    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    monthSet.add(currentMonthKey);
    const availableMonths = Array.from(monthSet).sort().reverse();

    // Determine active month to analyze
    const activeMonthKey = month && availableMonths.includes(month) ? month : availableMonths[0];
    const [targetYear, targetMonth] = activeMonthKey.split('-').map(Number);

    const startDate = new Date(targetYear, targetMonth - 1, 1);
    const endDate = new Date(targetYear, targetMonth, 1);

    const monthExpenses = allExpenses.filter((e) => {
      const d = new Date(e.createdAt);
      return d >= startDate && d < endDate;
    });

    const monthDateObj = new Date(targetYear, targetMonth - 1, 15);
    const monthName = monthDateObj.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    let totalSpent = 0;
    const categoryTotals = {};

    monthExpenses.forEach((e) => {
      const amt = Number(e.amount);
      totalSpent += amt;
      categoryTotals[e.category] = (categoryTotals[e.category] || 0) + amt;
    });

    const categoryBreakdown = Object.entries(categoryTotals)
      .map(([category, amount]) => ({
        category,
        amount: Number(amount.toFixed(2)),
        percentage: totalSpent > 0 ? Math.round((amount / totalSpent) * 100) : 0,
      }))
      .sort((a, b) => b.amount - a.amount);

    const topCategory = categoryBreakdown.length > 0 ? categoryBreakdown[0] : null;

    // Call AI analysis
    const aiInsights = await analyzeMonthlyExpenses({
      monthName,
      totalSpent: Number(totalSpent.toFixed(2)),
      transactionCount: monthExpenses.length,
      categoryBreakdown,
      topCategory,
    });

    return res.status(200).json({
      selectedMonth: activeMonthKey,
      monthName,
      totalSpent: Number(totalSpent.toFixed(2)),
      transactionCount: monthExpenses.length,
      categoryBreakdown,
      topCategory,
      aiInsights,
      availableMonths,
    });
  } catch (error) {
    console.error('AI Monthly analysis error:', error);
    return res.status(500).json({ message: 'Failed to generate monthly expense analysis' });
  }
});

module.exports = router;
