import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import LogExpenseFABModal from '../components/LogExpenseFABModal';
import { useNavigation } from '../lib/NavigationContext';
import api from '../lib/api';

export default function DashboardPage() {
  const navigate = useNavigate();
  const { openNotifications, unreadNotifications, refreshNotifications, notificationPermission, requestPermission } = useNavigation();
  const [summary, setSummary] = useState(null);
  const [groups, setGroups] = useState([]);
  const [shoppingItems, setShoppingItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [joinInput, setJoinInput] = useState('');
  const [joinError, setJoinError] = useState('');
  const [showFABLogModal, setShowFABLogModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [hideNotifBanner, setHideNotifBanner] = useState(() => localStorage.getItem('splitup_hide_notif_banner') === 'true');

  function dismissNotifBanner() {
    setHideNotifBanner(true);
    localStorage.setItem('splitup_hide_notif_banner', 'true');
  }

  async function loadDashboardData() {
    try {
      const [dashRes, groupsRes] = await Promise.all([
        api.get('/api/dashboard'),
        api.get('/api/groups').catch(() => ({ data: { groups: [] } })),
      ]);
      setSummary(dashRes.data.summary || null);
      const userGroups = dashRes.data.groups || groupsRes.data.groups || [];
      setGroups(userGroups);

      // Load recent shopping items from first active group if available
      if (userGroups.length > 0) {
        try {
          const shopRes = await api.get(`/api/groups/${userGroups[0].id}/shopping`);
          setShoppingItems((shopRes.data.items || []).slice(0, 5));
        } catch {}
      }

      if (refreshNotifications) refreshNotifications();
    } catch (apiError) {
      setError(apiError.response?.data?.message || 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDashboardData();

    // Listen for global settlement events to update dashboard net balances immediately
    function handleSettlementUpdate() {
      loadDashboardData();
    }
    window.addEventListener('splitup:settlement_updated', handleSettlementUpdate);
    return () => window.removeEventListener('splitup:settlement_updated', handleSettlementUpdate);
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

  function handleJoinSubmit(e) {
    e.preventDefault();
    setJoinError('');
    const raw = joinInput.trim();
    if (!raw) return;

    // Support full invite links (e.g., https://domain.com/join/cm123...) or raw group IDs
    let targetId = raw;
    if (raw.includes('/join/')) {
      const parts = raw.split('/join/');
      targetId = parts[parts.length - 1].split('?')[0].split('#')[0].trim();
    }

    if (!targetId || targetId === 'undefined') {
      setJoinError('Please enter a valid Group ID or invite link.');
      return;
    }

    setShowJoinModal(false);
    setJoinInput('');
    navigate(`/join/${targetId}`);
  }

  const allPendingRequests = useMemo(() => {
    return groups.flatMap((g) =>
      (g.pendingRequests || []).map((req) => ({ ...req, groupName: g.name, groupId: g.id }))
    );
  }, [groups]);

  const totalBadgesCount = allPendingRequests.length + unreadNotifications;
  const totalOwedToYou = Number(summary?.totalOwedToYou || 0);
  const totalYouOwe = Number(summary?.totalYouOwe || 0);
  const netBalance = totalOwedToYou - totalYouOwe;

  // Format Month Year (e.g. "Sep 26")
  const currentMonthBadge = useMemo(() => {
    if (summary?.currentMonthName) return summary.currentMonthName;
    const d = new Date();
    const shortMonth = d.toLocaleString('en-US', { month: 'short' });
    const shortYear = d.getFullYear().toString().slice(-2);
    return `${shortMonth} ${shortYear}`;
  }, [summary]);

  return (
    <div className="dashboard-page-view" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', width: '100%', position: 'relative', paddingBottom: '80px' }}>
      {/* ── Page Header Bar ── */}
      <div className="page-header">
        <div>
          <h1 style={{ fontWeight: 800 }}>Dashboard</h1>
          <p>Track shared balances, groups & expenses</p>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="dashboard-bell-btn"
            onClick={openNotifications}
            title={totalBadgesCount > 0 ? `${totalBadgesCount} pending notifications & requests` : 'Notifications'}
            aria-label="Notifications"
          >
            <svg className="bell-icon" viewBox="0 0 24 24">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            {totalBadgesCount > 0 && <span className="bell-blue-dot" />}
          </button>
        </div>
      </div>

      {error ? <div className="error-text">{error}</div> : null}
      {message ? <div className="success-text">{message}</div> : null}

      {/* ── Notification Bar Permission Banner ── */}
      {!hideNotifBanner && notificationPermission !== 'granted' && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            padding: '10px 14px',
            borderRadius: 'var(--radius-md)',
            background: notificationPermission === 'denied' ? 'rgba(239, 68, 68, 0.08)' : 'linear-gradient(135deg, rgba(99, 102, 241, 0.08) 0%, rgba(168, 85, 247, 0.08) 100%)',
            border: `1px solid ${notificationPermission === 'denied' ? 'rgba(239, 68, 68, 0.25)' : 'rgba(99, 102, 241, 0.25)'}`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
            <span style={{ fontSize: '18px', flexShrink: 0 }}>{notificationPermission === 'denied' ? '⚠️' : '🔔'}</span>
            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                {notificationPermission === 'denied' ? 'Notifications Blocked by Browser' : 'Enable Notification Bar Alerts'}
              </span>
              <span style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>
                {notificationPermission === 'denied'
                  ? 'Click the lock/settings icon (🔒) in your browser address bar and set Notifications to Allow.'
                  : 'Get instant alerts in your device notification bar for expenses and invitations.'}
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
            {notificationPermission !== 'denied' && (
              <button
                type="button"
                className="btn-primary"
                style={{ fontSize: '12px', padding: '4px 10px', minHeight: '32px' }}
                onClick={requestPermission}
              >
                Turn On
              </button>
            )}
            <button
              type="button"
              className="btn-ghost"
              style={{ fontSize: '14px', padding: '4px 6px', minHeight: '32px' }}
              onClick={dismissNotifBanner}
              title="Dismiss banner"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* ── Top Summary Cards (Matching Wireframe Image 1) ── */}
      {loading ? (
        <div className="dashboard-summary-grid">
          <div className="card" style={{ minHeight: '110px', justifyContent: 'center', alignItems: 'center' }}>
            <div style={{ color: 'var(--text-secondary)' }}>Loading expenses…</div>
          </div>
          <div className="card" style={{ minHeight: '110px', justifyContent: 'center', alignItems: 'center' }}>
            <div style={{ color: 'var(--text-secondary)' }}>Loading net balance…</div>
          </div>
        </div>
      ) : (
        <div className="dashboard-summary-grid">
          {/* ── Card 1: My monthly expense ── */}
          <div className="card dashboard-hero-card" style={{ gap: 'var(--space-2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text-primary)' }}>
                My monthly expense
              </span>
              <span
                style={{
                  fontSize: '11.5px',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: 'var(--radius-full)',
                  backgroundColor: 'var(--bg-subtle)',
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                {currentMonthBadge}
              </span>
            </div>

            <div style={{ margin: 'var(--space-1) 0' }}>
              <span
                style={{
                  fontSize: '20px',
                  fontWeight: 800,
                  letterSpacing: '-0.02em',
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-sans)',
                  lineHeight: 1.2,
                }}
              >
                ₹{Number(summary?.myMonthlyExpense || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'auto', paddingTop: 'var(--space-1)' }}>
              <button
                type="button"
                className="btn-ghost"
                id="view-analytics-btn"
                onClick={() => navigate('/analytics')}
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  padding: '3px 8px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  color: 'var(--text-primary)',
                }}
              >
                <span>📈</span>
                <span>View Analytics ➔</span>
              </button>
            </div>
          </div>

          {/* ── Card 2: Net Balance ── */}
          <div className="card dashboard-hero-card" style={{ gap: 'var(--space-2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text-primary)' }}>
                Net Balance
              </span>
              <span
                style={{
                  fontSize: '11.5px',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: 'var(--radius-full)',
                  backgroundColor: netBalance > 0 ? 'var(--success-bg)' : netBalance < 0 ? 'var(--danger-bg)' : 'var(--bg-subtle)',
                  color: netBalance > 0 ? 'var(--success-text)' : netBalance < 0 ? 'var(--danger-text)' : 'var(--text-muted)',
                  border: `1px solid ${netBalance > 0 ? 'var(--success-border)' : netBalance < 0 ? 'var(--danger-border)' : 'var(--border-subtle)'}`,
                }}
              >
                {netBalance > 0 ? 'You are owed' : netBalance < 0 ? 'You owe' : 'Settled up'}
              </span>
            </div>

            <div style={{ margin: 'var(--space-1) 0' }}>
              <span
                style={{
                  fontSize: '20px',
                  fontWeight: 800,
                  letterSpacing: '-0.02em',
                  color: netBalance > 0 ? 'var(--success)' : netBalance < 0 ? 'var(--danger)' : 'var(--text-primary)',
                  fontFamily: 'var(--font-sans)',
                  lineHeight: 1.2,
                }}
              >
                {netBalance > 0 ? '+ ' : netBalance < 0 ? '- ' : ''}₹{Math.abs(netBalance).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', marginTop: 'auto', paddingTop: 'var(--space-1)' }}>
              <span style={{ color: 'var(--success)', fontWeight: 700 }}>
                + ₹{totalOwedToYou.toLocaleString('en-IN', { minimumFractionDigits: 0 })}
              </span>
              <span style={{ color: 'var(--text-muted)' }}>|</span>
              <span style={{ color: 'var(--danger)', fontWeight: 700 }}>
                - ₹{totalYouOwe.toLocaleString('en-IN', { minimumFractionDigits: 0 })}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── Section 1: Shopping list: (Matching Wireframe Image 1) ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)' }}>
            Shopping list:
          </h2>
          {groups.length > 0 && (
            <Link
              to={`/groups/${groups[0].id}`}
              style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-secondary)' }}
            >
              Open Group List ➔
            </Link>
          )}
        </div>

        <div
          className="card"
          style={{
            border: '2px dashed var(--border-medium)',
            borderRadius: 'var(--radius-xl)',
            padding: 'var(--space-5)',
            minHeight: '160px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: shoppingItems.length > 0 ? 'flex-start' : 'center',
            gap: 'var(--space-3)',
          }}
        >
          {shoppingItems.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              {shoppingItems.map((item) => (
                <div
                  key={item.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 0',
                    borderBottom: '1px solid var(--border-subtle)',
                    fontSize: '13.5px',
                  }}
                >
                  <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                    🛒 {item.name} {item.quantity > 1 ? `(${item.quantity})` : ''}
                  </span>
                  {item.price && (
                    <strong style={{ fontVariantNumeric: 'tabular-nums' }}>₹{Number(item.price).toFixed(2)}</strong>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
              <span>No active shopping items yet.</span>
              <p style={{ margin: '4px 0 0 0', fontSize: '12px' }}>
                Items added inside your groups will appear here.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Section 2: Your Groups ➔ (Matching Wireframe Image 1) ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>Your Groups</span>
            <span style={{ color: 'var(--text-muted)' }}>➔</span>
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                setJoinError('');
                setShowJoinModal(true);
              }}
              style={{ fontSize: '12.5px', fontWeight: 600, padding: '4px 10px', background: 'var(--bg-subtle)' }}
            >
              🔗 Join Group
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setShowCreateModal(true)}
              style={{ fontSize: '12.5px', fontWeight: 600, padding: '4px 10px', background: 'var(--bg-subtle)' }}
            >
              + Create Group
            </button>
          </div>
        </div>

        {groups.length === 0 ? (
          <div className="card" style={{ padding: 'var(--space-8) var(--space-4)', textAlign: 'center', alignItems: 'center' }}>
            <p style={{ margin: '0 0 12px 0' }}>You don't belong to any groups yet.</p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowJoinModal(true)}
              >
                Join with Link or ID
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => setShowCreateModal(true)}
              >
                + Create your first group
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))', gap: 'var(--space-3)' }}>
            {groups.map((g) => (
              <div
                key={g.id}
                className="card"
                style={{
                  padding: 'var(--space-4)',
                  gap: 'var(--space-3)',
                  cursor: 'pointer',
                  transition: 'transform 0.15s ease, border-color 0.15s ease',
                  opacity: g.isDeleted ? 0.75 : 1,
                }}
                onClick={() => navigate(`/groups/${g.id}`)}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                    <div
                      className="group-avatar-mini"
                      style={{ width: '36px', height: '36px', fontSize: '14px', borderRadius: 'var(--radius-full)' }}
                    >
                      {g.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <strong style={{ fontSize: '14px', color: 'var(--text-primary)', display: 'block' }}>
                          {g.name}
                        </strong>
                        {g.isDeleted && (
                          <span style={{ fontSize: '10.5px', background: 'var(--danger-bg)', color: 'var(--danger-text)', border: '1px solid var(--danger-border)', padding: '1px 6px', borderRadius: 'var(--radius-full)', fontWeight: 600 }}>
                            Deleted
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        {g.membersCount || g._count?.members || 1} members {g.isDeleted ? '• Archived' : ''}
                      </span>
                    </div>
                  </div>
                  <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>➔</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Floating Action Button [+] (Matching Wireframe Image 1) ── */}
      <button
        type="button"
        className="fab-btn"
        onClick={() => setShowFABLogModal(true)}
        aria-label="Log a transaction or Parse with AI"
        title="Log a transaction / Parse with AI"
      >
        <span className="fab-icon">+</span>
      </button>

      {/* ── Log Expense & AI Parse FAB Modal (Matching Wireframe Image 3/4) ── */}
      <LogExpenseFABModal
        isOpen={showFABLogModal}
        onClose={() => setShowFABLogModal(false)}
        onExpenseAdded={loadDashboardData}
      />

      {/* ── Join Group Modal ── */}
      {showJoinModal && (
        <div
          className="modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowJoinModal(false);
          }}
        >
          <div className="modal-box" style={{ maxWidth: '440px' }}>
            <button
              type="button"
              className="modal-close"
              onClick={() => setShowJoinModal(false)}
              aria-label="Close modal"
            >
              ✕
            </button>
            <div className="card-header">
              <h2 className="card-title">Join a Group</h2>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 12px 0' }}>
              Paste an invite link or enter a Group ID to request access to an existing group.
            </p>

            {joinError && <div className="error-text" style={{ marginBottom: '12px' }}>{joinError}</div>}

            <form onSubmit={handleJoinSubmit} className="form-grid">
              <label className="form-label">
                Group ID or Invite Link
                <input
                  type="text"
                  placeholder="e.g. cm123... or https://.../join/cm123..."
                  value={joinInput}
                  onChange={(e) => setJoinInput(e.target.value)}
                  autoFocus
                  required
                />
              </label>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: 'var(--space-2)' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowJoinModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={!joinInput.trim()}
                >
                  Continue to Join ➔
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Create Group Modal ── */}
      {showCreateModal && (
        <div
          className="modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowCreateModal(false);
          }}
        >
          <div className="modal-box" style={{ maxWidth: '420px' }}>
            <button
              type="button"
              className="modal-close"
              onClick={() => setShowCreateModal(false)}
              aria-label="Close modal"
            >
              ✕
            </button>
            <div className="card-header">
              <h2 className="card-title">Create New Group</h2>
            </div>
            <form onSubmit={handleCreateGroup} className="form-grid">
              <label className="form-label">
                Group Name
                <input
                  type="text"
                  placeholder="e.g. Flatmates, Road Trip, Office Lunch"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  autoFocus
                  required
                />
              </label>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: 'var(--space-2)' }}>
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
    </div>
  );
}
