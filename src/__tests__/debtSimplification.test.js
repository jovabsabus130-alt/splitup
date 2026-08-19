const { describe, it } = require('node:test');
const assert = require('node:assert');
const { simplifyDebts } = require('../services/debtSimplification');

describe('Debt Simplification Algorithm Unit Tests', () => {
  it('should return empty settlements when all balances are zero', () => {
    const balances = [
      { userId: 'u1', netBalance: 0 },
      { userId: 'u2', netBalance: 0 },
    ];
    const settlements = simplifyDebts(balances);
    assert.deepStrictEqual(settlements, []);
  });

  it('should simplify simple 2-person debt correctly', () => {
    const balances = [
      { userId: 'u1', netBalance: 100 },
      { userId: 'u2', netBalance: -100 },
    ];
    const settlements = simplifyDebts(balances);
    assert.strictEqual(settlements.length, 1);
    assert.strictEqual(settlements[0].from, 'u2');
    assert.strictEqual(settlements[0].to, 'u1');
    assert.strictEqual(settlements[0].amount, 100);
  });

  it('should simplify 3-person multi-debtor group efficiently', () => {
    // U1 paid 70, U2 owes 40, U3 owes 30
    const balances = [
      { userId: 'u1', netBalance: 70 },
      { userId: 'u2', netBalance: -40 },
      { userId: 'u3', netBalance: -30 },
    ];
    const settlements = simplifyDebts(balances);
    assert.strictEqual(settlements.length, 2);
    
    // Largest debtor u2 pays u1: 40
    assert.strictEqual(settlements[0].from, 'u2');
    assert.strictEqual(settlements[0].to, 'u1');
    assert.strictEqual(settlements[0].amount, 40);

    // Next debtor u3 pays u1: 30
    assert.strictEqual(settlements[1].from, 'u3');
    assert.strictEqual(settlements[1].to, 'u1');
    assert.strictEqual(settlements[1].amount, 30);
  });

  it('should ignore sub-cent micro precision EPSILON balances', () => {
    const balances = [
      { userId: 'u1', netBalance: 0.004 },
      { userId: 'u2', netBalance: -0.004 },
    ];
    const settlements = simplifyDebts(balances);
    assert.deepStrictEqual(settlements, []);
  });
});
