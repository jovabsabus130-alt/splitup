import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import ExpenseHistoryModal from '../components/ExpenseHistoryModal';
import TransactionConcernModal from '../components/TransactionConcernModal';
import api from '../lib/api';

export default function HistoryPage() {
  const navigate = useNavigate();

  const [transactions, setTransactions] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 15, total: 0, totalPages: 1, hasMore: false });
  const [summary, setSummary] = useState({ totalCount: 0, userTotalPaid: 0, userTotalShare: 0 });
  const [groups, setGroups] = useState([]);

  // Filters
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // UI States
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedTxId, setExpandedTxId] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [concernExpense, setConcernExpense] = useState(null);
  const [historyExpense, setHistoryExpense] = useState(null);

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
    } catch {}
  }, []);

  async function loadUserGroups() {
    try {
      const { data } = await api.get('/api/groups');
      setGroups(data.groups || []);
    } catch {
      // Non-critical
    }
  }

  async function fetchHistory(page = 1, append = false) {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(pagination.limit || 15));

      if (selectedGroupId) params.set('groupId', selectedGroupId);
      if (selectedCategory) params.set('category', selectedCategory);
      if (searchQuery.trim()) params.set('search', searchQuery.trim());

      const { data } = await api.get(`/api/history?${params.toString()}`);

      if (append) {
        setTransactions((prev) => [...prev, ...(data.transactions || [])]);
      } else {
        setTransactions(data.transactions || []);
      }

      setPagination(data.pagination || { page: 1, limit: 15, total: 0, totalPages: 1, hasMore: false });
      setSummary(data.summary || { totalCount: 0, userTotalPaid: 0, userTotalShare: 0 });
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load transaction history');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUserGroups();
  }, []);

  useEffect(() => {
    fetchHistory(1, false);
  }, [selectedGroupId, selectedCategory]);

  function handleSearchSubmit(e) {
    e.preventDefault();
    fetchHistory(1, false);
  }

  function handleClearFilters() {
    setSelectedGroupId('');
    setSelectedCategory('');
    setSearchQuery('');
    setTimeout(() => {
      fetchHistory(1, false);
    }, 0);
  }

  function handleLoadMore() {
    if (pagination.hasMore && !loading) {
      fetchHistory(pagination.page + 1, true);
    }
  }

  const hasActiveFilters = Boolean(selectedGroupId || selectedCategory || searchQuery.trim());

  return (
    <div className="history-page-container" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
      {/* ── Page Header ── */}
      <div className="page-header">
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>🕒</span>
            <span>Transaction History</span>
          </h1>
          <p>
            Audit and track all logged expenses across groups you belong to
          </p>
        </div>

        <div className="header-actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => fetchHistory(1, false)}
            disabled={loading}
            title="Refresh history"
          >
            ↻ Refresh
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => navigate('/dashboard')}
          >
            Back to Dashboard
          </button>
        </div>
      </div>

      {/* ── Error Banner ── */}
      {error && (
        <div className="error-text" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{error}</span>
          <button
            type="button"
            onClick={() => fetchHistory(pagination.page, false)}
            style={{ fontWeight: 600, color: 'var(--danger-text)', textDecoration: 'underline' }}
          >
            Retry
          </button>
        </div>
      )}

      {/* ── Filters & Search Controls ── */}
      <div
        className="card"
        style={{
          padding: 'var(--space-4)',
          gap: 'var(--space-3)',
          backgroundColor: 'var(--bg-surface)',
        }}
      >
        <form
          onSubmit={handleSearchSubmit}
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))',
            gap: 'var(--space-3)',
            alignItems: 'end',
          }}
        >
          {/* Search Input */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Search Description
            </label>
            <input
              type="text"
              placeholder="e.g. Dinner, Grocery, Taxi..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ height: '36px' }}
            />
          </div>

          {/* Group Filter */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Group
            </label>
            <select
              value={selectedGroupId}
              onChange={(e) => setSelectedGroupId(e.target.value)}
              style={{ height: '36px' }}
            >
              <option value="">All My Groups</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>

          {/* Category Filter */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Category
            </label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              style={{ height: '36px' }}
            >
              <option value="">All Categories</option>
              <option value="Food">Food</option>
              <option value="Grocery">Grocery</option>
              <option value="Rent">Rent</option>
              <option value="Utilities">Utilities</option>
              <option value="Travel">Travel</option>
              <option value="Entertainment">Entertainment</option>
              <option value="Shopping">Shopping</option>
              <option value="Health">Health</option>
              <option value="Other">Other</option>
            </select>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="submit"
              className="btn-primary"
              style={{ flex: 1, height: '36px' }}
              disabled={loading}
            >
              Filter
            </button>
            {hasActiveFilters && (
              <button
                type="button"
                className="btn-secondary"
                style={{ height: '36px', padding: '0 12px' }}
                onClick={handleClearFilters}
              >
                Clear
              </button>
            )}
          </div>
        </form>
      </div>

      {/* ── Summary Metrics Bar (if available) ── */}
      {summary.totalCount > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))',
            gap: 'var(--space-3)',
          }}
        >
          <div className="card" style={{ padding: 'var(--space-3) var(--space-4)', gap: '2px' }}>
            <span style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>Matching Transactions</span>
            <strong style={{ fontSize: '18px', color: 'var(--text-primary)' }}>{summary.totalCount}</strong>
          </div>
          <div className="card" style={{ padding: 'var(--space-3) var(--space-4)', gap: '2px' }}>
            <span style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>Total Paid by You</span>
            <strong style={{ fontSize: '18px', color: 'var(--success)' }}>
              ₹{summary.userTotalPaid.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </strong>
          </div>
          <div className="card" style={{ padding: 'var(--space-3) var(--space-4)', gap: '2px' }}>
            <span style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>Your Total Expense Share</span>
            <strong style={{ fontSize: '18px', color: 'var(--text-primary)' }}>
              ₹{summary.userTotalShare.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </strong>
          </div>
        </div>
      )}

      {/* ── Transaction Cards / List View (Mobile-First, No Horizontal Scroll Table) ── */}
      {loading && transactions.length === 0 ? (
        /* Loading Skeletons */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {[1, 2, 3, 4].map((n) => (
            <div
              key={n}
              className="card"
              style={{
                padding: 'var(--space-4)',
                minHeight: '100px',
                justifyContent: 'center',
                backgroundColor: 'var(--bg-surface)',
              }}
            >
              <div style={{ color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center' }}>
                Loading transaction history…
              </div>
            </div>
          ))}
        </div>
      ) : transactions.length === 0 ? (
        /* Empty States */
        <div
          className="card"
          style={{
            textAlign: 'center',
            padding: 'var(--space-10) var(--space-4)',
            gap: 'var(--space-3)',
            alignItems: 'center',
          }}
        >
          <div style={{ fontSize: '36px' }}>{hasActiveFilters ? '🔍' : '🧾'}</div>
          <h2 style={{ margin: 0 }}>
            {hasActiveFilters ? 'No matching transactions found' : 'No transactions yet'}
          </h2>
          <p style={{ maxWidth: '380px', margin: 0, color: 'var(--text-secondary)' }}>
            {hasActiveFilters
              ? 'No records match your active search or filter criteria. Try clearing filters.'
              : 'Transactions logged in your groups will appear here chronologically with full participant splits.'}
          </p>
          {hasActiveFilters ? (
            <button
              type="button"
              className="btn-secondary"
              onClick={handleClearFilters}
              style={{ marginTop: 'var(--space-2)' }}
            >
              Clear All Filters
            </button>
          ) : (
            <button
              type="button"
              className="btn-primary"
              onClick={() => navigate('/dashboard')}
              style={{ marginTop: 'var(--space-2)' }}
            >
              Go to Dashboard
            </button>
          )}
        </div>
      ) : (
        /* Populated Transactions List */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {transactions.map((tx) => {
            const isExpanded = expandedTxId === tx.id;
            const isDeleted = Boolean(tx.isDeleted);
            const isEdited = !isDeleted && Boolean(tx.isEdited);
            const isUserPayer = Boolean(tx.payer?.isYou);
            const hasAuditHistory = Boolean(isDeleted || tx.isEdited || (tx.editHistory && tx.editHistory.length > 0));
            const formattedDate = new Date(tx.date || tx.createdAt).toLocaleDateString(undefined, {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            });

            return (
              <div
                key={tx.id}
                className="card"
                style={{
                  padding: 'var(--space-4)',
                  gap: 'var(--space-3)',
                  backgroundColor: isDeleted ? 'var(--bg-subtle)' : 'var(--bg-surface)',
                  border: isDeleted ? '1px dashed var(--danger-border)' : '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  opacity: isDeleted ? 0.85 : 1,
                  transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
                }}
              >
                {/* ── Card Header: Group Badge & Date ── */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    <Link
                      to={`/groups/${tx.group.id}`}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontSize: '12px',
                        fontWeight: 600,
                        color: 'var(--accent-primary)',
                        backgroundColor: 'var(--bg-subtle)',
                        padding: '2px 8px',
                        borderRadius: 'var(--radius-full)',
                        border: '1px solid var(--border-subtle)',
                      }}
                    >
                      <span>👥</span>
                      <span>{tx.group.name}</span>
                    </Link>

                    <span className="category-tag" style={isDeleted ? { opacity: 0.7 } : {}}>{tx.category}</span>

                    {isDeleted ? (
                      <button
                        type="button"
                        className="admin-pill"
                        style={{
                          fontSize: '10.5px',
                          padding: '1px 6px',
                          background: 'var(--danger-bg)',
                          color: 'var(--danger-text)',
                          borderColor: 'var(--danger-border)',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                        onClick={() => setHistoryExpense(tx)}
                        title="Click to view deletion audit details"
                      >
                        DELETED 🗑️
                      </button>
                    ) : isEdited ? (
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
                        onClick={() => setHistoryExpense(tx)}
                        title="Click to view edit history"
                      >
                        Edited 📝
                      </button>
                    ) : null}

                    {tx.concerns && tx.concerns.length > 0 && (
                      <button
                        type="button"
                        className="admin-pill"
                        style={{
                          fontSize: '10.5px',
                          padding: '1px 6px',
                          background: tx.concerns.some((c) => c.status === 'pending') ? 'var(--warning-bg)' : 'var(--success-bg)',
                          color: tx.concerns.some((c) => c.status === 'pending') ? 'var(--warning-text)' : 'var(--success-text)',
                          borderColor: tx.concerns.some((c) => c.status === 'pending') ? 'var(--warning-border)' : 'var(--success-border)',
                          cursor: 'pointer',
                        }}
                        onClick={() => setConcernExpense(tx)}
                        title="Click to view flags and concerns on this transaction"
                      >
                        🚩 {tx.concerns.some((c) => c.status === 'pending') ? `${tx.concerns.filter((c) => c.status === 'pending').length} Flagged` : 'Resolved'}
                      </button>
                    )}
                  </div>

                  <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                    {formattedDate} {isDeleted ? '• (Voided)' : ''}
                  </span>
                </div>

                {/* ── Transaction Main Row: Description & Amount ── */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h3
                      style={{
                        fontSize: '15px',
                        fontWeight: 600,
                        color: isDeleted ? 'var(--text-muted)' : 'var(--text-primary)',
                        textDecoration: isDeleted ? 'line-through' : 'none',
                        margin: 0,
                        wordBreak: 'break-word',
                      }}
                    >
                      {tx.description || tx.category}
                    </h3>

                    <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                      Paid by{' '}
                      <strong>
                        {tx.payer.isYou ? 'You' : tx.payer.name}
                      </strong>
                    </div>
                  </div>

                  {/* Total Transaction Amount */}
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div
                      style={{
                        fontSize: '18px',
                        fontWeight: 700,
                        color: isDeleted ? 'var(--danger-text)' : 'var(--text-primary)',
                        textDecoration: isDeleted ? 'line-through' : 'none',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      ₹{tx.amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <span style={{ fontSize: '11px', color: isDeleted ? 'var(--danger-text)' : 'var(--text-muted)', fontWeight: isDeleted ? 600 : 400 }}>
                      {isDeleted ? 'Previous Amount (Voided)' : 'Total Expense'}
                    </span>
                  </div>
                </div>

                {/* ── User Share & Impact Pill ── */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px 12px',
                    backgroundColor: isDeleted ? 'var(--danger-bg)' : 'var(--bg-subtle)',
                    borderRadius: 'var(--radius-sm)',
                    border: isDeleted ? '1px solid var(--danger-border)' : '1px solid var(--border-subtle)',
                    flexWrap: 'wrap',
                    gap: 'var(--space-2)',
                  }}
                >
                  <div style={{ fontSize: '12.5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ color: isDeleted ? 'var(--danger-text)' : 'var(--text-secondary)' }}>
                      {isDeleted ? 'Original Split Share:' : 'Your Split Share:'}
                    </span>
                    <strong style={{ fontVariantNumeric: 'tabular-nums', color: isDeleted ? 'var(--danger-text)' : 'var(--text-primary)', textDecoration: isDeleted ? 'line-through' : 'none' }}>
                      ₹{(tx.originalUserShare !== undefined ? tx.originalUserShare : tx.userShare).toFixed(2)}
                    </strong>
                  </div>

                  <div style={{ fontSize: '12.5px' }}>
                    {isDeleted ? (
                      <span style={{ color: 'var(--danger-text)', fontWeight: 600 }}>
                        ₹0.00 (Transaction Deleted/Voided)
                      </span>
                    ) : tx.payer.isYou ? (
                      <span style={{ color: 'var(--success)', fontWeight: 600 }}>
                        +₹{tx.userNet.toFixed(2)} (you get back)
                      </span>
                    ) : tx.userShare > 0 ? (
                      <span style={{ color: 'var(--danger)', fontWeight: 600 }}>
                        -₹{tx.userShare.toFixed(2)} (you owe)
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>
                        ₹0.00 (not in split)
                      </span>
                    )}
                  </div>
                </div>

                {/* ── Actions Row: Toggle Splits, Flag Concern, Audit Trail, and Open Group ── */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '2px', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn-ghost"
                      style={{
                        height: '28px',
                        fontSize: '12px',
                        padding: '0 6px',
                        color: 'var(--text-secondary)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                      onClick={() => setExpandedTxId(isExpanded ? null : tx.id)}
                      aria-expanded={isExpanded}
                    >
                      <span>{isExpanded ? '▲ Hide' : '▼ View'} Splits ({tx.participants.length})</span>
                    </button>

                    {hasAuditHistory && (
                      <button
                        type="button"
                        className="btn-ghost"
                        style={{
                          height: '28px',
                          fontSize: '12px',
                          padding: '0 8px',
                          color: isDeleted ? 'var(--danger-text)' : 'var(--accent-primary)',
                          borderColor: isDeleted ? 'var(--danger-border)' : 'var(--border-subtle)',
                          background: isDeleted ? 'var(--danger-bg)' : 'var(--bg-subtle)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                        onClick={() => setHistoryExpense(tx)}
                        title="View complete audit logs and previous states"
                      >
                        <span>📜</span>
                        <span>Audit Trail</span>
                      </button>
                    )}

                    {!isDeleted && (
                      !isUserPayer ? (
                        <button
                          type="button"
                          className="btn-ghost"
                          style={{
                            height: '28px',
                            fontSize: '12px',
                            padding: '0 8px',
                            color: (tx.concerns && tx.concerns.length > 0) ? 'var(--warning-text)' : 'var(--text-secondary)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            borderColor: (tx.concerns && tx.concerns.length > 0) ? 'var(--warning-border)' : 'transparent',
                            background: (tx.concerns && tx.concerns.length > 0) ? 'var(--warning-bg)' : 'transparent',
                          }}
                          onClick={() => setConcernExpense(tx)}
                          title="Flag or view concerns on this transaction"
                        >
                          <span>🚩</span>
                          <span>{tx.concerns && tx.concerns.length > 0 ? `Concerns (${tx.concerns.length})` : 'Flag'}</span>
                        </button>
                      ) : (tx.concerns && tx.concerns.length > 0) ? (
                        <button
                          type="button"
                          className="btn-ghost"
                          style={{
                            height: '28px',
                            fontSize: '12px',
                            padding: '0 8px',
                            color: 'var(--warning-text)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            borderColor: 'var(--warning-border)',
                            background: 'var(--warning-bg)',
                          }}
                          onClick={() => setConcernExpense(tx)}
                          title="View and respond to concerns raised by group members"
                        >
                          <span>🚩</span>
                          <span>Concerns ({tx.concerns.length})</span>
                        </button>
                      ) : null
                    )}
                  </div>

                  <Link
                    to={`/groups/${tx.group.id}`}
                    className="btn-ghost"
                    style={{ height: '28px', fontSize: '12px', padding: '0 6px', color: 'var(--accent-primary)' }}
                  >
                    Open Group ➔
                  </Link>
                </div>

                {/* ── Expanded Participants Split Details ── */}
                {isExpanded && (
                  <div
                    style={{
                      marginTop: '4px',
                      padding: 'var(--space-3)',
                      backgroundColor: 'var(--bg-app)',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border-subtle)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px',
                    }}
                  >
                    <span style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Participant Breakdown
                    </span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {tx.participants.map((p) => (
                        <div
                          key={p.userId}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            fontSize: '12.5px',
                            padding: '4px 0',
                            borderBottom: '1px dashed var(--border-subtle)',
                          }}
                        >
                          <span style={{ color: 'var(--text-primary)' }}>
                            {p.name} {p.isYou ? <span className="you-pill" style={{ marginLeft: '4px' }}>You</span> : null}
                          </span>
                          <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                            ₹{p.share.toFixed(2)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* ── Scalable Pagination / Load More Controls ── */}
          {pagination.totalPages > 1 && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                gap: 'var(--space-3)',
                padding: 'var(--space-4) 0',
                flexWrap: 'wrap',
              }}
            >
              {pagination.hasMore && (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleLoadMore}
                  disabled={loading}
                  style={{ minWidth: '160px', height: '40px' }}
                >
                  {loading ? 'Loading…' : 'Load More Transactions'}
                </button>
              )}

              <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                Showing page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
              </span>
            </div>
          )}
        </div>
      )}

      {/* ── Expense History Audit Modal ── */}
      {historyExpense && (
        <ExpenseHistoryModal
          groupId={historyExpense.group?.id || selectedGroupId}
          expense={historyExpense}
          onClose={() => setHistoryExpense(null)}
        />
      )}

      {/* ── Transaction Concern / Flag Modal ── */}
      {concernExpense && (
        <TransactionConcernModal
          groupId={concernExpense.group?.id || selectedGroupId}
          expense={concernExpense}
          currentUserId={currentUserId}
          onClose={() => setConcernExpense(null)}
          onConcernUpdated={() => {
            fetchHistory(pagination.page, false);
          }}
        />
      )}
    </div>
  );
}
