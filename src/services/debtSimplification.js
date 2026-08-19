const EPSILON = 0.01;

function simplifyDebts(balances) {
  const creditors = [];
  const debtors = [];

  for (const balance of balances) {
    const netBalance = Number(balance.netBalance) || 0;

    if (netBalance > EPSILON) {
      creditors.push({ userId: balance.userId, amount: netBalance });
    } else if (netBalance < -EPSILON) {
      debtors.push({ userId: balance.userId, amount: -netBalance });
    }
  }

  creditors.sort((left, right) => right.amount - left.amount);
  debtors.sort((left, right) => right.amount - left.amount);

  const settlements = [];
  let creditorIndex = 0;
  let debtorIndex = 0;

  // Greedy min-cash-flow algorithm:
  // Always match the current largest creditor with the current largest debtor.
  // Settle the smaller outstanding amount, then move past whichever side reaches ~0.
  // This keeps each step locally optimal and reduces the problem size quickly.
  while (creditorIndex < creditors.length && debtorIndex < debtors.length) {
    const creditor = creditors[creditorIndex];
    const debtor = debtors[debtorIndex];
    const amount = Math.min(creditor.amount, debtor.amount);

    settlements.push({
      from: debtor.userId,
      to: creditor.userId,
      amount,
    });

    creditor.amount -= amount;
    debtor.amount -= amount;

    if (creditor.amount <= EPSILON) {
      creditorIndex += 1;
    }

    if (debtor.amount <= EPSILON) {
      debtorIndex += 1;
    }
  }

  return settlements;
}

// Time complexity: O(n log n) from sorting, plus O(n) for the greedy matching pass.

module.exports = { simplifyDebts };
