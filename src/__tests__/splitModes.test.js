const { describe, it } = require('node:test');
const assert = require('node:assert');

// Node.js test implementation of the split engine
function parseFraction(str) {
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

function calculateWeightedSplits({ totalAmount, members, excludedMembers = {}, weights = {}, payerId }) {
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

  const absorbsMember =
    includedMembers.find((m) => m.id === payerId && (Number(weights[m.id]) || 0) > 0) ||
    includedMembers.find((m) => (Number(weights[m.id]) || 0) > 0);

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

function calculateSharesByMode({
  splitMode,
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
    return calculateWeightedSplits({ totalAmount: totalAmountNum, members, excludedMembers, weights, payerId });
  }

  if (splitMode === 'fraction') {
    const weights = {};
    for (const m of members) {
      weights[m.id] = parseFraction(fractions[m.id]);
    }
    return calculateWeightedSplits({ totalAmount: totalAmountNum, members, excludedMembers, weights, payerId });
  }

  if (splitMode === 'count') {
    const weights = {};
    for (const m of members) {
      const c = parseFloat(counts[m.id]);
      weights[m.id] = Number.isFinite(c) && c >= 0 ? c : 0;
    }
    return calculateWeightedSplits({ totalAmount: totalAmountNum, members, excludedMembers, weights, payerId });
  }

  // Default: equal
  const weights = {};
  for (const m of members) {
    weights[m.id] = excludedMembers[m.id] ? 0 : 1;
  }
  return calculateWeightedSplits({ totalAmount: totalAmountNum, members, excludedMembers, weights, payerId });
}

function validateSplitMode({
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
      return { isValid: false, message: `Percentages must total 100% (currently ${sumPercent.toFixed(1)}%)` };
    }
  }

  if (splitMode === 'fraction') {
    const sumFraction = includedMembers.reduce((sum, m) => {
      return sum + parseFraction(fractions[m.id]);
    }, 0);

    if (Math.abs(sumFraction - 1.0) > 0.005) {
      return { isValid: false, message: `Fractions must represent a complete split summing to 1` };
    }
  }

  if (splitMode === 'count') {
    const totalCount = includedMembers.reduce((sum, m) => {
      const c = parseFloat(counts[m.id]);
      return sum + (Number.isFinite(c) && c >= 0 ? c : 0);
    }, 0);

    if (totalCount <= 0) {
      return { isValid: false, message: 'Total share units / counts must be greater than 0' };
    }
  }

  if (splitMode === 'custom') {
    const sumCustom = includedMembers.reduce((sum, m) => {
      const val = parseFloat(customAmounts[m.id]);
      return sum + (Number.isFinite(val) ? val : 0);
    }, 0);

    const diff = Number((totalAmountNum - sumCustom).toFixed(2));
    if (Math.abs(diff) > 0.01) {
      return { isValid: false, message: `Custom shares must equal total amount` };
    }
  }

  const totalShares = includedMembers.reduce((sum, m) => {
    return sum + (Number(calculatedShares[m.id]) || 0);
  }, 0);

  const diffShares = Number((totalAmountNum - totalShares).toFixed(2));
  if (Math.abs(diffShares) > 0.01) {
    return { isValid: false, message: `Calculated splits must sum to total amount` };
  }

  return { isValid: true, message: 'Splits are balanced' };
}

describe('Split Modes & Exact Penny Rounding Unit Tests', () => {
  const members = [
    { id: 'u1', name: 'Jovab' },
    { id: 'u2', name: 'Rahul' },
    { id: 'u3', name: 'Arjun' },
  ];
  const payerId = 'u1';

  describe('1. Equal Split Mode', () => {
    it('should split ₹1000 equally among 3 members and assign remainder penny to payer', () => {
      const shares = calculateSharesByMode({
        splitMode: 'equal',
        totalAmount: 1000,
        members,
        payerId,
      });

      // 1000 / 3 = 333.33 each with 0.01 remainder to payer u1 -> u1=333.34, u2=333.33, u3=333.33
      assert.strictEqual(shares.u1, '333.34');
      assert.strictEqual(shares.u2, '333.33');
      assert.strictEqual(shares.u3, '333.33');

      const sum = Number(shares.u1) + Number(shares.u2) + Number(shares.u3);
      assert.strictEqual(Number(sum.toFixed(2)), 1000.00);
    });

    it('should handle exclusion of a member in equal split', () => {
      const shares = calculateSharesByMode({
        splitMode: 'equal',
        totalAmount: 500,
        members,
        excludedMembers: { u3: true },
        payerId,
      });

      assert.strictEqual(shares.u1, '250.00');
      assert.strictEqual(shares.u2, '250.00');
      assert.strictEqual(shares.u3, '0.00');
    });
  });

  describe('2. Custom Amount Split Mode', () => {
    it('should accept valid custom amounts that equal the total', () => {
      const customAmounts = { u1: '500.00', u2: '300.00', u3: '200.00' };
      const shares = calculateSharesByMode({
        splitMode: 'custom',
        totalAmount: 1000,
        members,
        customAmounts,
        payerId,
      });

      assert.strictEqual(shares.u1, '500.00');
      assert.strictEqual(shares.u2, '300.00');
      assert.strictEqual(shares.u3, '200.00');

      const validation = validateSplitMode({
        splitMode: 'custom',
        totalAmount: 1000,
        members,
        calculatedShares: shares,
        customAmounts,
      });

      assert.strictEqual(validation.isValid, true);
    });

    it('should invalidate when custom amounts do not match total expense', () => {
      const customAmounts = { u1: '500.00', u2: '300.00', u3: '100.00' }; // 900 != 1000
      const shares = calculateSharesByMode({
        splitMode: 'custom',
        totalAmount: 1000,
        members,
        customAmounts,
        payerId,
      });

      const validation = validateSplitMode({
        splitMode: 'custom',
        totalAmount: 1000,
        members,
        calculatedShares: shares,
        customAmounts,
      });

      assert.strictEqual(validation.isValid, false);
    });
  });

  describe('3. Percentage Split Mode', () => {
    it('should calculate actual currency shares from percentages (50%, 30%, 20%)', () => {
      const percentages = { u1: '50', u2: '30', u3: '20' };
      const shares = calculateSharesByMode({
        splitMode: 'percentage',
        totalAmount: 1000,
        members,
        percentages,
        payerId,
      });

      assert.strictEqual(shares.u1, '500.00');
      assert.strictEqual(shares.u2, '300.00');
      assert.strictEqual(shares.u3, '200.00');

      const validation = validateSplitMode({
        splitMode: 'percentage',
        totalAmount: 1000,
        members,
        calculatedShares: shares,
        percentages,
      });

      assert.strictEqual(validation.isValid, true);
    });

    it('should distribute rounding remainder on percentage splits (33.3%, 33.3%, 33.4%) on ₹100', () => {
      const percentages = { u1: '33.3', u2: '33.3', u3: '33.4' };
      const shares = calculateSharesByMode({
        splitMode: 'percentage',
        totalAmount: 100,
        members,
        percentages,
        payerId,
      });

      const sum = Number(shares.u1) + Number(shares.u2) + Number(shares.u3);
      assert.strictEqual(Number(sum.toFixed(2)), 100.00);
    });

    it('should reject when percentages do not sum to 100%', () => {
      const percentages = { u1: '50', u2: '30', u3: '10' }; // 90% != 100%
      const shares = calculateSharesByMode({
        splitMode: 'percentage',
        totalAmount: 1000,
        members,
        percentages,
        payerId,
      });

      const validation = validateSplitMode({
        splitMode: 'percentage',
        totalAmount: 1000,
        members,
        calculatedShares: shares,
        percentages,
      });

      assert.strictEqual(validation.isValid, false);
    });
  });

  describe('4. Fraction Split Mode', () => {
    it('should parse and calculate fractions (1/2, 1/4, 1/4) on ₹1000', () => {
      const fractions = { u1: '1/2', u2: '1/4', u3: '1/4' };
      const shares = calculateSharesByMode({
        splitMode: 'fraction',
        totalAmount: 1000,
        members,
        fractions,
        payerId,
      });

      assert.strictEqual(shares.u1, '500.00');
      assert.strictEqual(shares.u2, '250.00');
      assert.strictEqual(shares.u3, '250.00');

      const validation = validateSplitMode({
        splitMode: 'fraction',
        totalAmount: 1000,
        members,
        calculatedShares: shares,
        fractions,
      });

      assert.strictEqual(validation.isValid, true);
    });

    it('should handle fractions with rounding remainder (1/3, 1/3, 1/3) on ₹10', () => {
      const fractions = { u1: '1/3', u2: '1/3', u3: '1/3' };
      const shares = calculateSharesByMode({
        splitMode: 'fraction',
        totalAmount: 10,
        members,
        fractions,
        payerId,
      });

      assert.strictEqual(shares.u1, '3.34');
      assert.strictEqual(shares.u2, '3.33');
      assert.strictEqual(shares.u3, '3.33');

      const sum = Number(shares.u1) + Number(shares.u2) + Number(shares.u3);
      assert.strictEqual(Number(sum.toFixed(2)), 10.00);
    });

    it('should reject when fractions do not sum to 1', () => {
      const fractions = { u1: '1/2', u2: '1/4', u3: '1/8' }; // 7/8 != 1
      const validation = validateSplitMode({
        splitMode: 'fraction',
        totalAmount: 1000,
        members,
        calculatedShares: {},
        fractions,
      });

      assert.strictEqual(validation.isValid, false);
    });
  });

  describe('5. Count Split Mode', () => {
    it('should calculate weighted count shares (1, 2, 2) on ₹1000', () => {
      const counts = { u1: '1', u2: '2', u3: '2' }; // total 5 units -> 200, 400, 400
      const shares = calculateSharesByMode({
        splitMode: 'count',
        totalAmount: 1000,
        members,
        counts,
        payerId,
      });

      assert.strictEqual(shares.u1, '200.00');
      assert.strictEqual(shares.u2, '400.00');
      assert.strictEqual(shares.u3, '400.00');

      const validation = validateSplitMode({
        splitMode: 'count',
        totalAmount: 1000,
        members,
        calculatedShares: shares,
        counts,
      });

      assert.strictEqual(validation.isValid, true);
    });

    it('should assign penny remainder to payer when counts produce fractional cents (1, 1, 1) on ₹100', () => {
      const counts = { u1: '1', u2: '1', u3: '1' };
      const shares = calculateSharesByMode({
        splitMode: 'count',
        totalAmount: 100,
        members,
        counts,
        payerId,
      });

      assert.strictEqual(shares.u1, '33.34');
      assert.strictEqual(shares.u2, '33.33');
      assert.strictEqual(shares.u3, '33.33');

      const sum = Number(shares.u1) + Number(shares.u2) + Number(shares.u3);
      assert.strictEqual(Number(sum.toFixed(2)), 100.00);
    });
  });

  describe('6. Switching Split Modes without Corruption', () => {
    it('should preserve and convert valid share data across mode switches', () => {
      const totalAmount = 1200;

      // 1. Equal
      const eqShares = calculateSharesByMode({ splitMode: 'equal', totalAmount, members, payerId });
      assert.strictEqual(eqShares.u1, '400.00');
      assert.strictEqual(eqShares.u2, '400.00');
      assert.strictEqual(eqShares.u3, '400.00');

      // 2. Switch to Percentage
      const percentages = { u1: '50', u2: '25', u3: '25' };
      const pctShares = calculateSharesByMode({ splitMode: 'percentage', totalAmount, members, percentages, payerId });
      assert.strictEqual(pctShares.u1, '600.00');
      assert.strictEqual(pctShares.u2, '300.00');
      assert.strictEqual(pctShares.u3, '300.00');

      // 3. Switch to Count
      const counts = { u1: '3', u2: '1', u3: '2' }; // 6 units -> 600, 200, 400
      const cntShares = calculateSharesByMode({ splitMode: 'count', totalAmount, members, counts, payerId });
      assert.strictEqual(cntShares.u1, '600.00');
      assert.strictEqual(cntShares.u2, '200.00');
      assert.strictEqual(cntShares.u3, '400.00');

      // 4. Switch to Custom
      const customAmounts = { ...cntShares };
      const custShares = calculateSharesByMode({ splitMode: 'custom', totalAmount, members, customAmounts, payerId });
      assert.deepStrictEqual(custShares, cntShares);
    });
  });
});
