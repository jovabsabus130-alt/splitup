import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AIExpenseAnalysisModal from '../components/AIExpenseAnalysisModal';
import NotificationsModal from '../components/NotificationsModal';
import api from '../lib/api';

export default function DashboardPage() {
  const navigate = useNavigate();
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [showOverviewModal, setShowOverviewModal] = useState(false);
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);
  const [showAIAnalysisModal, setShowAIAnalysisModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [creating, setCreating] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  async function loadDashboardData() {
    try {
      const [groupsRes, notifsRes] = await Promise.all([
        api.get('/api/groups'),
        api.get('/api/notifications').catch(() => ({ data: { unreadCount: 0 } })),
      ]);
      setGroups(groupsRes.data.groups || []);
      setUnreadNotifications(notifsRes.data.unreadCount || 0);
    } catch (apiError) {
      setError(apiError.response?.data?.message || 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDashboardData();
  }, []);

  async function handleCreateGroup(e) {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    setCreating(true);
    setError('');
    setMessage('');
    try {
      const { data } = await api.post('/api/groups', { name: newGroupName.trim() });
      setNewGroupName('');
      setShowCreateModal(false);
      setMessage('Group created successfully!');
      await loadDashboardData();
      if (data.group?.id) {
        navigate(`/groups/${data.group.id}`);
      }
    } catch (apiError) {
      setError(apiError.response?.data?.message || 'Failed to create group');
    } finally {
      setCreating(false);
    }
  }

  async function handleJoinRequest(groupId, requestId, status) {
    setError('');
    setMessage('');
    try {
      await api.patch(`/api/groups/${groupId}/join-requests/${requestId}`, { status });
      setMessage(status === 'approved' ? 'Member approved and added to group!' : 'Request denied.');
      await loadDashboardData();
    } catch (apiError) {
      setError(apiError.response?.data?.message || 'Failed to update request');
    }
  }

  const adminGroupsCount = useMemo(() => groups.filter((g) => g.isAdmin).length, [groups]);

  // Gather all pending requests across all admin groups
  const allPendingRequests = useMemo(() => {
    return groups.flatMap((g) =>
      (g.pendingRequests || []).map((req) => ({ ...req, groupName: g.name, groupId: g.id }))
    );
  }, [groups]);

  const totalBadgesCount = allPendingRequests.length + unreadNotifications;

  return (
    <>
      {/* ── Page Header ── */}
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p>
            Select a group to log expenses or view net balance sheets
          </p>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="btn-secondary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', borderColor: 'rgba(99, 102, 241, 0.4)' }}
            onClick={() => setShowAIAnalysisModal(true)}
            title="Open AI Monthly Spending Analysis"
          >
            <span style={{ fontSize: '14px' }}>✨</span>
            <span>AI Spending Analysis</span>
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => setShowCreateModal(true)}
          >
            + New Group
          </button>
          <button
            type="button"
            className="dashboard-bell-btn"
            onClick={() => setShowNotificationsModal(true)}
            title={totalBadgesCount > 0 ? `${totalBadgesCount} pending notifications & requests` : 'Notifications'}
            aria-label="Notifications & Pending Requests"
          >
            <svg
              className="bell-icon"
              viewBox="0 0 24 24"
            >
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            {totalBadgesCount > 0 && (
              <span className="bell-blue-dot" />
            )}
          </button>
        </div>
      </div>

      {error ? <div className="error-text">{error}</div> : null}
      {message ? <div className="success-text">{message}</div> : null}

      {/* ── Direct Groups View ── */}
      {loading ? (
        <div style={{ padding: 'var(--space-10) 0', textAlign: 'center', color: 'var(--text-secondary)' }}>
          Loading your groups…
        </div>
      ) : groups.length === 0 ? (
        /* ── Empty State: No groups yet ── */
        <div
          className="card"
          style={{
            textAlign: 'center',
            padding: 'var(--space-12) var(--space-6)',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 'var(--space-3)',
          }}
        >
          <div style={{ fontSize: '32px', lineHeight: 1 }}>👥</div>
          <h2>No groups yet</h2>
          <p style={{ maxWidth: '360px' }}>
            You don't belong to any groups yet. Create your first group to start logging expenses and tracking shared balances.
          </p>
          <button
            type="button"
            className="btn-primary"
            onClick={() => setShowCreateModal(true)}
            style={{ marginTop: 'var(--space-2)' }}
          >
            + Create your first group
          </button>
        </div>
      ) : (
        /* ── Groups Grid ── */
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 'var(--space-4)',
          }}
        >
          {groups.map((group) => (
            <div
              key={group.id}
              className="card"
              style={{
                padding: 'var(--space-4)',
                gap: 'var(--space-4)',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
                <div
                  className="group-avatar-mini"
                  style={{
                    width: '34px',
                    height: '34px',
                    fontSize: '14px',
                    borderRadius: 'var(--radius-sm)',
                  }}
                >
                  {group.name.charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '14px' }}>
                      {group.name}
                    </span>
                    {group.isAdmin && (
                      <span className="admin-pill">Admin</span>
                    )}
                  </div>
                  {group.pendingRequestsCount > 0 && (
                    <div style={{ fontSize: '12px', color: 'var(--danger)', fontWeight: 500, marginTop: '2px' }}>
                      {group.pendingRequestsCount} pending {group.pendingRequestsCount === 1 ? 'request' : 'requests'}
                    </div>
                  )}
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  gap: 'var(--space-2)',
                  borderTop: '1px solid var(--border-subtle)',
                  paddingTop: 'var(--space-3)',
                }}
              >
                <Link
                  to={`/groups/${group.id}`}
                  className="btn-primary"
                  style={{ flex: 1, height: '30px', fontSize: '12.5px' }}
                >
                  Open Group
                </Link>
                <Link
                  to={`/groups/${group.id}/balances`}
                  className="btn-secondary"
                  style={{ flex: 1, height: '30px', fontSize: '12.5px' }}
                >
                  Balances
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Quick Create Group Modal ── */}
      {showCreateModal && (
        <div
          className="modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowCreateModal(false);
          }}
        >
          <div className="modal-box" style={{ maxWidth: '400px' }}>
            <button
              className="modal-close"
              onClick={() => setShowCreateModal(false)}
              aria-label="Close modal"
            >
              ✕
            </button>
            <div className="card-header">
              <div>
                <h2 className="card-title">Create Group</h2>
                <div className="card-subtitle">Set up a shared pool for flatmates, trips or projects</div>
              </div>
            </div>
            <form onSubmit={handleCreateGroup} className="form-grid" style={{ gap: 'var(--space-3)' }}>
              <input
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="Group name (e.g. Weekend Trip)"
                autoFocus
                required
              />
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '4px' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowCreateModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={creating || !newGroupName.trim()}
                >
                  {creating ? 'Creating…' : 'Create Group'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Notifications Modal ── */}
      <NotificationsModal
        isOpen={showNotificationsModal}
        onClose={() => setShowNotificationsModal(false)}
        onActionTaken={loadDashboardData}
      />

      {/* ── AI Monthly Expense Analysis Modal ── */}
      {showAIAnalysisModal && (
        <AIExpenseAnalysisModal
          onClose={() => setShowAIAnalysisModal(false)}
        />
      )}

      {/* ── Pending Join Requests (Bell Modal Fallback) ── */}
      {showOverviewModal && (
        <div
          className="modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowOverviewModal(false);
          }}
        >
          <div className="modal-box" style={{ maxWidth: '520px', maxHeight: '88vh', overflowY: 'auto' }}>
            <button
              className="modal-close"
              onClick={() => setShowOverviewModal(false)}
              aria-label="Close modal"
            >
              ✕
            </button>

            <div className="card-header" style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: 'var(--space-3)' }}>
              <div>
                <h2 className="card-title">Activity & Overview</h2>
                <div className="card-subtitle">Summary metrics and pending join requests</div>
              </div>
            </div>

            <div className="summary-balance-bar" style={{ padding: 'var(--space-4)', gap: 'var(--space-4)', gridTemplateColumns: '1fr 1fr' }}>
              <div className="summary-balance-item">
                <span className="summary-balance-label">Total Groups</span>
                <span className="summary-balance-amount neutral" style={{ fontSize: '24px' }}>{groups.length}</span>
                <span className="summary-balance-subtext">{adminGroupsCount} managed as admin</span>
              </div>
              <div className="summary-balance-item">
                <span className="summary-balance-label">Pending Requests</span>
                <span className={`summary-balance-amount ${allPendingRequests.length > 0 ? 'negative' : 'neutral'}`} style={{ fontSize: '24px' }}>
                  {allPendingRequests.length}
                </span>
                <span className="summary-balance-subtext">{allPendingRequests.length > 0 ? 'Requires admin review' : 'All caught up'}</span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <h3 style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text-primary)' }}>
                Pending Join Requests ({allPendingRequests.length})
              </h3>

              {allPendingRequests.length === 0 ? (
                <div
                  style={{
                    textAlign: 'center',
                    padding: '24px 16px',
                    backgroundColor: 'var(--bg-subtle)',
                    borderRadius: 'var(--radius-md)',
                    color: 'var(--text-secondary)',
                    fontSize: '13px',
                  }}
                >
                  ✓ No pending join requests to review.
                </div>
              ) : (
                <ul className="list" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  {allPendingRequests.map((req) => (
                    <li
                      key={req.id}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 'var(--space-3)',
                        padding: '14px',
                        backgroundColor: 'var(--bg-subtle)',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--border-subtle)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
                        <div
                          style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '50%',
                            backgroundColor: 'var(--accent-primary)',
                            color: '#FFFFFF',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 700,
                            fontSize: '14px',
                            flexShrink: 0,
                          }}
                        >
                          {req.user?.name ? req.user.name.charAt(0).toUpperCase() : 'U'}
                        </div>

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)' }}>
                            {req.user?.name || 'User'}
                          </span>
                          <div style={{ fontSize: '12.5px', color: 'var(--text-primary)', marginTop: '4px' }}>
                            Wants to join: <strong style={{ color: 'var(--accent-primary)' }}>{req.groupName}</strong>
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end', paddingTop: '8px', borderTop: '1px solid var(--border-subtle)' }}>
                        <button
                          type="button"
                          className="btn-danger"
                          style={{ height: '30px', fontSize: '12px', padding: '0 12px' }}
                          onClick={() => handleJoinRequest(req.groupId, req.id, 'denied')}
                        >
                          Reject
                        </button>
                        <button
                          type="button"
                          className="btn-primary"
                          style={{ height: '30px', fontSize: '12px', padding: '0 14px' }}
                          onClick={() => handleJoinRequest(req.groupId, req.id, 'approved')}
                        >
                          Accept
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
