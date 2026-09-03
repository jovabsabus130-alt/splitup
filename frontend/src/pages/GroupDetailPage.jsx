import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import CategoryPicker from '../components/CategoryPicker';
import EditExpenseModal from '../components/EditExpenseModal';
import ExpenseHistoryModal from '../components/ExpenseHistoryModal';
import ShareModal from '../components/ShareModal';
import ShoppingListSection from '../components/ShoppingListSection';
import api from '../lib/api';

export default function GroupDetailPage() {
  const { groupId } = useParams();
  const [group, setGroup] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [parseText, setParseText] = useState('');
  const [parseResult, setParseResult] = useState(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isCustomSplit, setIsCustomSplit] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [form, setForm] = useState({ amount: '', category: 'Food', description: '' });
  const [paidById, setPaidById] = useState('');
  const [memberShares, setMemberShares] = useState({});
  const [excludedMembers, setExcludedMembers] = useState({});
  const [showShare, setShowShare] = useState(false);
  const [joinRequests, setJoinRequests] = useState([]);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deletingGroup, setDeletingGroup] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [leavingGroup, setLeavingGroup] = useState(false);
  const [lastAddedExpense, setLastAddedExpense] = useState(null);
  const [editingExpense, setEditingExpense] = useState(null);
  const [historyExpense, setHistoryExpense] = useState(null);
  const navigate = useNavigate();

  const members = useMemo(() => group?.members?.map((m) => m.user) || [], [group]);
  const isAdmin = !!group?.isAdmin;

  // ── Load logged-in user id ─────────────────────────────────────────────────
  useEffect(() => {
    const userStr = localStorage.getItem('splitup_user');
    if (userStr) {
      try {
        const u = JSON.parse(userStr);
        if (u.id) {
          setCurrentUserId(u.id);
          return;
        }
      } catch {}
    }
    const token = localStorage.getItem('splitup_token') || localStorage.getItem('token');
    if (!token) return;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      setCurrentUserId(payload.userId || payload.id || payload.sub);
    } catch {
      // token not decodable – handled by auth middleware
    }
  }, []);

  async function loadGroupData() {
    setError('');
    try {
      const [groupRes, expensesRes] = await Promise.all([
        api.get(`/api/groups/${groupId}`),
        api.get(`/api/groups/${groupId}/expenses`),
      ]);
      setGroup(groupRes.data.group);
      setExpenses(expensesRes.data.expenses || []);
      if (groupRes.data.group.joinRequests) {
        setJoinRequests(groupRes.data.group.joinRequests);
      }
    } catch (apiError) {
      setError(apiError.response?.data?.message || 'Failed to load group');
    }
  }

  useEffect(() => {
    loadGroupData();
  }, [groupId]);

  // Set default paidById to current user once members / user id load
  useEffect(() => {
    if (!paidById && currentUserId && members.some((m) => m.id === currentUserId)) {
      setPaidById(currentUserId);
    } else if (!paidById && members.length > 0) {
      setPaidById(members[0].id);
    }
  }, [members, currentUserId, paidById]);

  // Helper: Distribute total cents equally, letting the buyer (payer) absorb any remainder cents (e.g. ₹0.01)
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

    // The buyer absorbs remainder cents if included in the split, otherwise the first included member
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

  // Calculate current user's live impact on this expense
  const effectivePayerId = paidById || currentUserId || members[0]?.id;

  // Recompute even split across included members only when not in custom split mode
  useEffect(() => {
    if (!members.length || isCustomSplit) return;
    setMemberShares(computeEvenSplits(form.amount, members, excludedMembers, effectivePayerId));
  }, [members.length, form.amount, excludedMembers, isCustomSplit, effectivePayerId]);

  // Live remaining amount with precision tolerance
  const totalAmount = Number(form.amount) || 0;
  const allocatedAmount = Object.entries(memberShares).reduce((sum, [id, share]) => {
    return excludedMembers[id] ? sum : sum + (Number(share) || 0);
  }, 0);
  const rawDiff = totalAmount - allocatedAmount;
  const remainingAmount = Math.abs(rawDiff) < 0.005 ? 0 : Number(rawDiff.toFixed(2));
  const isSplitBalanced = Math.abs(remainingAmount) <= 0.01;
  const isSplitOver = remainingAmount < -0.01;

  const currentUserIsPayer = effectivePayerId === currentUserId;
  const currentUserPaid = currentUserIsPayer ? totalAmount : 0;
  const currentUserShare = (currentUserId && !excludedMembers[currentUserId]) ? (Number(memberShares[currentUserId]) || 0) : 0;
  const currentUserNet = currentUserPaid - currentUserShare;

  function resetToEvenSplit() {
    setIsCustomSplit(false);
    setMemberShares(computeEvenSplits(form.amount, members, excludedMembers, effectivePayerId));
  }

  async function parseWithAI() {
    if (!parseText.trim()) return;
    setError('');
    setMessage('');
    setIsParsing(true);
    try {
      const { data } = await api.post(`/api/groups/${groupId}/expenses/parse`, { text: parseText });
      const p = data.parsed;
      setParseResult(p);
      setIsCustomSplit(true);

      // Fill top-level form fields
      setForm((prev) => ({
        ...prev,
        amount: String(p.amount),
        category: p.category,
        description: p.description || prev.description,
      }));

      // Auto-match AI labels to real member names, pre-fill shares + exclusions
      if (p.splitSuggestion && members.length) {
        const newShares = {};
        const newExcluded = {};

        for (const member of members) {
          const match = p.splitSuggestion.find((s) => {
            const labelNorm = s.label.toLowerCase().trim();
            const memberNorm = member.name.toLowerCase().trim();
            return (
              labelNorm === memberNorm ||
              memberNorm.includes(labelNorm) ||
              labelNorm.includes(memberNorm) ||
              ((labelNorm === 'you' || labelNorm === 'me' || labelNorm === 'i') && member.id === currentUserId)
            );
          });

          if (match) {
            newShares[member.id] = Number(match.share).toFixed(2);
            if (match.excluded || match.share === 0) newExcluded[member.id] = true;
          } else {
            newShares[member.id] = '0.00';
            newExcluded[member.id] = true;
          }
        }

        setMemberShares(newShares);
        setExcludedMembers(newExcluded);
      }

      // Auto-select payer if returned
      if (p.payerName && members.length) {
        const payerNorm = p.payerName.toLowerCase().trim();
        const payerMatch = members.find((m) => {
          const mNorm = m.name.toLowerCase().trim();
          return (
            mNorm === payerNorm ||
            mNorm.includes(payerNorm) ||
            payerNorm.includes(mNorm) ||
            ((payerNorm === 'you' || payerNorm === 'me' || payerNorm === 'i') && m.id === currentUserId)
          );
        });
        if (payerMatch) {
          setPaidById(payerMatch.id);
        }
      }

      setMessage('✨ AI parse complete — amounts and splits auto-filled! Review and submit below.');
    } catch (apiError) {
      setError(apiError.response?.data?.message || 'AI parse failed');
    } finally {
      setIsParsing(false);
    }
  }

  async function addExpense(event) {
    event.preventDefault();
    setError('');
    setMessage('');
    try {
      // Only include members that are not excluded
      const payloadPayer = paidById || currentUserId || members[0]?.id;
      let splits = Object.entries(memberShares)
        .filter(([userId]) => !excludedMembers[userId])
        .map(([userId, share]) => ({
          userId,
          share: Number(share),
        }));

      // Absorb rounding discrepancy (<= ₹0.01) directly into the buyer's split share
      const totalSplitsSum = splits.reduce((sum, s) => sum + s.share, 0);
      const diff = Number((Number(form.amount) - totalSplitsSum).toFixed(2));
      if (Math.abs(diff) <= 0.01 && diff !== 0) {
        const buyerSplit = splits.find((s) => s.userId === payloadPayer);
        if (buyerSplit) {
          buyerSplit.share = Number((buyerSplit.share + diff).toFixed(2));
        } else if (splits.length > 0) {
          splits[0].share = Number((splits[0].share + diff).toFixed(2));
        }
      }

      await api.post(`/api/groups/${groupId}/expenses`, {
        amount: Number(form.amount),
        category: form.category,
        description: form.description,
        paidById: payloadPayer,
        splits,
      });

      const payerName = members.find((m) => m.id === payloadPayer)?.name || 'Someone';
      setLastAddedExpense({
        amount: Number(form.amount),
        category: form.category,
        description: form.description,
        payerName,
        isUserPayer: payloadPayer === currentUserId,
        userNet: currentUserNet,
      });

      setForm({ amount: '', category: '', description: '' });
      setExcludedMembers({});
      setParseResult(null);
      setParseText('');
      setMessage('Expense added successfully!');
      await loadGroupData();
    } catch (apiError) {
      setError(apiError.response?.data?.message || 'Failed to add expense');
    }
  }

  async function handleDeleteGroup() {
    setDeletingGroup(true);
    setError('');
    try {
      await api.delete(`/api/groups/${groupId}`);
      navigate('/dashboard');
    } catch (apiError) {
      setError(apiError.response?.data?.message || 'Failed to delete group');
      setDeletingGroup(false);
      setConfirmDelete(false);
    }
  }

  async function handleLeaveGroup() {
    setLeavingGroup(true);
    setError('');
    try {
      await api.delete(`/api/groups/${groupId}/members/me`);
      navigate('/dashboard');
    } catch (apiError) {
      setError(apiError.response?.data?.message || 'Failed to leave group');
      setLeavingGroup(false);
      setConfirmLeave(false);
    }
  }

  async function handleJoinRequest(requestId, status) {
    try {
      await api.patch(`/api/groups/${groupId}/join-requests/${requestId}`, { status });
      setJoinRequests((prev) => prev.filter((r) => r.id !== requestId));
      if (status === 'approved') {
        setMessage('Member approved and added to group!');
        await loadGroupData();
      }
    } catch (apiError) {
      setError(apiError.response?.data?.message || 'Failed to update request');
    }
  }

  const totalGroupSpent = useMemo(() => {
    return expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  }, [expenses]);

  const userGroupNet = useMemo(() => {
    if (!currentUserId) return 0;
    return expenses.reduce((net, exp) => {
      const isPayer = exp.paidById === currentUserId || exp.paidBy?.id === currentUserId;
      const mySplit = exp.splits?.find((s) => s.userId === currentUserId || s.user?.id === currentUserId);
      const paid = isPayer ? Number(exp.amount) || 0 : 0;
      const share = mySplit ? Number(mySplit.share) || 0 : 0;
      return net + (paid - share);
    }, 0);
  }, [expenses, currentUserId]);

  return (
    <>
      <header className="page-header">
        <div>
          <h1>{group?.name || 'Group Details'}</h1>
          <p>{members.length} {members.length === 1 ? 'member' : 'members'} &bull; {expenses.length} {expenses.length === 1 ? 'expense' : 'expenses'} logged</p>
        </div>

        <div className="header-actions">
          <Link
            to={`/groups/${groupId}/balances`}
            className="btn-primary"
          >
            Balances & Settle
          </Link>
          <button
            id="share-btn"
            className="btn-secondary"
            onClick={() => setShowShare(true)}
          >
            Invite
          </button>
          {isAdmin && (
            <button
              id="delete-group-btn"
              className="btn-danger"
              onClick={() => setConfirmDelete(true)}
            >
              Delete Group
            </button>
          )}
          {!isAdmin && group && (
            <button
              id="leave-group-btn"
              className="btn-danger"
              onClick={() => setConfirmLeave(true)}
            >
              Leave Group
            </button>
          )}
        </div>
      </header>

      {error ? <div className="error-text">{error}</div> : null}
      {message ? <div className="success-text">{message}</div> : null}

      {/* ── Top Summary Balance Bar ── */}
      <div className="summary-balance-bar">
        <div className="summary-balance-item">
          <span className="summary-balance-label">Your Balance in Group</span>
          {userGroupNet > 0 ? (
            <>
              <span className="summary-balance-amount positive">+₹{userGroupNet.toFixed(2)}</span>
              <span className="summary-balance-subtext" style={{ color: 'var(--success)', fontWeight: 500 }}>You are owed money</span>
            </>
          ) : userGroupNet < 0 ? (
            <>
              <span className="summary-balance-amount negative">-₹{Math.abs(userGroupNet).toFixed(2)}</span>
              <span className="summary-balance-subtext" style={{ color: 'var(--danger)', fontWeight: 500 }}>You owe money</span>
            </>
          ) : (
            <>
              <span className="summary-balance-amount neutral">₹0.00</span>
              <span className="summary-balance-subtext">All settled up</span>
            </>
          )}
        </div>

        <div className="summary-balance-item">
          <span className="summary-balance-label">Total Group Spent</span>
          <span className="summary-balance-amount neutral">₹{totalGroupSpent.toFixed(2)}</span>
          <span className="summary-balance-subtext">{expenses.length} transactions across {members.length} members</span>
        </div>
      </div>

      {/* ── Post-Add Expense Settlement Prompt ─────────────────────────── */}
      {lastAddedExpense && (
        <div className="card" style={{ borderLeft: '4px solid var(--success)', background: 'var(--bg-surface)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '13.5px' }}>
              Expense of ₹{lastAddedExpense.amount.toFixed(2)} ({lastAddedExpense.category}) recorded
            </span>
            <button
              type="button"
              className="btn-ghost"
              style={{ height: '24px', padding: '0 4px' }}
              onClick={() => setLastAddedExpense(null)}
            >
              ✕
            </button>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '13px' }}>
              Paid by <strong>{lastAddedExpense.payerName}</strong>.{' '}
              {lastAddedExpense.isUserPayer ? (
                <span>You will receive <strong>₹{lastAddedExpense.userNet.toFixed(2)}</strong> back.</span>
              ) : lastAddedExpense.userNet < 0 ? (
                <span>You owe <strong>₹{Math.abs(lastAddedExpense.userNet).toFixed(2)}</strong>.</span>
              ) : (
                <span>You are settled for this expense.</span>
              )}
            </p>
            <Link to={`/groups/${groupId}/balances`} className="btn-secondary" style={{ height: '32px' }}>
              View Balances
            </Link>
          </div>
        </div>
      )}

      <div className="two-column-layout">
        {/* ── Left Column: Operations & Timeline ── */}
        <div style={{ display: 'grid', gap: 'var(--space-6)' }}>
          {/* ── AI Parse ────────────────────────────────────────────────────── */}
          <section className="card">
            <div className="card-header">
              <div>
                <h2 className="card-title">Parse Expense with AI</h2>
                <div className="card-subtitle">Natural text parsing with automatic math & participant matching</div>
              </div>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
              Type or paste details (e.g. <em>"Dinner 900 paid by Rahul, split with Jovab, exclude Anu"</em>) to calculate amounts and splits.
            </p>
            <textarea
              rows="3"
              value={parseText}
              disabled={isParsing}
              onChange={(event) => setParseText(event.target.value)}
              placeholder="e.g. Paid ₹1,200 for dinner split with Alex and Sam..."
            />
            <div>
              <button
                type="button"
                id="parse-with-ai-btn"
                className="btn-primary"
                onClick={parseWithAI}
                disabled={isParsing || !parseText.trim()}
              >
                {isParsing ? (
                  <>
                    <span className="ai-btn-spinner" aria-hidden="true"></span>
                    <span>Parsing…</span>
                  </>
                ) : (
                  <span>Parse with AI</span>
                )}
              </button>
            </div>
            {parseResult ? (
              <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
                <div className="success-text">
                  Parsed ₹{Number(parseResult.amount).toFixed(2)} ({parseResult.category}) — fields pre-filled below
                </div>
                {parseResult.breakdownExplanation && (
                  <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: 'var(--space-3)' }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 'var(--space-1)' }}>
                      Calculated Net Breakdown:
                    </div>
                    <div style={{ display: 'grid', gap: '4px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                      {parseResult.breakdownExplanation.split(/(?<=[.!?])\s+/).filter(Boolean).map((line, idx) => (
                         <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-1)' }}>
                          <span style={{ color: 'var(--success)' }}>&bull;</span>
                          <span>{line}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </section>

          {/* ── Add Expense ──────────────────────────────────────────────────── */}
          <section className="card">
            <div className="card-header">
              <div>
                <h2 className="card-title">Add & Split Expense</h2>
                <div className="card-subtitle">Manually enter details or review parsed values</div>
              </div>
            </div>
            <form onSubmit={addExpense} className="form-grid">
              <div className="expense-inputs-grid">
                <label>
                  Amount (₹)
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={form.amount}
                    onChange={(event) => setForm((prev) => ({ ...prev, amount: event.target.value }))}
                    required
                  />
                </label>

                <label>
                  Paid By
                  <select
                    className="payer-select-input"
                    value={paidById || currentUserId || ''}
                    onChange={(e) => setPaidById(e.target.value)}
                  >
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} {m.id === currentUserId ? '(You)' : ''}
                      </option>
                    ))}
                  </select>
                </label>

                <label style={{ gridColumn: 'span 2' }}>
                  Description (optional)
                  <input
                    placeholder="e.g. Dinner, Groceries, Flight tickets"
                    value={form.description}
                    onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                  />
                </label>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontWeight: 500, fontSize: '13px' }}>
                  Category
                </label>
                <CategoryPicker
                  value={form.category}
                  onChange={(cat) => setForm((prev) => ({ ...prev, category: cat }))}
                  idPrefix="new-exp-cat"
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>Splits & Individual Shares</span>
                {isCustomSplit && (
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ height: '28px', fontSize: '12px', padding: '0 8px' }}
                    onClick={resetToEvenSplit}
                  >
                    Reset to Equal Split
                  </button>
                )}
              </div>

              {/* ── Remaining amount indicator ── */}
              {totalAmount > 0 && (
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

                  const shareNum = isExcluded ? 0 : (Number(memberShares[member.id]) || 0);
                  const isPayer = member.id === effectivePayerId;
                  const paidContribution = isPayer ? totalAmount : 0;
                  const netForPerson = paidContribution - shareNum;

                  return (
                    <div key={member.id} className={`split-row${isExcluded ? ' split-row--excluded' : ''}`}>
                      <label className="split-checkbox-label">
                        <input
                          type="checkbox"
                          className="split-checkbox"
                          checked={!isExcluded}
                          disabled={isLastIncluded}
                          title={isLastIncluded ? 'At least one member must be included' : ''}
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
                          {isPayer && <span className="payer-pill" style={{ marginLeft: 6 }}>Payer</span>}
                        </span>
                      </label>

                      <div className="split-right-section">
                        <div className="split-impact-tag">
                          {totalAmount > 0 && !isExcluded ? (
                            netForPerson > 0 ? (
                              <span className="impact-badge receive">
                                +₹{netForPerson.toFixed(2)}
                              </span>
                            ) : netForPerson < 0 ? (
                              <span className="impact-badge pay">
                                -₹{Math.abs(netForPerson).toFixed(2)}
                              </span>
                            ) : (
                              <span className="impact-badge settled">
                                ₹0.00
                              </span>
                            )
                          ) : isExcluded ? (
                            <span className="impact-badge excluded">Excluded</span>
                          ) : null}
                        </div>

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

              {/* ── Live Settlement Summary Card ── */}
              {totalAmount > 0 && (
                <div style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: 'var(--space-3)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                    <div style={{ fontSize: '13px' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Your net impact: </span>
                      {currentUserNet > 0 ? (
                        <strong style={{ color: 'var(--success)', fontVariantNumeric: 'tabular-nums' }}>+₹{currentUserNet.toFixed(2)} (gets back)</strong>
                      ) : currentUserNet < 0 ? (
                        <strong style={{ color: 'var(--danger)', fontVariantNumeric: 'tabular-nums' }}>-₹{Math.abs(currentUserNet).toFixed(2)} (owes)</strong>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>₹0.00 (settled)</span>
                      )}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      Total: <strong>₹{totalAmount.toFixed(2)}</strong> &bull; Paid by {members.find((m) => m.id === effectivePayerId)?.name || 'Payer'}
                    </div>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
                <button type="submit" className="btn-primary" disabled={!isSplitBalanced || totalAmount <= 0}>
                  Add Expense
                </button>
                <Link to={`/groups/${groupId}/balances`} className="btn-secondary">
                  View Balances
                </Link>
              </div>
            </form>
          </section>

          {/* ── Shopping List ──────────────────────────────────────────────────── */}
          {group && (
            <ShoppingListSection
              groupId={groupId}
              members={members}
              currentUserId={currentUserId}
              onExpenseCreated={loadGroupData}
            />
          )}

          {/* ── Financial Ledger Expense Table ─────────────────────────────────── */}
          <section className="card">
            <div className="card-header">
              <div>
                <h2 className="card-title">Expense Ledger ({expenses.length})</h2>
                <div className="card-subtitle">Chronological ledger of recorded group transactions</div>
              </div>
            </div>
            {expenses.length === 0 ? (
              <p className="no-requests-text">No expenses logged yet.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="ledger-table">
                  <thead>
                    <tr>
                      <th>Description</th>
                      <th>Category</th>
                      <th>Paid By</th>
                      <th>Your Share</th>
                      <th>Total Amount</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expenses.map((expense) => {
                      const isPayer = expense.paidBy?.id === currentUserId || expense.paidById === currentUserId;
                      const mySplit = expense.splits?.find((s) => s.userId === currentUserId || s.user?.id === currentUserId);
                      const isEdited = expense.isEdited || (expense.editHistory && expense.editHistory.length > 0);
                      const formattedDate = expense.createdAt
                        ? new Date(expense.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                        : '';

                      return (
                        <tr key={expense.id}>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                              <strong style={{ color: 'var(--text-primary)' }}>
                                {expense.description || expense.category}
                              </strong>
                              {isEdited && (
                                <button
                                  type="button"
                                  className="admin-pill"
                                  style={{
                                    fontSize: '10.5px',
                                    padding: '1px 6px',
                                    background: 'var(--warning-bg)',
                                    color: 'var(--warning-text)',
                                    borderColor: 'var(--warning-border)',
                                    cursor: 'pointer',
                                  }}
                                  onClick={() => setHistoryExpense(expense)}
                                  title="Click to view edit history"
                                >
                                  Edited 📝
                                </button>
                              )}
                            </div>
                            {formattedDate && (
                              <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '2px' }}>
                                {formattedDate}
                              </div>
                            )}
                          </td>
                          <td>
                            <span className="category-tag">{expense.category}</span>
                          </td>
                          <td>
                            <span style={{ fontWeight: isPayer ? 600 : 400 }}>
                              {isPayer ? 'You' : expense.paidBy?.name}
                            </span>
                          </td>
                          <td>
                            {mySplit ? (
                              <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                                ₹{Number(mySplit.share).toFixed(2)}
                              </span>
                            ) : (
                              <span style={{ color: 'var(--text-muted)' }}>Excluded</span>
                            )}
                          </td>
                          <td>
                            <span className="amount-tabular">
                              ₹{Number(expense.amount).toFixed(2)}
                            </span>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', alignItems: 'center' }}>
                              <button
                                type="button"
                                className="btn-secondary"
                                style={{ height: '26px', fontSize: '11.5px', padding: '0 8px' }}
                                onClick={() => setEditingExpense(expense)}
                                title="Edit this transaction"
                              >
                                Edit
                              </button>
                              {isEdited && (
                                <button
                                  type="button"
                                  className="btn-ghost"
                                  style={{ height: '26px', fontSize: '11.5px', padding: '0 6px' }}
                                  onClick={() => setHistoryExpense(expense)}
                                  title="View change history"
                                >
                                  History
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        {/* ── Right Column: Sidebar ── */}
        <aside style={{ display: 'grid', gap: 'var(--space-6)' }}>
          {/* ── Overview Stat Card ── */}
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Group Summary</h2>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
              <div style={{ background: 'var(--bg-subtle)', padding: 'var(--space-3)', borderRadius: 'var(--radius-sm)' }}>
                <span style={{ fontSize: '11.5px', color: 'var(--text-secondary)', display: 'block', fontWeight: 500 }}>Total Spent</span>
                <span style={{ fontSize: '16px', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>₹{totalGroupSpent.toFixed(2)}</span>
              </div>
              <div style={{ background: 'var(--bg-subtle)', padding: 'var(--space-3)', borderRadius: 'var(--radius-sm)' }}>
                <span style={{ fontSize: '11.5px', color: 'var(--text-secondary)', display: 'block', fontWeight: 500 }}>Expenses</span>
                <span style={{ fontSize: '16px', fontWeight: 700 }}>{expenses.length}</span>
              </div>
            </div>
            <Link
              to={`/groups/${groupId}/balances`}
              className="btn-primary"
              style={{ width: '100%' }}
            >
              Settle Up & Balances
            </Link>
          </div>

          {/* ── Members List ── */}
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Members ({members.length})</h2>
              <button
                type="button"
                className="btn-secondary"
                style={{ height: '28px', fontSize: '12px', padding: '0 8px' }}
                onClick={() => setShowShare(true)}
              >
                Invite
              </button>
            </div>
            <ul className="list">
              {members.map((member) => (
                <li key={member.id} style={{ padding: '8px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', minWidth: 0 }}>
                    <div className="user-avatar-mini">{member.name.charAt(0).toUpperCase()}</div>
                    <span style={{ fontSize: '13px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {member.name}
                    </span>
                    {member.id === currentUserId && <span className="you-pill">You</span>}
                    {group?.adminId === member.id && <span className="admin-pill">Admin</span>}
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* ── Pending Requests (if admin) ── */}
          {isAdmin && joinRequests.length > 0 && (
            <div className="card">
              <div className="card-header">
                <h2 className="card-title">
                  Pending Requests ({joinRequests.length})
                </h2>
              </div>
              <ul className="list">
                {joinRequests.map((req) => (
                  <li key={req.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 'var(--space-2)' }}>
                    <div>
                      <strong style={{ fontSize: '13px', display: 'block' }}>{req.user.name}</strong>
                      <small style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{req.user.email}</small>
                    </div>
                    <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end' }}>
                      <button
                        className="btn-ghost"
                        style={{ height: '28px', fontSize: '12px' }}
                        onClick={() => handleJoinRequest(req.id, 'denied')}
                      >
                        Deny
                      </button>
                      <button
                        className="btn-primary"
                        style={{ height: '28px', fontSize: '12px' }}
                        onClick={() => handleJoinRequest(req.id, 'approved')}
                      >
                        Approve
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>

        {/* ── Share Modal ───────────────────────────────────────────────────── */}
        {showShare && group && (
          <ShareModal
            groupId={groupId}
            groupName={group.name}
            onClose={() => setShowShare(false)}
          />
        )}

        {/* ── Delete Group Confirmation Modal ──────────────────────────────── */}
        {confirmDelete && (
          <div
            className="modal-overlay"
            onClick={(e) => { if (e.target === e.currentTarget) setConfirmDelete(false); }}
            role="dialog"
            aria-modal="true"
            aria-label="Confirm group deletion"
          >
            <div className="modal-box delete-confirm-box">
              <button
                className="modal-close"
                onClick={() => setConfirmDelete(false)}
                aria-label="Cancel"
              >
                ✕
              </button>
              <div className="delete-confirm-icon">🗑</div>
              <h2>Delete &ldquo;{group?.name}&rdquo;?</h2>
              <p className="delete-confirm-desc">
                This will permanently delete the group along with all its expenses,
                splits, and settlements. This action cannot be undone.
              </p>
              <div className="delete-confirm-actions">
                <button
                  id="cancel-delete-btn"
                  className="cancel-delete-btn"
                  onClick={() => setConfirmDelete(false)}
                  disabled={deletingGroup}
                >
                  Cancel
                </button>
                <button
                  id="confirm-delete-btn"
                  className="confirm-delete-btn"
                  onClick={handleDeleteGroup}
                  disabled={deletingGroup}
                >
                  {deletingGroup ? 'Deleting…' : 'Yes, delete group'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Leave Group Confirmation Modal ──────────────────────────────── */}
        {confirmLeave && (
          <div
            className="modal-overlay"
            onClick={(e) => { if (e.target === e.currentTarget) setConfirmLeave(false); }}
            role="dialog"
            aria-modal="true"
            aria-label="Confirm leaving group"
          >
            <div className="modal-box delete-confirm-box">
              <button
                className="modal-close"
                onClick={() => setConfirmLeave(false)}
                aria-label="Cancel"
              >
                ✕
              </button>
              <div className="delete-confirm-icon">🚪</div>
              <h2>Leave &ldquo;{group?.name}&rdquo;?</h2>
              <p className="delete-confirm-desc">
                You can only leave if you have no pending debts in this group.
                Your expense history will remain visible to other members.
              </p>
              <div className="delete-confirm-actions">
                <button
                  id="cancel-leave-btn"
                  className="cancel-delete-btn"
                  onClick={() => setConfirmLeave(false)}
                  disabled={leavingGroup}
                >
                  Cancel
                </button>
                <button
                  id="confirm-leave-btn"
                  className="btn-danger"
                  onClick={handleLeaveGroup}
                  disabled={leavingGroup}
                >
                  {leavingGroup ? 'Leaving…' : 'Yes, leave group'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Edit Expense Modal ── */}
        {editingExpense && (
          <EditExpenseModal
            groupId={groupId}
            expense={editingExpense}
            members={members}
            currentUserId={currentUserId}
            onClose={() => setEditingExpense(null)}
            onUpdated={(updatedExp, msg) => {
              setMessage(msg || 'Transaction updated successfully!');
              loadGroupData();
            }}
          />
        )}

        {/* ── Expense History Audit Modal ── */}
        {historyExpense && (
          <ExpenseHistoryModal
            groupId={groupId}
            expense={historyExpense}
            onClose={() => setHistoryExpense(null)}
          />
        )}
    </>
  );
}
