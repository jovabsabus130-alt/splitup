const prisma = require('../lib/prisma');

async function getGroupBalances(groupId) {
  const members = await prisma.groupMember.findMany({
    where: { groupId },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  const expenses = await prisma.expense.findMany({
    where: { groupId },
    include: {
      paidBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      splits: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      },
    },
  });

  const completedSettlements = await prisma.settlement.findMany({
    where: {
      groupId,
      status: 'completed',
    },
  });

  const balances = new Map();

  for (const member of members) {
    balances.set(member.userId, {
      userId: member.user.id,
      name: member.user.name,
      email: member.user.email,
      netBalance: 0,
    });
  }

  for (const expense of expenses) {
    const expenseAmount = Number(expense.amount.toString());

    if (!balances.has(expense.paidById)) {
      balances.set(expense.paidById, {
        userId: expense.paidById,
        name: expense.paidBy.name,
        email: expense.paidBy.email,
        netBalance: 0,
      });
    }

    balances.get(expense.paidById).netBalance += expenseAmount;

    for (const split of expense.splits) {
      const shareAmount = Number(split.share.toString());

      if (!balances.has(split.userId)) {
        balances.set(split.userId, {
          userId: split.userId,
          name: split.user.name,
          email: split.user.email,
          netBalance: 0,
        });
      }

      balances.get(split.userId).netBalance -= shareAmount;
    }
  }

  // Factor in completed settlements:
  // 'from' paid 'to' -> 'from' netBalance increases by amount, 'to' netBalance decreases by amount
  for (const s of completedSettlements) {
    const settleAmount = Number(s.amount.toString());
    if (balances.has(s.fromId)) {
      balances.get(s.fromId).netBalance += settleAmount;
    }
    if (balances.has(s.toId)) {
      balances.get(s.toId).netBalance -= settleAmount;
    }
  }

  return Array.from(balances.values());
}

module.exports = { getGroupBalances };
