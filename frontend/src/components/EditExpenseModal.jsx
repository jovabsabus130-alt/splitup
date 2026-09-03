import { useEffect, useState } from 'react';
import api from '../lib/api';
import CategoryPicker from './CategoryPicker';

export default function EditExpenseModal({ groupId, expense, members, currentUserId, onClose, onUpdated }) {
  const [amount, setAmount] = useState(String(expense.amount || ''));
  const [category, setCategory] = useState(expense.category || '');
  const [description, setDescription] = useState(expense.description || '');
  const [paidById, setPaidById] = useState(expense.paidById || expense.paidBy?.id || currentUserId || '');
  const [expenseDate, setExpenseDate] = useState(() => {
    if (expense.createdAt) {
      try {
        return new Date(expense.createdAt).toISOString().split('T')[0];
      } catch {}
    }
    return new Date().toISOString().split('T')[0];
  });

  const [memberShares, setMemberShares] = useState({});
  const [excludedMembers, setExcludedMembers] = useState({});
  const [isCustomSplit, setIsCustomSplit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Prepopulate member shares from existing splits
  useEffect(() => {
    if (!members.length) return;
    const initialShares = {};
    const initialExcluded = {};

    const splitsMap = {};
    (expense.splits || []).forEach((s) => {
      const uid = s.userId || s.user?.id;
      if (uid) splitsMap[uid] = Number(s.share).toFixed(2);
    });

    members.forEach((m) => {
      if (splitsMap[m.id] !== undefined) {
        initialShares[m.id] = splitsMap[m.id];
        if (Number(splitsMap[m.id]) === 0) initialExcluded[m.id] = true;
      } else {
        initialShares[m.id] = '0.00';
        initialExcluded[m.id] = true;
      }
    });

    setMemberShares(initialShares);
    setExcludedMembers(initialExcluded);
  }, [members, expense]);

  function computeEvenSplits(amountVal, memberList, excludedMap, payerId) {
    const included = memberList.filter((m) => !excludedMap[m.id]);
    if (!included.length || !amountVal || Number(amountVal) <= 0) {
      const empty = {};
      for (const m of memberList) empty[m.id] = '0.00';
      return empty;
    }
    const totalCents = Math.round(Number(amountVal) * 100);
    const count = included.length;
    const baseCents = Math.floor(totalCents / count);
    const remainderCents = totalCents - baseCents * count;

    const absorbsId = included.some((m) => m.id === payerId) ? payerId : included[0]?.id;

    const next = {};
    for (const m of memberList) {
      if (excludedMap[m.id]) {
        next[m.id] = '0.00';
      } else {
        const centsForMember = baseCents + (m.id === absorbsId ? remainderCents : 0);
        next[m.id] = (centsForMember / 100).toFixed(2);
      }
    }
    return next;
  }

  function handleResetEven() {
    setIsCustomSplit(false);
    setMemberShares(computeEvenSplits(amount, members, excludedMembers, paidById));
  }

  function handleAmountChange(newVal) {
    setAmount(newVal);
    if (!isCustomSplit) {
      setMemberShares(computeEvenSplits(newVal, members, excludedMembers, paidById));
    }
  }

  const totalAmountNum = Number(amount) || 0;
  const allocatedAmount = Object.entries(memberShares).reduce((sum, [id, share]) => {
    return excludedMembers[id] ? sum : sum + (Number(share) || 0);
  }, 0);
  const rawDiff = totalAmountNum - allocatedAmount;
  const remainingAmount = Math.abs(rawDiff) < 0.005 ? 0 : Number(rawDiff.toFixed(2));
  const isSplitBalanced = Math.abs(remainingAmount) <= 0.01 && totalAmountNum > 0;
  const isSplitOver = remainingAmount < -0.01;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!isSplitBalanced) return;
    setSaving(true);
    setError('');

    try {
      let splits = Object.entries(memberShares)
        .filter(([userId]) => !excludedMembers[userId])
        .map(([userId, share]) => ({
          userId,
          share: Number(share),
        }));

      // Absorb micro rounding discrepancy into payer's share
      const totalSplitsSum = splits.reduce((sum, s) => sum + s.share, 0);
      const diff = Number((Number(amount) - totalSplitsSum).toFixed(2));
      if (Math.abs(diff) <= 0.01 && diff !== 0) {
        const payerSplit = splits.find((s) => s.userId === paidById);
        if (payerSplit) {
          payerSplit.share = Number((payerSplit.share + diff).toFixed(2));
        } else if (splits.length > 0) {
          splits[0].share = Number((splits[0].share + diff).toFixed(2));
        }
      }

      const { data } = await api.put(`/api/groups/${groupId}/expenses/${expense.id}`, {
        amount: Number(amount),
        category,
        description,
        paidById,
        createdAt: expenseDate,
        splits,
      });

      if (onUpdated) onUpdated(data.expense, data.message);
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update transaction');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-modal-title"
    >
      <div className="modal-box" style={{ maxWidth: '640px', maxHeight: '90vh', overflowY: 'auto' }}>
        <button
          className="modal-close"
          onClick={onClose}
          aria-label="Close modal"
        >
          ✕
        </button>

        <div className="card-header" style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: 'var(--space-3)' }}>
          <div>
            <h2 id="edit-modal-title" className="card-title">Edit Transaction</h2>
            <div className="card-subtitle">
              Changes will be recorded in the transaction edit history log
            </div>
          </div>
        </div>

        {error && <div className="error-text" style={{ marginTop: 'var(--space-3)' }}>{error}</div>}

        <form onSubmit={handleSubmit} className="form-grid" style={{ marginTop: 'var(--space-4)', gap: 'var(--space-4)' }}>
          <div className="expense-inputs-grid">
            <label>
              Amount (₹)
              <input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(e) => handleAmountChange(e.target.value)}
                required
              />
            </label>

            <label>
              Paid By
              <select
                value={paidById}
                onChange={(e) => setPaidById(e.target.value)}
              >
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} {m.id === currentUserId ? '(You)' : ''}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Date
              <input
                type="date"
                value={expenseDate}
                onChange={(e) => setExpenseDate(e.target.value)}
                required
              />
            </label>

            <label style={{ gridColumn: 'span 2' }}>
              Description
              <input
                placeholder="e.g. Dinner, Groceries"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: 500, fontSize: '13px' }}>
              Category
            </label>
            <CategoryPicker
              value={category}
              onChange={setCategory}
              idPrefix="edit-cat"
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
            <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>Splits & Individual Shares</span>
            {isCustomSplit && (
              <button
                type="button"
                className="btn-secondary"
                style={{ height: '28px', fontSize: '12px', padding: '0 8px' }}
                onClick={handleResetEven}
              >
                Reset to Equal Split
              </button>
            )}
          </div>

          {totalAmountNum > 0 && (
            <div
              className={`remaining-indicator${
                isSplitOver
                  ? ' remaining-over'
                  : isSplitBalanced
                  ? ' remaining-done'
                  : ''
              }`}
            >
              <span>Remaining to split:</span>
              <strong style={{ fontVariantNumeric: 'tabular-nums' }}>₹{isSplitBalanced ? '0.00' : remainingAmount.toFixed(2)}</strong>
              {isSplitOver && (
                <span style={{ color: 'var(--danger)', marginLeft: 'auto' }}>Splits exceed total</span>
              )}
              {isSplitBalanced && (
                <span style={{ marginLeft: 'auto', color: 'var(--success)' }}>
                  Balanced
                </span>
              )}
            </div>
          )}

          <div className="splits-table-container">
            {members.map((member) => {
              const isExcluded = !!excludedMembers[member.id];
              const includedCount = members.filter((m) => !excludedMembers[m.id]).length;
              const isLastIncluded = !isExcluded && includedCount === 1;

              return (
                <div key={member.id} className={`split-row${isExcluded ? ' split-row--excluded' : ''}`}>
                  <label className="split-checkbox-label">
                    <input
                      type="checkbox"
                      className="split-checkbox"
                      checked={!isExcluded}
                      disabled={isLastIncluded}
                      onChange={(e) => {
                        const nowExcluded = !e.target.checked;
                        setExcludedMembers((prev) => {
                          const next = { ...prev };
                          if (nowExcluded) next[member.id] = true;
                          else delete next[member.id];
                          return next;
                        });
                      }}
                    />
                    <span>
                      {member.name}
                      {member.id === currentUserId && <span className="you-pill" style={{ marginLeft: 6 }}>You</span>}
                      {member.id === paidById && <span className="payer-pill" style={{ marginLeft: 6 }}>Payer</span>}
                    </span>
                  </label>

                  <div className="split-right-section">
                    <div className="split-share-wrap">
                      <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>₹</span>
                      <input
                        type="number"
                        step="0.01"
                        className="split-share-input"
                        value={isExcluded ? '' : (memberShares[member.id] || '0')}
                        disabled={isExcluded}
                        placeholder={isExcluded ? '0.00' : ''}
                        onChange={(event) => {
                          setIsCustomSplit(true);
                          setMemberShares((prev) => ({
                            ...prev,
                            [member.id]: event.target.value,
                          }));
                        }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end', marginTop: 'var(--space-2)' }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={saving || !isSplitBalanced || totalAmountNum <= 0}
            >
              {saving ? 'Saving Changes…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
