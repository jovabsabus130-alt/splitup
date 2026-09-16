/**
 * SplitUp Advanced Split Modes & Exact Penny Rounding Engine
 * Supports: 'equal' | 'custom' | 'percentage' | 'fraction' | 'count'
 */

/**
 * Parse string fraction into decimal value (e.g. "1/2" -> 0.5, "3/4" -> 0.75, "0.25" -> 0.25)
 */
export function parseFraction(str) {
  if (!str || typeof str !== 'string') {
    const num = Number(str);
    return Number.isFinite(num) && num >= 0 ? num : 0;
  }
  const trimmed = str.trim();
  if (trimmed.includes('/')) {
    const parts = trimmed.split('/');
    if (parts.length === 2) {
      const num = parseFloat(parts[0]);
      const denom = parseFloat(parts[1]);
      if (Number.isFinite(num) && Number.isFinite(denom) && denom > 0 && num >= 0) {
        return num / denom;
      }
    }
    return 0;
  }
  const val = parseFloat(trimmed);
  return Number.isFinite(val) && val >= 0 ? val : 0;
}

/**
 * Distribute total cents with weights, assigning remainder cents to payer
 */
export function calculateWeightedSplits({
  totalAmount,
  members,
  excludedMembers = {},
  weights = {},
  payerId,
}) {
  const totalAmountNum = Number(totalAmount) || 0;
  if (totalAmountNum <= 0 || !members || members.length === 0) {
    const empty = {};
    for (const m of members || []) empty[m.id] = '0.00';
    return empty;
  }

  const totalCents = Math.round(totalAmountNum * 100);
  const includedMembers = members.filter((m) => !excludedMembers[m.id]);

  let totalWeight = 0;
  for (const m of includedMembers) {
    const w = Number(weights[m.id]) || 0;
    if (w > 0) totalWeight += w;
  }

  const result = {};
  for (const m of members) {
    result[m.id] = '0.00';
  }

  if (totalWeight <= 0 || includedMembers.length === 0) {
    return result;
  }

  let allocatedCents = 0;
  const centsMap = {};

  for (const m of includedMembers) {
    const w = Number(weights[m.id]) || 0;
    if (w > 0) {
      const c = Math.floor((w / totalWeight) * totalCents);
      centsMap[m.id] = c;
      allocatedCents += c;
    } else {
      centsMap[m.id] = 0;
    }
  }

  const remainderCents = totalCents - allocatedCents;

  // Assign remainder cents to the payer if included & has weight > 0, otherwise first included member with weight > 0
  const absorbsMember = includedMembers.find((m) => m.id === payerId && (Number(weights[m.id]) || 0) > 0)
    || includedMembers.find((m) => (Number(weights[m.id]) || 0) > 0);

  if (absorbsMember && centsMap[absorbsMember.id] !== undefined) {
    centsMap[absorbsMember.id] += remainderCents;
  }

  for (const m of members) {
    if (centsMap[m.id] !== undefined) {
      result[m.id] = (centsMap[m.id] / 100).toFixed(2);
    }
  }

  return result;
}

/**
 * Calculate member currency shares based on splitMode
 */
export function calculateSharesByMode({
  splitMode, // 'equal' | 'custom' | 'percentage' | 'fraction' | 'count'
  totalAmount,
  members,
  excludedMembers = {},
  customAmounts = {},
  percentages = {},
  fractions = {},
  counts = {},
  payerId,
}) {
  const totalAmountNum = Number(totalAmount) || 0;

  if (splitMode === 'custom') {
    // Custom amounts entered directly
    const result = {};
    for (const m of members) {
      if (excludedMembers[m.id]) {
        result[m.id] = '0.00';
      } else {
        const val = parseFloat(customAmounts[m.id]);
        result[m.id] = Number.isFinite(val) && val >= 0 ? val.toFixed(2) : '0.00';
      }
    }
    return result;
  }

  if (splitMode === 'percentage') {
    const weights = {};
    for (const m of members) {
      const p = parseFloat(percentages[m.id]);
      weights[m.id] = Number.isFinite(p) && p >= 0 ? p : 0;
    }
    return calculateWeightedSplits({
      totalAmount: totalAmountNum,
      members,
      excludedMembers,
      weights,
      payerId,
    });
  }

  if (splitMode === 'fraction') {
    const weights = {};
    for (const m of members) {
      weights[m.id] = parseFraction(fractions[m.id]);
    }
    return calculateWeightedSplits({
      totalAmount: totalAmountNum,
      members,
      excludedMembers,
      weights,
      payerId,
    });
  }

  if (splitMode === 'count') {
    const weights = {};
    for (const m of members) {
      const c = parseFloat(counts[m.id]);
      weights[m.id] = Number.isFinite(c) && c >= 0 ? c : 0;
    }
    return calculateWeightedSplits({
      totalAmount: totalAmountNum,
      members,
      excludedMembers,
      weights,
      payerId,
    });
  }

  // Default: 'equal'
  const weights = {};
  for (const m of members) {
    weights[m.id] = excludedMembers[m.id] ? 0 : 1;
  }
  return calculateWeightedSplits({
    totalAmount: totalAmountNum,
    members,
    excludedMembers,
    weights,
    payerId,
  });
}

