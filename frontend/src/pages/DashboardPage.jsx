import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../lib/api';

export default function DashboardPage() {
  const navigate = useNavigate();
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [showOverviewModal, setShowOverviewModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [creating, setCreating] = useState(false);

  async function loadGroups() {
    try {
      const { data } = await api.get('/api/groups');
      setGroups(data.groups || []);
    } catch (apiError) {
      setError(apiError.response?.data?.message || 'Failed to load groups');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadGroups();
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
      await loadGroups();
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
      await loadGroups();
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

  return (
    <>
      {/* ── Page Header ── */}
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1>Dashboard</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '2px' }}>
            Select a group to log expenses or view net balance sheets
          </p>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="btn-primary"
            onClick={() => setShowCreateModal(true)}
            style={{ height: '38px', fontSize: '13px' }}
          >
            + New Group
          </button>
          <button
            type="button"
            className="dashboard-bell-btn"
            onClick={() => setShowOverviewModal(true)}
            title={allPendingRequests.length > 0 ? `${allPendingRequests.length} pending join requests` : 'Notifications (no pending requests)'}
            aria-label="Pending Invites & Requests"
          >
            <svg
              className="bell-icon"
              viewBox="0 0 24 24"
            >
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            {allPendingRequests.length > 0 && (
              <span className="bell-blue-dot" />
            )}
          </button>
        </div>
      </div>

      {error ? <div className="error-text">{error}</div> : null}
      {message ? <div className="success-text">{message}</div> : null}

      {/* ── Direct Groups View ── */}
      {loading ? (
        <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13.5px' }}>
          Loading your groups…
        </div>
      ) : groups.length === 0 ? (
        /* ── Empty State: No groups yet ── */
        <div
          style={{
            textAlign: 'center',
            padding: '64px 24px',
            backgroundColor: '#FFFFFF',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-card)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 'var(--space-3)',
          }}
        >
          <div style={{ fontSize: '40px', lineHeight: 1, marginBottom: '4px' }}>👥</div>
          <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            No groups yet
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13.5px', maxWidth: '360px', margin: 0 }}>
            You don't belong to any groups yet. Create your first group to start logging expenses and tracking shared balances.
          </p>
          <button
            type="button"
            className="btn-primary"
            onClick={() => setShowCreateModal(true)}
            style={{ marginTop: 'var(--space-2)', padding: '0 20px', height: '40px', fontSize: '13.5px' }}
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
              style={{
                backgroundColor: '#FFFFFF',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-lg)',
                padding: 'var(--space-5)',
                boxShadow: 'var(--shadow-card)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: 'var(--space-4)',
                transition: 'transform 0.15s ease, box-shadow 0.15s ease',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
                <div
                  className="group-avatar-mini"
                  style={{
                    width: '38px',
                    height: '38px',
                    fontSize: '15px',
                    fontWeight: 700,
                    backgroundColor: 'var(--bg-subtle)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  {group.name.charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '15px' }}>
                      {group.name}
                    </span>
                    {group.isAdmin && (
                      <span className="admin-pill" style={{ fontSize: '11px' }}>Admin</span>
                    )}
                  </div>
                  {group.pendingRequestsCount > 0 && (
                    <div style={{ fontSize: '12px', color: 'var(--danger)', fontWeight: 600, marginTop: '4px' }}>
                      {group.pendingRequestsCount} pending join {group.pendingRequestsCount === 1 ? 'request' : 'requests'}
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
                  style={{ flex: 1, height: '34px', fontSize: '12.5px', textDecoration: 'none' }}
                >
                  Open Group
                </Link>
                <Link
                  to={`/groups/${group.id}/balances`}
                  className="btn-secondary"
                  style={{ flex: 1, height: '34px', fontSize: '12.5px', textDecoration: 'none' }}
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
                placeholder="e.g. Goa Trip, Flat 301, Office Lunch"
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

      {/* ── Summary & Pending Requests Modal (Bell) ── */}
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

            {/* ── Mini Summary Balance Bar inside Modal ── */}
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

            {/* ── Pending Requests List ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h3 style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  Pending Join Requests ({allPendingRequests.length})
                </h3>
              </div>

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
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                            <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)' }}>
                              {req.user?.name || 'User'}
                            </span>
                            <span className="admin-pill" style={{ fontSize: '11px' }}>
                              Join Request
                            </span>
                          </div>

                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              fontSize: '12.5px',
                              color: 'var(--text-secondary)',
                              marginTop: '2px',
                            }}
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.8 }}>
                              <rect width="20" height="16" x="2" y="4" rx="2" />
                              <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                            </svg>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {req.user?.email || 'No email provided'}
                            </span>
                          </div>

                          <div style={{ fontSize: '12.5px', color: 'var(--text-primary)', marginTop: '4px' }}>
                            Wants to join: <strong style={{ color: 'var(--accent-primary)' }}>{req.groupName}</strong>
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end', paddingTop: '8px', borderTop: '1px solid var(--border-subtle)' }}>
                        <button
                          id={`modal-deny-btn-${req.id}`}
                          type="button"
                          className="btn-danger"
                          style={{ height: '30px', fontSize: '12px', padding: '0 12px' }}
                          onClick={() => handleJoinRequest(req.groupId, req.id, 'denied')}
                        >
                          Reject
                        </button>
                        <button
                          id={`modal-approve-btn-${req.id}`}
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
