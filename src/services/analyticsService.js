const prisma = require('../lib/prisma');
const { getGroupBalances } = require('./balanceService');

/**
 * Format a Date object to YYYY-MM-DD in local time
 */
function toDateKey(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Compute the startDate, endDate, and trend bucketing template for a given period
 */
function getPeriodDateRange(period = 'month', dateInput) {
  let refDate = new Date();
  if (dateInput) {
    // If YYYY-MM format, append -01
    const normalizedInput = /^\d{4}-\d{2}$/.test(dateInput) ? `${dateInput}-01` : dateInput;
    const parsed = new Date(normalizedInput);
    if (!isNaN(parsed.getTime())) {
      refDate = parsed;
    }
  }

  let startDate;
  let endDate;
  let trendBuckets = [];
  let periodLabel = '';

  if (period === 'day') {
    startDate = new Date(refDate.getFullYear(), refDate.getMonth(), refDate.getDate(), 0, 0, 0, 0);
    endDate = new Date(refDate.getFullYear(), refDate.getMonth(), refDate.getDate(), 23, 59, 59, 999);
    periodLabel = refDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    for (let h = 0; h < 24; h++) {
      const hourLabel = `${String(h).padStart(2, '0')}:00`;
      trendBuckets.push({
        key: String(h),
        label: hourLabel,
        amount: 0,
      });
    }
  } else if (period === 'week') {
    // Week starts Monday
    const dayOfWeek = refDate.getDay(); // 0 is Sun, 1 is Mon...
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const mon = new Date(refDate.getFullYear(), refDate.getMonth(), refDate.getDate() + diffToMonday);

    startDate = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate(), 0, 0, 0, 0);
    const sun = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + 6);
    endDate = new Date(sun.getFullYear(), sun.getMonth(), sun.getDate(), 23, 59, 59, 999);
    periodLabel = `${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    for (let i = 0; i < 7; i++) {
      const dayDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + i);
      const key = toDateKey(dayDate);
      trendBuckets.push({
        key,
        label: dayNames[i],
        date: key,
        amount: 0,
      });
    }
  } else {
    // 'month' (default)
    startDate = new Date(refDate.getFullYear(), refDate.getMonth(), 1, 0, 0, 0, 0);
    const lastDay = new Date(refDate.getFullYear(), refDate.getMonth() + 1, 0).getDate();
    endDate = new Date(refDate.getFullYear(), refDate.getMonth(), lastDay, 23, 59, 59, 999);
    periodLabel = refDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    for (let day = 1; day <= lastDay; day++) {
      const dayDate = new Date(refDate.getFullYear(), refDate.getMonth(), day);
      const key = toDateKey(dayDate);
      trendBuckets.push({
        key,
        label: `${day}`,
        date: key,
        amount: 0,
      });
    }
  }

  return {
    startDate,
    endDate,
    period,
    periodLabel,
    trendBuckets,
  };
}

/**
 * Fetch Structured Personal Analytics for the authenticated user
 */
async function getPersonalAnalytics({ userId, period = 'month', date }) {
  const { startDate, endDate, periodLabel, trendBuckets } = getPeriodDateRange(period, date);

  // 1. Get user groups
  const memberships = await prisma.groupMember.findMany({
    where: { userId },
    include: {
      group: {
        select: { id: true, name: true },
      },
    },
  });

  const userGroupIds = memberships.map((m) => m.groupId);

  // If user has no groups, return zero values
  if (userGroupIds.length === 0) {
    return {
      scope: 'personal',
      period,
      periodLabel,
      dateRange: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      },
      totalSpending: 0,
      categoryBreakdown: [],
      groupBreakdown: [],
      trend: trendBuckets.map((b) => ({ label: b.label, date: b.date || b.label, amount: 0 })),
      highestExpenses: [],
      amountOwed: 0,
      amountReceivable: 0,
      netBalance: 0,
    };
  }

  // 2. Fetch all expense splits for the user within date range across their groups
  const splits = await prisma.expenseSplit.findMany({
    where: {
      userId,
      expense: {
        groupId: { in: userGroupIds },
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
    },
    include: {
      expense: {
        include: {
          group: { select: { id: true, name: true } },
          paidBy: { select: { id: true, name: true, email: true } },
        },
      },
    },
    orderBy: {
      expense: { createdAt: 'desc' },
    },
  });

  // 3. Compute Total Spending & Trend Buckets
  let totalSpending = 0;
  const categoryTotals = {};
  const groupTotals = {};
  const trendMap = new Map();
  trendBuckets.forEach((b) => trendMap.set(b.key, 0));

  for (const split of splits) {
    const share = Number(split.share);
    totalSpending += share;

    // Category aggregation
    const cat = split.expense.category || 'Other';
    if (!categoryTotals[cat]) {
      categoryTotals[cat] = { amount: 0, count: 0 };
    }
    categoryTotals[cat].amount += share;
    categoryTotals[cat].count += 1;

    // Group aggregation
    const grpId = split.expense.group.id;
    const grpName = split.expense.group.name;
    if (!groupTotals[grpId]) {
      groupTotals[grpId] = { groupId: grpId, groupName: grpName, amount: 0, count: 0 };
    }
    groupTotals[grpId].amount += share;
    groupTotals[grpId].count += 1;

    // Trend aggregation
    const expDate = new Date(split.expense.createdAt);
    if (period === 'day') {
      const hKey = String(expDate.getHours());
      if (trendMap.has(hKey)) {
        trendMap.set(hKey, trendMap.get(hKey) + share);
      }
    } else {
      const dKey = toDateKey(expDate);
      if (trendMap.has(dKey)) {
        trendMap.set(dKey, trendMap.get(dKey) + share);
      }
    }
  }

  // 4. Format Category Breakdown
  const categoryBreakdown = Object.entries(categoryTotals)
    .map(([category, info]) => ({
      category,
      amount: Number(info.amount.toFixed(2)),
      count: info.count,
      percentage: totalSpending > 0 ? Math.round((info.amount / totalSpending) * 100) : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  // 5. Format Group Breakdown
  const groupBreakdown = Object.values(groupTotals)
    .map((info) => ({
      groupId: info.groupId,
      groupName: info.groupName,
      amount: Number(info.amount.toFixed(2)),
      count: info.count,
      percentage: totalSpending > 0 ? Math.round((info.amount / totalSpending) * 100) : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  // 6. Format Spending Trend
  const trend = trendBuckets.map((b) => ({
    label: b.label,
    date: b.date || b.label,
    amount: Number((trendMap.get(b.key) || 0).toFixed(2)),
  }));

  // 7. Highest Expenses
  const highestExpenses = splits
    .map((s) => ({
      id: s.expense.id,
      description: s.expense.description || s.expense.category,
      category: s.expense.category,
      totalAmount: Number(Number(s.expense.amount).toFixed(2)),
      userShare: Number(Number(s.share).toFixed(2)),
      date: s.expense.createdAt.toISOString(),
      groupId: s.expense.group.id,
      groupName: s.expense.group.name,
      paidBy: s.expense.paidBy?.name || 'Member',
    }))
    .sort((a, b) => b.userShare - a.userShare)
    .slice(0, 10);

  // 8. Overall Outstanding Balances across all user groups
  let amountOwed = 0;
  let amountReceivable = 0;

  for (const grpId of userGroupIds) {
    try {
      const groupBalances = await getGroupBalances(grpId);
      const myBal = groupBalances.find((b) => b.userId === userId);
      if (myBal) {
        if (myBal.netBalance > 0) {
          amountReceivable += myBal.netBalance;
        } else if (myBal.netBalance < 0) {
          amountOwed += Math.abs(myBal.netBalance);
        }
      }
    } catch {
      // Ignore individual group balance calculation failure
    }
  }

  const netBalance = amountReceivable - amountOwed;

  return {
    scope: 'personal',
    period,
    periodLabel,
    dateRange: {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    },
    totalSpending: Number(totalSpending.toFixed(2)),
    categoryBreakdown,
    groupBreakdown,
    trend,
    highestExpenses,
    amountOwed: Number(amountOwed.toFixed(2)),
    amountReceivable: Number(amountReceivable.toFixed(2)),
    netBalance: Number(netBalance.toFixed(2)),
  };
}

/**
 * Fetch Structured Group Analytics for a specific group
 */
async function getGroupAnalytics({ userId, groupId, period = 'month', date }) {
  // 1. Verify user membership in the requested group
  const membership = await prisma.groupMember.findUnique({
    where: {
      userId_groupId: { userId, groupId },
    },
    include: {
      group: {
        select: { id: true, name: true },
      },
    },
  });

  if (!membership) {
    const error = new Error('You are not a member of this group');
    error.status = 403;
    throw error;
  }

  const { startDate, endDate, periodLabel, trendBuckets } = getPeriodDateRange(period, date);

  // 2. Fetch all expenses in this group within the date range
  const expenses = await prisma.expense.findMany({
    where: {
      groupId,
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
    },
    include: {
      paidBy: { select: { id: true, name: true, email: true } },
      splits: {
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  // 3. Fetch all group members for complete member breakdown
  const allMembers = await prisma.groupMember.findMany({
    where: { groupId },
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
  });

  // 4. Aggregations
  let totalGroupSpending = 0;
  const categoryTotals = {};
  const memberPaidMap = new Map();
  const memberShareMap = new Map();
  const trendMap = new Map();
  trendBuckets.forEach((b) => trendMap.set(b.key, 0));

  allMembers.forEach((m) => {
    memberPaidMap.set(m.user.id, 0);
    memberShareMap.set(m.user.id, 0);
  });

  for (const exp of expenses) {
    const expAmount = Number(exp.amount);
    totalGroupSpending += expAmount;

    // Paid by
    const payerId = exp.paidById;
    memberPaidMap.set(payerId, (memberPaidMap.get(payerId) || 0) + expAmount);

    // Splits shares
    for (const split of exp.splits) {
      const uId = split.userId;
      const sAmt = Number(split.share);
      memberShareMap.set(uId, (memberShareMap.get(uId) || 0) + sAmt);
    }

    // Category
    const cat = exp.category || 'Other';
    if (!categoryTotals[cat]) {
      categoryTotals[cat] = { amount: 0, count: 0 };
    }
    categoryTotals[cat].amount += expAmount;
    categoryTotals[cat].count += 1;

    // Trend
    const expDate = new Date(exp.createdAt);
    if (period === 'day') {
      const hKey = String(expDate.getHours());
      if (trendMap.has(hKey)) {
        trendMap.set(hKey, trendMap.get(hKey) + expAmount);
      }
    } else {
      const dKey = toDateKey(expDate);
      if (trendMap.has(dKey)) {
        trendMap.set(dKey, trendMap.get(dKey) + expAmount);
      }
    }
  }

  // 5. Format Category Breakdown
  const categoryBreakdown = Object.entries(categoryTotals)
    .map(([category, info]) => ({
      category,
      amount: Number(info.amount.toFixed(2)),
      count: info.count,
      percentage: totalGroupSpending > 0 ? Math.round((info.amount / totalGroupSpending) * 100) : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  // 6. Format Member Spending Breakdown
  const memberBreakdown = allMembers
    .map((m) => {
      const paid = Number((memberPaidMap.get(m.user.id) || 0).toFixed(2));
      const share = Number((memberShareMap.get(m.user.id) || 0).toFixed(2));
      const net = Number((paid - share).toFixed(2));
      return {
        userId: m.user.id,
        name: m.user.name,
        email: m.user.email,
        paidAmount: paid,
        shareAmount: share,
        netPeriodAmount: net,
        percentage: totalGroupSpending > 0 ? Math.round((share / totalGroupSpending) * 100) : 0,
      };
    })
    .sort((a, b) => b.shareAmount - a.shareAmount);

  // 7. Format Trend
  const trend = trendBuckets.map((b) => ({
    label: b.label,
    date: b.date || b.label,
    amount: Number((trendMap.get(b.key) || 0).toFixed(2)),
  }));

  // 8. Highest Expenses
  const highestExpenses = expenses
    .map((e) => ({
      id: e.id,
      description: e.description || e.category,
      category: e.category,
      amount: Number(Number(e.amount).toFixed(2)),
      date: e.createdAt.toISOString(),
      paidBy: e.paidBy?.name || 'Member',
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10);

  // 9. Balances within the group from balanceService
  const balances = await getGroupBalances(groupId);
  const myGroupBal = balances.find((b) => b.userId === userId);
  const userNetBalance = myGroupBal ? Number(myGroupBal.netBalance.toFixed(2)) : 0;

  return {
    scope: 'group',
    groupId,
    groupName: membership.group.name,
    period,
    periodLabel,
    dateRange: {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    },
    totalSpending: Number(totalGroupSpending.toFixed(2)),
    totalGroupSpending: Number(totalGroupSpending.toFixed(2)),
    categoryBreakdown,
    memberBreakdown,
    trend,
    highestExpenses,
    balances,
    userBalance: {
      userNetBalance,
      youOwe: userNetBalance < 0 ? Math.abs(userNetBalance) : 0,
      youAreOwed: userNetBalance > 0 ? userNetBalance : 0,
    },
  };
}

module.exports = {
  getPeriodDateRange,
  getPersonalAnalytics,
  getGroupAnalytics,
};
