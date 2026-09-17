import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import EditExpenseModal from '../components/EditExpenseModal';
import ExpenseHistoryModal from '../components/ExpenseHistoryModal';
import LogExpenseFABModal from '../components/LogExpenseFABModal';
import ShareModal from '../components/ShareModal';
import ShoppingListSection from '../components/ShoppingListSection';
import TransactionConcernModal from '../components/TransactionConcernModal';
import TransactionDetailModal from '../components/TransactionDetailModal';
import api from '../lib/api';

export default function GroupDetailPage() {
  const { groupId } = useParams();
  const navigate = useNavigate();

  const [group, setGroup] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [showShare, setShowShare] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showFABModal, setShowFABModal] = useState(false);
  const [currentUserId, setCurrentUserId] = useState(null);

  // Group Delete / Leave Confirmation States
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deletingGroup, setDeletingGroup] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [leavingGroup, setLeavingGroup] = useState(false);

  // Modals for Transactions
  const [detailExpense, setDetailExpense] = useState(null);
  const [editingExpense, setEditingExpense] = useState(null);
  const [historyExpense, setHistoryExpense] = useState(null);
  const [concernExpense, setConcernExpense] = useState(null);
  const [deletingExpense, setDeletingExpense] = useState(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [isDeletingExpense, setIsDeletingExpense] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const members = useMemo(() => group?.members?.map((m) => m.user) || [], [group]);
  const isAdmin = !!group?.isAdmin;

  useEffect(() => {
    const userStr = localStorage.getItem('splitup_user');
    if (userStr) {
      try {
        const u = JSON.parse(userStr);
        if (u.id) setCurrentUserId(u.id);
      } catch {}
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
    } catch (apiError) {
      setError(apiError.response?.data?.message || 'Failed to load group');
    }
  }

  useEffect(() => {
    loadGroupData();
  }, [groupId]);

  async function handleDeleteExpenseConfirm() {
    if (!deletingExpense) return;
    setIsDeletingExpense(true);
    setDeleteError('');
    try {
      await api.delete(`/api/groups/${groupId}/expenses/${deletingExpense.id}`, {
        data: { reason: deleteReason || 'Accidental duplicate / errant transaction deleted by creator' },
      });
      setMessage('Transaction deleted successfully.');
      setDeletingExpense(null);
      setDeleteReason('');
      loadGroupData();
    } catch (err) {
      setDeleteError(err.response?.data?.message || 'Failed to delete transaction');
    } finally {
      setIsDeletingExpense(false);
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

  const totalGroupSpent = useMemo(() => {
    return expenses.reduce((sum, e) => {
      if (e.isDeleted) return sum;
      return sum + (Number(e.amount) || 0);
    }, 0);
  }, [expenses]);

  const userGroupNet = useMemo(() => {
    if (!currentUserId) return 0;
    return expenses.reduce((net, exp) => {
      if (exp.isDeleted) return net;
      const isPayer = exp.paidById === currentUserId || exp.paidBy?.id === currentUserId;
      const mySplit = exp.splits?.find((s) => s.userId === currentUserId || s.user?.id === currentUserId);
      const paid = isPayer ? Number(exp.amount) || 0 : 0;
      const share = mySplit ? Number(mySplit.share) || 0 : 0;
      return net + (paid - share);
    }, 0);
  }, [expenses, currentUserId]);

  return (
    <div className="group-detail-view" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', width: '100%', position: 'relative', paddingBottom: '90px' }}>
      {/* ── Subheader Bar (Matching Wireframe Image 2) ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
        <Link
          to="/dashboard"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '18px',
            fontWeight: 800,
            color: 'var(--text-primary)',
            textDecoration: 'none',
          }}
        >
          <span>&lt;</span>
          <span>{group?.name || 'Group'}</span>
        </Link>

        {/* ── More Action Icons / Dropdown ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', position: 'relative' }}>
          <button
            type="button"
            className="group-more-menu-btn"
            onClick={() => setShowMoreMenu((prev) => !prev)}
            aria-label="More actions"
            title="More group options"
            style={{
              width: '36px',
              height: '36px',
              borderRadius: 'var(--radius-full)',
              background: 'var(--bg-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '18px',
              fontWeight: 800,
              color: 'var(--text-primary)',
            }}
          >
            •••
          </button>

          {showMoreMenu && (
            <div
              className="card group-more-dropdown"
              style={{
                position: 'absolute',
                top: '42px',
                right: 0,
                padding: '6px',
                zIndex: 60,
                boxShadow: 'var(--shadow-modal)',
                borderRadius: 'var(--radius-md)',
                minWidth: '180px',
                background: 'var(--bg-surface)',
                display: 'flex',
                flexDirection: 'column',
                gap: '2px',
              }}
            >
              <Link
                to={`/analytics?scope=group&groupId=${groupId}`}
                className="sidebar-nav-item"
                style={{ padding: '8px 12px', fontSize: '13px' }}
                onClick={() => setShowMoreMenu(false)}
              >
                <span>📈</span>
                <span>Analytics</span>
              </Link>
              <button
                type="button"
                className="sidebar-nav-item"
                style={{ padding: '8px 12px', fontSize: '13px', width: '100%', textAlign: 'left' }}
                onClick={() => {
                  setShowMoreMenu(false);
                  setShowShare(true);
                }}
              >
                <span>👤+</span>
                <span>Invite Members</span>
              </button>
              {isAdmin ? (
                <button
                  type="button"
                  className="sidebar-nav-item"
                  style={{ padding: '8px 12px', fontSize: '13px', width: '100%', textAlign: 'left', color: 'var(--danger)' }}
                  onClick={() => {
                    setShowMoreMenu(false);
                    setConfirmDelete(true);
                  }}
                >
                  <span>🗑️</span>
                  <span>Delete Group</span>
                </button>
              ) : (
                <button
                  type="button"
                  className="sidebar-nav-item"
                  style={{ padding: '8px 12px', fontSize: '13px', width: '100%', textAlign: 'left', color: 'var(--danger)' }}
                  onClick={() => {
                    setShowMoreMenu(false);
                    setConfirmLeave(true);
                  }}
                >
                  <span>🚪</span>
                  <span>Leave Group</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {error && <div className="error-text">{error}</div>}
      {message && <div className="success-text">{message}</div>}

      {/* ── Top Summary 2-in-1 Card (Matching Wireframe Image 2) ── */}
      <div
        className="card group-summary-2in1-card"
        style={{
          borderRadius: 'var(--radius-xl)',
          padding: 'var(--space-6)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-4)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 'var(--space-4)',
          }}
        >
          {/* Left: Your balance */}
          <div style={{ flex: 1, minWidth: '120px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Your balance:
            </span>
            <span
              style={{
                fontSize: '20px',
                fontWeight: 800,
                letterSpacing: '-0.02em',
                fontFamily: 'var(--font-sans)',
                color: userGroupNet > 0 ? 'var(--success)' : userGroupNet < 0 ? 'var(--danger)' : 'var(--text-primary)',
              }}
            >
              {userGroupNet > 0 ? '+' : userGroupNet < 0 ? '-' : ''}₹{Math.abs(userGroupNet).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>

          {/* Vertical Divider */}
          <div style={{ width: '1px', height: '40px', background: 'var(--border-subtle)' }} />

          {/* Right: Net Spent */}
          <div style={{ flex: 1, minWidth: '120px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Net Spent:
            </span>
            <span
              style={{
                fontSize: '20px',
                fontWeight: 800,
                letterSpacing: '-0.02em',
                fontFamily: 'var(--font-sans)',
                color: 'var(--text-primary)',
              }}
            >
              ₹{totalGroupSpent.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        {/* Bottom Settle Up Button */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 'var(--space-2)' }}>
          <Link
            to={`/groups/${groupId}/balances`}
            className="btn-primary"
            style={{
              padding: '6px 16px',
              fontSize: '13px',
              fontWeight: 700,
              borderRadius: 'var(--radius-full)',
              background: 'var(--accent-primary)',
              color: '#ffffff',
            }}
          >
            Settle Up ➔
          </Link>
        </div>
      </div>

      {/* ── Section 1: Shopping list: (Matching Wireframe Image 2) ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)' }}>
          Shopping list:
        </h2>
        {group && (
          <ShoppingListSection
            groupId={groupId}
            members={members}
            currentUserId={currentUserId}
            onExpenseCreated={loadGroupData}
          />
        )}
      </div>

      {/* ── Section 2: Transaction History: (Matching Wireframe Image 2) ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)' }}>
            Transaction History:
          </h2>
          <span style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>
            {expenses.length} {expenses.length === 1 ? 'record' : 'records'}
          </span>
        </div>

        {expenses.length === 0 ? (
          <div className="card" style={{ padding: 'var(--space-8) var(--space-4)', textAlign: 'center', color: 'var(--text-muted)' }}>
            <p>No transactions logged in this group yet.</p>
            <button
              type="button"
              className="btn-primary"
              onClick={() => setShowFABModal(true)}
              style={{ marginTop: '8px' }}
            >
              + Log the first transaction
            </button>
          </div>
        ) : (
          <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table className="ledger-table">
                <thead>
                  <tr>
                    <th>Description</th>
                    <th>Category</th>
                    <th>Paid By</th>
                    <th>Your Share</th>
                    <th>Total</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.map((expense) => {
                    const isPayer = expense.paidBy?.id === currentUserId || expense.paidById === currentUserId;
                    const isDeleted = Boolean(expense.isDeleted);
                    const mySplit = expense.splits?.find((s) => s.userId === currentUserId || s.user?.id === currentUserId);
                    const isEdited = !isDeleted && (expense.isEdited || (expense.editHistory && expense.editHistory.length > 0));
                    const hasConcerns = expense.concerns && expense.concerns.length > 0;
                    const hasPendingConcern = hasConcerns && expense.concerns.some((c) => c.status === 'pending');
                    const formattedDate = expense.createdAt
                      ? new Date(expense.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                      : '';

                    return (
                      <tr
                        key={expense.id}
                        onClick={() => setDetailExpense(expense)}
                        style={{
                          cursor: 'pointer',
                          ...(isDeleted ? { opacity: 0.65, backgroundColor: 'var(--bg-subtle)' } : {}),
                        }}
                        title="Click to view full transaction details"
                      >
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            <strong
                              style={{
                                color: isDeleted ? 'var(--text-muted)' : 'var(--text-primary)',
                                textDecoration: isDeleted ? 'line-through' : 'none',
                                maxWidth: '180px',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                display: 'inline-block',
                                verticalAlign: 'middle',
                              }}
                              title={expense.description || expense.category}
                            >
                              {expense.description || expense.category}
                            </strong>
                            {isDeleted && (
                              <button
                                type="button"
                                className="admin-pill"
                                style={{
                                  fontSize: '10.5px',
                                  padding: '1px 6px',
                                  background: 'var(--danger-bg)',
                                  color: 'var(--danger-text)',
                                  borderColor: 'var(--danger-border)',
                                  cursor: 'pointer',
                                  fontWeight: 700,
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setHistoryExpense(expense);
                                }}
                                title="Click to view deletion audit history"
                              >
                                Deleted 🗑️
                              </button>
                            )}
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
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setHistoryExpense(expense);
                                }}
                                title="Click to view edit history"
                              >
                                Edited 📝
                              </button>
                            )}
                            {hasConcerns && (
                              <button
                                type="button"
                                className="admin-pill"
                                style={{
                                  fontSize: '10.5px',
                                  padding: '1px 6px',
                                  background: hasPendingConcern ? 'var(--warning-bg)' : 'var(--success-bg)',
                                  color: hasPendingConcern ? 'var(--warning-text)' : 'var(--success-text)',
                                  borderColor: hasPendingConcern ? 'var(--warning-border)' : 'var(--success-border)',
                                  cursor: 'pointer',
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setConcernExpense(expense);
                                }}
                                title="Click to view transaction concerns & flags"
                              >
                                🚩 {hasPendingConcern ? `${expense.concerns.filter((c) => c.status === 'pending').length} Flagged` : 'Resolved'}
                              </button>
                            )}
                          </div>
                          {formattedDate && (
                            <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '2px' }}>
                              {formattedDate} {isDeleted ? '• (Voided)' : ''}
                            </div>
                          )}
                        </td>
                        <td>
                          <span className="category-tag">{expense.category}</span>
                        </td>
                        <td>
                          <span style={{ fontWeight: isPayer ? 700 : 400 }}>
                            {isPayer ? 'You' : expense.paidBy?.name || 'Someone'}
                          </span>
                        </td>
                        <td>
                          {isDeleted ? (
                            <span style={{ color: 'var(--text-muted)', textDecoration: 'line-through' }}>
                              ₹{mySplit ? Number(mySplit.share).toFixed(2) : '0.00'}
                            </span>
                          ) : mySplit ? (
                            <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                              ₹{Number(mySplit.share).toFixed(2)}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--text-muted)' }}>Excluded</span>
                          )}
                        </td>
                        <td>
                          <strong style={{ fontVariantNumeric: 'tabular-nums', color: isDeleted ? 'var(--danger-text)' : 'var(--text-primary)', textDecoration: isDeleted ? 'line-through' : 'none' }}>
                            ₹{Number(expense.amount).toFixed(2)}
                          </strong>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', alignItems: 'center' }}>
                            {isDeleted ? (
                              <button
                                type="button"
                                className="btn-ghost"
                                style={{ height: '26px', fontSize: '11.5px', padding: '0 8px', color: 'var(--danger-text)', background: 'var(--danger-bg)' }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setHistoryExpense(expense);
                                }}
                              >
                                📜 Audit
                              </button>
                            ) : (
                              <>
                                {!isEdited && isPayer && (
                                  <button
                                    type="button"
                                    className="btn-secondary"
                                    style={{ height: '26px', fontSize: '11.5px', padding: '0 8px' }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingExpense(expense);
                                    }}
                                  >
                                    Edit
                                  </button>
                                )}
                                {isEdited && (
                                  <button
                                    type="button"
                                    className="btn-ghost"
                                    style={{ height: '26px', fontSize: '11.5px', padding: '0 8px', background: 'var(--bg-subtle)' }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setHistoryExpense(expense);
                                    }}
                                  >
                                    📜 History
                                  </button>
                                )}

                                {/* Delete by creator only */}
                                {isPayer && (
                                  <button
                                    type="button"
                                    className="btn-danger"
                                    style={{ height: '26px', fontSize: '11.5px', padding: '0 8px' }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setDeletingExpense(expense);
                                    }}
                                    title="Delete accidental duplicate"
                                  >
                                    Delete
                                  </button>
                                )}

                                {/* Non-payers can raise concern flag */}
                                {!isPayer && (
                                  <button
                                    type="button"
                                    className="btn-ghost"
                                    style={{ height: '26px', fontSize: '11.5px', padding: '0 6px', color: 'var(--text-muted)' }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setConcernExpense(expense);
                                    }}
                                    title="Flag concern or discrepancy"
                                  >
                                    🚩
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── Floating Action Button [+] (Matching Wireframe Image 2) ── */}
      <button
        type="button"
        className="fab-btn"
        onClick={() => setShowFABModal(true)}
        aria-label="Log a transaction or Parse with AI"
        title="Log a transaction / Parse with AI"
      >
        <span className="fab-icon">+</span>
      </button>

      {/* ── Log Expense & AI Parse FAB Modal (Matching Wireframe Image 3/4) ── */}
      <LogExpenseFABModal
        isOpen={showFABModal}
        onClose={() => setShowFABModal(false)}
        groupId={groupId}
        groupName={group?.name}
        members={members}
        onExpenseAdded={loadGroupData}
      />

      {/* ── Transaction Detail Modal ── */}
      {detailExpense && (
        <TransactionDetailModal
          expense={detailExpense}
          group={group}
          members={members}
          currentUserId={currentUserId}
          onClose={() => setDetailExpense(null)}
          onEdit={(exp) => setEditingExpense(exp)}
          onFlag={(exp) => setConcernExpense(exp)}
          onDelete={(exp) => setDeletingExpense(exp)}
          onHistory={(exp) => setHistoryExpense(exp)}
        />
      )}

      {/* ── Edit Expense Modal ── */}
      {editingExpense && (
        <EditExpenseModal
          groupId={groupId}
          expense={editingExpense}
          members={members}
          currentUserId={currentUserId}
          onClose={() => setEditingExpense(null)}
          onUpdated={() => {
            setEditingExpense(null);
            loadGroupData();
          }}
        />
      )}

      {/* ── Expense History Audit Modal ── */}
      {historyExpense && (
        <ExpenseHistoryModal
          expense={historyExpense}
          onClose={() => setHistoryExpense(null)}
        />
      )}

      {/* ── Concern Modal ── */}
      {concernExpense && (
        <TransactionConcernModal
          groupId={groupId}
          expense={concernExpense}
          currentUserId={currentUserId}
          onClose={() => setConcernExpense(null)}
          onUpdated={() => {
            setConcernExpense(null);
            loadGroupData();
          }}
        />
      )}

      {/* ── Share Modal ── */}
      {showShare && group && (
        <ShareModal
          group={group}
          onClose={() => setShowShare(false)}
        />
      )}

      {/* ── Delete Expense Modal ── */}
      {deletingExpense && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setDeletingExpense(null); }}>
          <div className="modal-box" style={{ maxWidth: '440px' }}>
            <button className="modal-close" onClick={() => setDeletingExpense(null)}>✕</button>
            <h2 className="card-title">Delete Transaction</h2>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              Are you sure you want to delete <strong>{deletingExpense.description || deletingExpense.category}</strong> (₹{Number(deletingExpense.amount).toFixed(2)})?
            </p>
            {deleteError && <div className="error-text">{deleteError}</div>}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: 'var(--space-2)' }}>
              <button type="button" className="btn-secondary" onClick={() => setDeletingExpense(null)}>Cancel</button>
              <button type="button" className="btn-danger" onClick={handleDeleteExpenseConfirm} disabled={isDeletingExpense}>
                {isDeletingExpense ? 'Deleting…' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Group Modal ── */}
      {confirmDelete && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setConfirmDelete(false); }}>
          <div className="modal-box" style={{ maxWidth: '420px' }}>
            <button className="modal-close" onClick={() => setConfirmDelete(false)}>✕</button>
            <h2 className="card-title">Delete Group</h2>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              This will permanently remove the group, its expenses, and settlements.
            </p>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: 'var(--space-2)' }}>
              <button type="button" className="btn-secondary" onClick={() => setConfirmDelete(false)}>Cancel</button>
              <button type="button" className="btn-danger" onClick={handleDeleteGroup} disabled={deletingGroup}>
                {deletingGroup ? 'Deleting…' : 'Delete Group'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Leave Group Modal ── */}
      {confirmLeave && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setConfirmLeave(false); }}>
          <div className="modal-box" style={{ maxWidth: '420px' }}>
            <button className="modal-close" onClick={() => setConfirmLeave(false)}>✕</button>
            <h2 className="card-title">Leave Group</h2>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              Are you sure you want to leave this group?
            </p>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: 'var(--space-2)' }}>
              <button type="button" className="btn-secondary" onClick={() => setConfirmLeave(false)}>Cancel</button>
              <button type="button" className="btn-danger" onClick={handleLeaveGroup} disabled={leavingGroup}>
                {leavingGroup ? 'Leaving…' : 'Leave Group'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
