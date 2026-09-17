import { useEffect, useMemo, useState } from 'react';
import api from '../lib/api';
import { PREDEFINED_CATEGORIES } from '../lib/constants';
import { calculateSharesByMode, parseFraction, validateSplitMode } from '../lib/splitCalculations';

export default function LogExpenseFABModal({
  isOpen,
  onClose,
  groupId: initialGroupId = null,
  groupName: initialGroupName = null,
  members: initialMembers = [],
  onExpenseAdded,
}) {
  const [activeTab, setActiveTab] = useState('log'); // 'log' | 'ai'
  
  // Group state (for dashboard usage when groupId is not fixed)
  const [groups, setGroups] = useState([]);
  const [selectedGroupId, setSelectedGroupId] = useState(initialGroupId || '');
  const [members, setMembers] = useState(initialMembers || []);
  const [loadingMembers, setLoadingMembers] = useState(false);

  // Form State for "Log a transaction"
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Food');
  const [paidById, setPaidById] = useState('');
  const [splitMode, setSplitMode] = useState('custom'); // 'custom' (editable amount, initialized equally) | 'percentage' | 'fraction' | 'count'
  const [excludedMembers, setExcludedMembers] = useState({});
  const [percentages, setPercentages] = useState({});
  const [fractions, setFractions] = useState({});
  const [counts, setCounts] = useState({});
  const [customAmounts, setCustomAmounts] = useState({});

  // AI Parse State
  const [aiText, setAiText] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [parsedExpense, setParsedExpense] = useState(null);

  // Submission State
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const currentUser = useMemo(() => {
    const raw = localStorage.getItem('splitup_user');
    return raw ? JSON.parse(raw) : null;
  }, []);

  // Fetch groups if not provided
  useEffect(() => {
    if (!initialGroupId && isOpen) {
      api.get('/api/groups')
        .then(({ data }) => {
          const fetchedGroups = data.groups || [];
          setGroups(fetchedGroups);
          if (fetchedGroups.length > 0 && !selectedGroupId) {
            setSelectedGroupId(fetchedGroups[0].id);
          }
        })
        .catch(() => {});
    }
  }, [initialGroupId, isOpen]);

  // Fetch group members when selectedGroupId changes
  useEffect(() => {
    const targetId = initialGroupId || selectedGroupId;
    if (targetId) {
      if (initialMembers && initialMembers.length > 0 && targetId === initialGroupId) {
        setMembers(initialMembers);
        setPaidById((prev) => prev || currentUser?.id || initialMembers[0]?.id || '');
      } else {
        setLoadingMembers(true);
        api.get(`/api/groups/${targetId}`)
          .then(({ data }) => {
            const rawMembers = data.group?.members || [];
            const userList = rawMembers.map((m) => (m.user ? { ...m.user, role: m.role } : m));
            setMembers(userList);
            setPaidById((prev) => prev || currentUser?.id || userList[0]?.id || '');
          })
          .catch(() => {})
          .finally(() => setLoadingMembers(false));
      }
    }
  }, [initialGroupId, selectedGroupId, initialMembers, currentUser]);

  // Sort members in alphabetical order (A to Z) with current user fallback
  const sortedMembers = useMemo(() => {
    let list = members;
    if ((!list || list.length === 0) && currentUser) {
      list = [{ id: currentUser.id, name: currentUser.name || currentUser.email || 'You', email: currentUser.email }];
    }
    return [...list].sort((a, b) => {
      const nameA = (a.name || a.email || '').toLowerCase();
      const nameB = (b.name || b.email || '').toLowerCase();
      return nameA.localeCompare(nameB);
    });
  }, [members, currentUser]);

  // Handle Split Mode Switching with Smart Default Initialization
  function handleSplitModeChange(newMode) {
    setSplitMode(newMode);
    const included = members.filter((m) => !excludedMembers[m.id]);
    const count = included.length || 1;
    const numAmount = parseFloat(amount) || 0;

    if (newMode === 'percentage') {
      const defaultPct = (100 / count).toFixed(1);
      const newPercentages = {};
      members.forEach((m) => {
        newPercentages[m.id] = excludedMembers[m.id] ? '0' : defaultPct;
      });
      setPercentages(newPercentages);
    } else if (newMode === 'fraction') {
      const defaultFrac = `1/${count}`;
      const newFractions = {};
      members.forEach((m) => {
        newFractions[m.id] = excludedMembers[m.id] ? '0' : defaultFrac;
      });
      setFractions(newFractions);
    } else if (newMode === 'count') {
      const newCounts = {};
      members.forEach((m) => {
        newCounts[m.id] = excludedMembers[m.id] ? '0' : '1';
      });
      setCounts(newCounts);
    } else if (newMode === 'custom') {
      const defaultCustom = (numAmount / count).toFixed(2);
      const newCustom = {};
      members.forEach((m) => {
        newCustom[m.id] = excludedMembers[m.id] ? '0.00' : defaultCustom;
      });
      setCustomAmounts(newCustom);
    }
  }

  // Handle Amount Change - Update Custom amounts if unedited
  function handleAmountChange(newVal) {
    setAmount(newVal);
    if (splitMode === 'custom') {
      const num = parseFloat(newVal) || 0;
      const included = members.filter((m) => !excludedMembers[m.id]);
      const count = included.length || 1;
      const share = (num / count).toFixed(2);
      const newCustom = {};
      members.forEach((m) => {
        newCustom[m.id] = excludedMembers[m.id] ? '0.00' : share;
      });
      setCustomAmounts(newCustom);
    }
  }

  // Compute live split shares using standard calculation engine
  const memberShares = useMemo(() => {
    return calculateSharesByMode({
      splitMode,
      totalAmount: amount,
      members,
      excludedMembers,
      customAmounts,
      percentages,
      fractions,
      counts,
      payerId: paidById || currentUser?.id,
    });
  }, [splitMode, amount, members, excludedMembers, customAmounts, percentages, fractions, counts, paidById, currentUser]);

  // Validation Status
  const splitValidation = useMemo(() => {
    return validateSplitMode({
      splitMode,
      totalAmount: amount,
      members,
      excludedMembers,
      calculatedShares: memberShares,
      customAmounts,
      percentages,
      fractions,
      counts,
    });
  }, [splitMode, amount, members, excludedMembers, memberShares, customAmounts, percentages, fractions, counts]);

  // Summary Metrics for Active Mode
  const modeMetrics = useMemo(() => {
    const included = members.filter((m) => !excludedMembers[m.id]);
    const numAmount = parseFloat(amount) || 0;

    if (splitMode === 'percentage') {
      const sum = included.reduce((s, m) => s + (parseFloat(percentages[m.id]) || 0), 0);
      const diff = Number((100 - sum).toFixed(1));
      return {
        isBalanced: Math.abs(diff) <= 0.05,
        text: `Total: ${sum.toFixed(1)}% / 100%`,
        subText: Math.abs(diff) <= 0.05 ? 'Balanced ✓' : diff > 0 ? `${diff}% remaining` : `${Math.abs(diff)}% over`,
        isError: Math.abs(diff) > 0.05,
      };
    }

    if (splitMode === 'fraction') {
      const sum = included.reduce((s, m) => s + parseFraction(fractions[m.id]), 0);
      const diff = Number((1 - sum).toFixed(2));
      return {
        isBalanced: Math.abs(diff) <= 0.005,
        text: `Total: ${sum.toFixed(2)} / 1.00`,
        subText: Math.abs(diff) <= 0.005 ? 'Balanced ✓' : diff > 0 ? `${diff} remaining` : `${Math.abs(diff)} over`,
        isError: Math.abs(diff) > 0.005,
      };
    }

    if (splitMode === 'count') {
      const totalUnits = included.reduce((s, m) => s + (parseFloat(counts[m.id]) || 0), 0);
      return {
        isBalanced: totalUnits > 0,
        text: `Total Units: ${totalUnits} shares`,
        subText: totalUnits > 0 ? 'Proportional weight' : 'Enter shares per person',
        isError: totalUnits <= 0,
      };
    }

    if (splitMode === 'custom') {
      const sum = included.reduce((s, m) => s + (parseFloat(customAmounts[m.id]) || 0), 0);
      const diff = Number((numAmount - sum).toFixed(2));
      return {
        isBalanced: Math.abs(diff) <= 0.01 && numAmount > 0,
        text: `Allocated: ₹${sum.toFixed(2)} / ₹${numAmount.toFixed(2)}`,
        subText: Math.abs(diff) <= 0.01 && numAmount > 0 ? 'Balanced ✓' : diff > 0 ? `₹${diff.toFixed(2)} remaining` : `₹${Math.abs(diff).toFixed(2)} over`,
        isError: Math.abs(diff) > 0.01,
      };
    }

    // Default 'equal'
    const sharePerPerson = included.length > 0 && numAmount > 0 ? (numAmount / included.length).toFixed(2) : '0.00';
    return {
      isBalanced: included.length > 0 && numAmount > 0,
      text: `Split equally (${included.length} members)`,
      subText: `₹${sharePerPerson} each`,
      isError: false,
    };
  }, [splitMode, amount, members, excludedMembers, percentages, fractions, counts, customAmounts]);

  if (!isOpen) return null;

  async function handleAIParse() {
    if (!aiText.trim()) return;
    const targetId = initialGroupId || selectedGroupId;
    if (!targetId) {
      setError('Please select a group first.');
      return;
    }

    setIsParsing(true);
    setError('');
    setSuccessMsg('');
    setParsedExpense(null);

    try {
      const { data } = await api.post(`/api/groups/${targetId}/expenses/parse`, {
        text: aiText.trim(),
      });
      const parsed = data.parsed;
      setParsedExpense(parsed);
      setSuccessMsg('✨ Successfully parsed details! Review below and confirm.');

      // Match parsed payer
      let targetPayerId = paidById || currentUser?.id;
      if (parsed?.payerName) {
        const pName = parsed.payerName.trim().toLowerCase();
        const matchedPayer = members.find((m) => {
          const name = (m.name || '').trim().toLowerCase();
          if (name === pName) return true;
          if (pName === 'you' || pName === 'me' || pName === 'myself' || pName === 'i') {
            return m.id === currentUser?.id;
          }
          return name.includes(pName) || pName.includes(name);
        });
        if (matchedPayer) {
          targetPayerId = matchedPayer.id;
          setPaidById(matchedPayer.id);
        }
      }

      // Populate manual form with AI parsed data and exact splits from splitSuggestion
      if (parsed?.amount) setAmount(String(parsed.amount));
      if (parsed?.description) setDescription(parsed.description);
      if (parsed?.category) setCategory(parsed.category);

      if (parsed?.splitSuggestion && Array.isArray(parsed.splitSuggestion) && parsed.splitSuggestion.length > 0) {
        setSplitMode('custom');
        const nextCustom = {};
        const nextExcluded = {};

        members.forEach((m) => {
          const mName = (m.name || '').trim().toLowerCase();
          const match = parsed.splitSuggestion.find((s) => {
            const label = (s.label || '').trim().toLowerCase();
            if (label === mName) return true;
            if (label === 'you' || label === 'me' || label === 'myself' || label === 'i') {
              return m.id === currentUser?.id;
            }
            return mName.includes(label) || label.includes(mName);
          });

          if (match && !match.excluded && Number(match.share) > 0) {
            nextCustom[m.id] = Number(match.share).toFixed(2);
            nextExcluded[m.id] = false;
          } else {
            nextCustom[m.id] = '0.00';
            nextExcluded[m.id] = true;
          }
        });

        setCustomAmounts(nextCustom);
        setExcludedMembers(nextExcluded);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'AI Parsing failed. You can enter details manually.');
    } finally {
      setIsParsing(false);
    }
  }

  async function handleSubmitExpense(e) {
    if (e) e.preventDefault();
    const targetId = initialGroupId || selectedGroupId;
    if (!targetId) {
      setError('Please select a group.');
      return;
    }

    const numAmount = Number(amount);
    if (!numAmount || numAmount <= 0) {
      setError('Please enter a valid amount.');
      return;
    }

    // Validate active split mode
    if (!splitValidation.isValid) {
      setError(splitValidation.message || 'Please balance the splits before submitting.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const payloadPayer = paidById || currentUser?.id || members[0]?.id;
      const splits = Object.entries(memberShares)
        .filter(([userId]) => !excludedMembers[userId])
        .map(([userId, share]) => ({
          userId,
          share: Number(share),
        }));

      // Absorb small rounding discrepancy into payer's share
      const totalSplitsSum = splits.reduce((sum, s) => sum + s.share, 0);
      const diff = Number((numAmount - totalSplitsSum).toFixed(2));
      if (Math.abs(diff) <= 0.02 && diff !== 0) {
        const buyerSplit = splits.find((s) => s.userId === payloadPayer);
        if (buyerSplit) {
          buyerSplit.share = Number((buyerSplit.share + diff).toFixed(2));
        } else if (splits.length > 0) {
          splits[0].share = Number((splits[0].share + diff).toFixed(2));
        }
      }

      await api.post(`/api/groups/${targetId}/expenses`, {
        amount: numAmount,
        category: category || 'Food',
        description: description.trim() || category || 'Expense',
        paidById: payloadPayer,
        splits,
      });

      setSuccessMsg('✓ Transaction recorded successfully!');
      setTimeout(() => {
        if (onExpenseAdded) onExpenseAdded();
        onClose();
      }, 500);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to add transaction');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleConfirmParsedAI() {
    if (!parsedExpense) return;
    const targetId = initialGroupId || selectedGroupId;
    setSubmitting(true);
    setError('');

    try {
      let payloadPayer = paidById || currentUser?.id || members[0]?.id;
      if (parsedExpense.payerName) {
        const pName = parsedExpense.payerName.trim().toLowerCase();
        const matchedPayer = members.find((m) => {
          const name = (m.name || '').trim().toLowerCase();
          if (name === pName) return true;
          if (pName === 'you' || pName === 'me' || pName === 'myself' || pName === 'i') {
            return m.id === currentUser?.id;
          }
          return name.includes(pName) || pName.includes(name);
        });
        if (matchedPayer) {
          payloadPayer = matchedPayer.id;
        }
      }

      let splits = [];
      if (parsedExpense.splitSuggestion && Array.isArray(parsedExpense.splitSuggestion) && parsedExpense.splitSuggestion.length > 0) {
        splits = [];
        parsedExpense.splitSuggestion.forEach((item) => {
          const label = (item.label || '').trim().toLowerCase();
          const member = members.find((m) => {
            const name = (m.name || '').trim().toLowerCase();
            if (name === label) return true;
            if (label === 'you' || label === 'me' || label === 'myself' || label === 'i') {
              return m.id === currentUser?.id;
            }
            return name.includes(label) || label.includes(name);
          });

          if (member && !item.excluded && Number(item.share) > 0) {
            splits.push({
              userId: member.id,
              share: Number(item.share),
            });
          }
        });
      }

      // Fall back to equal only if no members could be matched
      if (splits.length === 0) {
        const inc = members.length || 1;
        const sh = Number((parsedExpense.amount / inc).toFixed(2));
        splits = members.map((m) => ({ userId: m.id, share: sh }));
      }

      // Absorb rounding discrepancy into payer's share
      const totalSplitsSum = splits.reduce((sum, s) => sum + s.share, 0);
      const diff = Number((Number(parsedExpense.amount) - totalSplitsSum).toFixed(2));
      if (Math.abs(diff) <= 0.02 && diff !== 0) {
        const buyerSplit = splits.find((s) => s.userId === payloadPayer);
        if (buyerSplit) {
          buyerSplit.share = Number((buyerSplit.share + diff).toFixed(2));
        } else if (splits.length > 0) {
          splits[0].share = Number((splits[0].share + diff).toFixed(2));
        }
      }

      await api.post(`/api/groups/${targetId}/expenses`, {
        amount: Number(parsedExpense.amount),
        category: parsedExpense.category || 'Food',
        description: parsedExpense.description || 'AI Logged Expense',
        paidById: payloadPayer,
        splits,
      });

      setSuccessMsg('✓ Expense confirmed and recorded with exact AI splits!');
      setTimeout(() => {
        if (onExpenseAdded) onExpenseAdded();
        onClose();
      }, 500);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save parsed expense');
    } finally {
      setSubmitting(false);
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
      aria-labelledby="log-expense-modal-title"
    >
      <div className="modal-box" style={{ maxWidth: '540px', width: '100%', maxHeight: '90dvh', overflowY: 'auto', overflowX: 'hidden', boxSizing: 'border-box' }}>
        <button
          type="button"
          className="modal-close"
          onClick={onClose}
          aria-label="Close modal"
        >
          ✕
        </button>

        {/* ── Modal Tabs Header ── */}
        <div style={{ display: 'flex', borderBottom: '2px solid var(--border-subtle)', gap: 'var(--space-2)', paddingBottom: '2px', width: '100%', boxSizing: 'border-box' }}>
          <button
            type="button"
            className="fab-modal-tab-btn"
            onClick={() => setActiveTab('log')}
            style={{
              flex: 1,
              padding: '8px 12px',
              fontSize: '14.5px',
              fontWeight: 700,
              color: activeTab === 'log' ? 'var(--text-primary)' : 'var(--text-muted)',
              borderBottom: activeTab === 'log' ? '3px solid var(--text-primary)' : '3px solid transparent',
              transition: 'all 0.15s ease',
              marginBottom: '-2px',
              textAlign: 'center',
            }}
          >
            Log a transaction
          </button>
          <button
            type="button"
            className="fab-modal-tab-btn"
            onClick={() => setActiveTab('ai')}
            style={{
              flex: 1,
              padding: '8px 12px',
              fontSize: '14.5px',
              fontWeight: 700,
              color: activeTab === 'ai' ? 'var(--text-primary)' : 'var(--text-muted)',
              borderBottom: activeTab === 'ai' ? '3px solid var(--text-primary)' : '3px solid transparent',
              transition: 'all 0.15s ease',
              marginBottom: '-2px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            <span>Parse with AI</span>
            <span style={{ fontSize: '12px' }}>✨</span>
          </button>
        </div>

        {error && <div className="error-text" style={{ marginTop: 'var(--space-2)', width: '100%', boxSizing: 'border-box' }}>{error}</div>}
        {successMsg && <div className="success-text" style={{ marginTop: 'var(--space-2)', width: '100%', boxSizing: 'border-box' }}>{successMsg}</div>}

        {/* ── Group Selector (if used from dashboard) ── */}
        {!initialGroupId && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: 'var(--space-2)', width: '100%', boxSizing: 'border-box' }}>
            <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>
              Choose Group:
            </label>
            <select
              value={selectedGroupId}
              onChange={(e) => setSelectedGroupId(e.target.value)}
              style={{ width: '100%', height: '40px', borderRadius: 'var(--radius-sm)', boxSizing: 'border-box' }}
            >
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* ── TAB 1: Log a Transaction Manually ── */}
        {activeTab === 'log' && (
          <form onSubmit={handleSubmitExpense} className="form-grid" style={{ gap: 'var(--space-4)', marginTop: 'var(--space-2)', width: '100%', boxSizing: 'border-box' }}>
            {/* Amount & Description Row - Responsive 2-to-1 Column */}
            <div className="log-expense-inputs-row" style={{ width: '100%', boxSizing: 'border-box' }}>
              <label className="form-label" style={{ margin: 0, width: '100%', boxSizing: 'border-box' }}>
                Amount (₹)
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => handleAmountChange(e.target.value)}
                  required
                  autoFocus
                  style={{ width: '100%', fontSize: '16px', fontWeight: 700, boxSizing: 'border-box' }}
                />
              </label>

              <label className="form-label" style={{ margin: 0, width: '100%', boxSizing: 'border-box' }}>
                Description
                <input
                  type="text"
                  placeholder="e.g. Dinner, Taxi, Groceries"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  style={{ width: '100%', boxSizing: 'border-box' }}
                />
              </label>
            </div>

            {/* Paid By Dropdown - Clean Alphabetical Order */}
            <label className="form-label" style={{ margin: 0, width: '100%', boxSizing: 'border-box' }}>
              Paid By
              <select
                value={paidById || (currentUser?.id || (sortedMembers[0] ? sortedMembers[0].id : ''))}
                onChange={(e) => setPaidById(e.target.value)}
                style={{
                  width: '100%',
                  height: '42px',
                  borderRadius: 'var(--radius-md)',
                  padding: '0 12px',
                  fontSize: '15px',
                  fontWeight: 600,
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-primary)',
                  boxSizing: 'border-box',
                  cursor: 'pointer',
                  pointerEvents: 'auto',
                }}
              >
                {sortedMembers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name || m.email} {m.id === currentUser?.id ? '(You)' : ''}
                  </option>
                ))}
              </select>
            </label>

            {/* Category Chips */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%', boxSizing: 'border-box' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>
                Category
              </span>
              <div className="category-chips-grid" style={{ gap: '6px', width: '100%', boxSizing: 'border-box' }}>
                {PREDEFINED_CATEGORIES.map((cat) => (
                  <button
                    key={cat.label}
                    type="button"
                    className={`category-chip${category === cat.label ? ' active' : ''}`}
                    onClick={() => setCategory(cat.label)}
                    style={{ padding: '4px 10px', fontSize: '12px' }}
                  >
                    <span>{cat.icon}</span>
                    <span>{cat.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Split Mode Selector (Equal, Percentage %, Fraction 1/2, Shares 🔢, Exact ₹) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%', boxSizing: 'border-box' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '4px', width: '100%', boxSizing: 'border-box' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>
                  Split Method
                </span>
                <span
                  style={{
                    fontSize: '11.5px',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 'var(--radius-full)',
                    background: modeMetrics.isError ? 'var(--warning-bg)' : 'var(--success-bg)',
                    color: modeMetrics.isError ? 'var(--warning-text)' : 'var(--success-text)',
                    border: `1px solid ${modeMetrics.isError ? 'var(--warning-border)' : 'var(--success-border)'}`,
                  }}
                >
                  {modeMetrics.text} • {modeMetrics.subText}
                </span>
              </div>

              <div className="split-mode-selector-grid" style={{ width: '100%', boxSizing: 'border-box' }}>
                {[
                  { id: 'custom', label: '₹ Amount' },
                  { id: 'percentage', label: '% Percentage' },
                  { id: 'fraction', label: '½ Fraction' },
                  { id: 'count', label: '🔢 Shares' },
                ].map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    className={`split-mode-btn${splitMode === mode.id ? ' active' : ''}`}
                    onClick={() => handleSplitModeChange(mode.id)}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Member Shares Breakdown in Alphabetical Order with Live Input Controls */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '220px', overflowY: 'auto', overflowX: 'hidden', background: 'var(--bg-subtle)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', WebkitOverflowScrolling: 'touch', width: '100%', boxSizing: 'border-box' }}>
              {sortedMembers.map((m) => {
                const isExcluded = Boolean(excludedMembers[m.id]);
                const isCurrent = m.id === currentUser?.id;
                const isPayer = m.id === paidById;

                return (
                  <div
                    key={m.id}
                    className={`split-member-item-row${isExcluded ? ' excluded' : ''}`}
                    style={{ width: '100%', boxSizing: 'border-box' }}
                  >
                    {/* Member Info & Checkbox */}
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', flex: '1 1 auto', minWidth: 0, margin: 0 }}>
                      <input
                        type="checkbox"
                        checked={!isExcluded}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setExcludedMembers((prev) => ({ ...prev, [m.id]: !checked }));
                        }}
                      />
                      <div className="group-avatar-mini" style={{ width: '26px', height: '26px', fontSize: '11px', flexShrink: 0 }}>
                        {m.name ? m.name.charAt(0).toUpperCase() : 'U'}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
                        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {m.name || m.email}
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '1px' }}>
                          {isCurrent && <span className="you-pill" style={{ fontSize: '9.5px', padding: '1px 4px' }}>You</span>}
                          {isPayer && <span className="payer-active-badge">👑 Payer</span>}
                        </div>
                      </div>
                    </label>

                    {/* Active Mode Interactive Input */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                      {/* Percentage Input */}
                      {splitMode === 'percentage' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="any"
                            placeholder="0"
                            className="split-input-pill"
                            style={{ width: '64px', textAlign: 'right', fontWeight: 600 }}
                            value={percentages[m.id] ?? ''}
                            disabled={isExcluded}
                            onChange={(e) => {
                              const val = e.target.value;
                              setPercentages((prev) => ({ ...prev, [m.id]: val }));
                            }}
                          />
                          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>%</span>
                        </div>
                      )}

                      {/* Fraction Input (e.g. 1/2, 1/3, 1/4) */}
                      {splitMode === 'fraction' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                          <input
                            type="text"
                            placeholder="1/2"
                            className="split-input-pill"
                            style={{ width: '64px', textAlign: 'center', fontWeight: 600 }}
                            value={fractions[m.id] ?? ''}
                            disabled={isExcluded}
                            onChange={(e) => {
                              const val = e.target.value;
                              setFractions((prev) => ({ ...prev, [m.id]: val }));
                            }}
                          />
                        </div>
                      )}

                      {/* Shares / Count Input */}
                      {splitMode === 'count' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            placeholder="1"
                            className="split-input-pill"
                            style={{ width: '54px', textAlign: 'center', fontWeight: 600 }}
                            value={counts[m.id] ?? ''}
                            disabled={isExcluded}
                            onChange={(e) => {
                              const val = e.target.value;
                              setCounts((prev) => ({ ...prev, [m.id]: val }));
                            }}
                          />
                          <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>shares</span>
                        </div>
                      )}

                      {/* Exact Custom Amount Input */}
                      {splitMode === 'custom' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>₹</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="0.00"
                            className="split-input-pill"
                            style={{ width: '74px', textAlign: 'right', fontWeight: 600 }}
                            value={customAmounts[m.id] ?? ''}
                            disabled={isExcluded}
                            onChange={(e) => {
                              const val = e.target.value;
                              setCustomAmounts((prev) => ({ ...prev, [m.id]: val }));
                            }}
                          />
                        </div>
                      )}

                      {/* Resulting Share Value */}
                      <strong
                        style={{
                          fontVariantNumeric: 'tabular-nums',
                          minWidth: '70px',
                          textAlign: 'right',
                          fontSize: '13.5px',
                          color: isExcluded ? 'var(--text-muted)' : 'var(--text-primary)',
                          textDecoration: isExcluded ? 'line-through' : 'none',
                        }}
                      >
                        ₹{memberShares[m.id] || '0.00'}
                      </strong>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Submit Button */}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: 'var(--space-2)' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={submitting || !amount || Number(amount) <= 0}
                style={{ minWidth: '130px' }}
              >
                {submitting ? 'Saving…' : 'Log Transaction'}
              </button>
            </div>
          </form>
        )}

        {/* ── TAB 2: Parse with AI ── */}
        {activeTab === 'ai' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                Describe the expense in plain English:
              </label>
              <textarea
                value={aiText}
                onChange={(e) => setAiText(e.target.value)}
                placeholder="e.g. Jovab paid 450 for Friday pizza, split equally between Jovab and Alex"
                rows={3}
                style={{ resize: 'vertical', fontSize: '14px' }}
              />
            </div>

            <button
              type="button"
              className="btn-primary"
              onClick={handleAIParse}
              disabled={isParsing || !aiText.trim()}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                background: 'linear-gradient(135deg, #0f172a 0%, #312e81 100%)',
              }}
            >
              {isParsing ? (
                <>
                  <span className="ai-btn-spinner" />
                  <span>Parsing with AI…</span>
                </>
              ) : (
                <>
                  <span>✨</span>
                  <span>Parse Expense</span>
                </>
              )}
            </button>

            {/* Parsed Result Preview */}
            {parsedExpense && (
              <div className="card" style={{ padding: 'var(--space-4)', background: 'var(--bg-subtle)', gap: 'var(--space-3)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                    AI Parsed Preview
                  </span>
                  <span style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)' }}>
                    ₹{Number(parsedExpense.amount || 0).toFixed(2)}
                  </span>
                </div>

                <div style={{ fontSize: '13.5px', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div><strong>Description:</strong> {parsedExpense.description || 'N/A'}</div>
                  <div><strong>Category:</strong> {parsedExpense.category || 'Food'}</div>
                  <div><strong>Payer:</strong> {parsedExpense.payerName || members.find((m) => m.id === paidById)?.name || 'You'}</div>
                </div>

                {/* Individual Split Breakdown from AI */}
                {parsedExpense.splitSuggestion && parsedExpense.splitSuggestion.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', background: 'var(--bg-surface)', padding: '8px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                      Calculated Member Splits:
                    </span>
                    {parsedExpense.splitSuggestion.map((s, idx) => (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12.5px' }}>
                        <span style={{ color: s.excluded ? 'var(--text-muted)' : 'var(--text-primary)' }}>
                          {s.label} {s.excluded ? '(Excluded)' : ''}
                        </span>
                        <strong style={{ fontVariantNumeric: 'tabular-nums', color: s.excluded ? 'var(--text-muted)' : 'var(--text-primary)' }}>
                          ₹{Number(s.share || 0).toFixed(2)}
                        </strong>
                      </div>
                    ))}
                  </div>
                )}

                {parsedExpense.breakdownExplanation && (
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', background: 'rgba(99, 102, 241, 0.05)', padding: '6px 8px', borderRadius: 'var(--radius-sm)', border: '1px dashed rgba(99, 102, 241, 0.2)' }}>
                    {parsedExpense.breakdownExplanation}
                  </div>
                )}

                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleConfirmParsedAI}
                  disabled={submitting}
                  style={{ width: '100%', marginTop: '4px' }}
                >
                  {submitting ? 'Confirming…' : '✓ Confirm & Save Expense'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