/**
 * Validate active split mode inputs
 */
export function validateSplitMode({
  splitMode,
  totalAmount,
  members,
  excludedMembers = {},
  calculatedShares = {},
  customAmounts = {},
  percentages = {},
  fractions = {},
  counts = {},
}) {
  const totalAmountNum = Number(totalAmount) || 0;
  if (totalAmountNum <= 0) {
    return { isValid: false, message: 'Expense amount must be greater than 0' };
  }

  const includedMembers = members.filter((m) => !excludedMembers[m.id]);
  if (includedMembers.length === 0) {
    return { isValid: false, message: 'At least one group member must be included in the split' };
  }

  if (splitMode === 'percentage') {
    const sumPercent = includedMembers.reduce((sum, m) => {
      const p = parseFloat(percentages[m.id]);
      return sum + (Number.isFinite(p) ? p : 0);
    }, 0);

    const diff = Number((sumPercent - 100).toFixed(2));
    if (Math.abs(diff) > 0.05) {
      return {
        isValid: false,
        message: `Percentages must total 100% (currently ${sumPercent.toFixed(1)}%)`,
        sumPercent,
      };
    }
  }

  if (splitMode === 'fraction') {
    const sumFraction = includedMembers.reduce((sum, m) => {
      return sum + parseFraction(fractions[m.id]);
    }, 0);

    if (Math.abs(sumFraction - 1.0) > 0.005) {
      return {
        isValid: false,
        message: `Fractions must represent a complete split summing to 1 (currently ${sumFraction.toFixed(2)})`,
        sumFraction,
      };
    }
  }

  if (splitMode === 'count') {
    const totalCount = includedMembers.reduce((sum, m) => {
      const c = parseFloat(counts[m.id]);
      return sum + (Number.isFinite(c) && c >= 0 ? c : 0);
    }, 0);

    if (totalCount <= 0) {
      return {
        isValid: false,
        message: 'Total share units / counts must be greater than 0',
        totalCount,
      };
    }
  }

  if (splitMode === 'custom') {
    const sumCustom = includedMembers.reduce((sum, m) => {
      const val = parseFloat(customAmounts[m.id]);
      return sum + (Number.isFinite(val) ? val : 0);
    }, 0);

    const diff = Number((totalAmountNum - sumCustom).toFixed(2));
    if (Math.abs(diff) > 0.01) {
      return {
        isValid: false,
        message: `Custom shares (₹${sumCustom.toFixed(2)}) must equal total expense amount (₹${totalAmountNum.toFixed(2)})`,
        diff,
      };
    }
  }

  // Final check: sum of calculated shares must equal totalAmountNum
  const totalShares = includedMembers.reduce((sum, m) => {
    return sum + (Number(calculatedShares[m.id]) || 0);
  }, 0);

  const diffShares = Number((totalAmountNum - totalShares).toFixed(2));
  if (Math.abs(diffShares) > 0.01) {
    return {
      isValid: false,
      message: `Calculated splits (₹${totalShares.toFixed(2)}) must sum to total amount (₹${totalAmountNum.toFixed(2)})`,
      diff: diffShares,
    };
  }

  return { isValid: true, message: 'Splits are balanced' };
}
