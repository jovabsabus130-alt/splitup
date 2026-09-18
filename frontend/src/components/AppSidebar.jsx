import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import api from '../lib/api';
import EditProfileModal from './EditProfileModal';

export default function AppSidebar({
  mobileOpen,
  onCloseMobile,
  onGroupCreated,
  unreadNotifications = 0,
  onOpenNotifications,
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const activeGroupId = params.groupId;

  const [groups, setGroups] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  
  // UI & Network State Handlers
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null); // Explicit error state for group fetching
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null); // Modal-level error banner

  useEffect(() => {
    function syncUser() {
      const userStr = localStorage.getItem('splitup_user');
      if (userStr) {
        try {
          setCurrentUser(JSON.parse(userStr));
        } catch {
          setCurrentUser(null);
        }
      } else if (window.Clerk?.user) {
        const cu = window.Clerk.user;
        const customName = localStorage.getItem('splitup_custom_name');
        const name = customName || cu.fullName || [cu.firstName, cu.lastName].filter(Boolean).join(' ') || cu.username || cu.firstName || 'User';
        const email = cu.primaryEmailAddress?.emailAddress || cu.emailAddresses?.[0]?.emailAddress || '';
        setCurrentUser({ id: cu.id, name, email });
      }
    }

    syncUser();

    api.get('/api/auth/me')
      .then((res) => {
        if (res.data?.user) {
          setCurrentUser(res.data.user);
          localStorage.setItem('splitup_user', JSON.stringify(res.data.user));
        }
      })
      .catch(() => {});

    function handleUserUpdate(e) {
      if (e.detail) {
        setCurrentUser(e.detail);
      } else {
        syncUser();
      }
    }

    window.addEventListener('splitup-user-updated', handleUserUpdate);
    return () => {
      window.removeEventListener('splitup-user-updated', handleUserUpdate);
    };
  }, []);

  /**
   * Robust group loader with loading indicators, error capture, and retry support
   */
  async function loadGroups() {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get('/api/groups');
      setGroups(data.groups || []);
    } catch (err) {
      // Extract safe client error message without breaking the sidebar UI
      const message = err.response?.data?.message || 'Failed to load groups. Server unreachable.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadGroups();
    if (onCloseMobile) onCloseMobile();
  }, [location.pathname]);

  /**
   * Handle group creation with actionable error feedback
   */
  async function handleCreateGroup(e) {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    setCreating(true);
    setCreateError(null);

    try {
      const { data } = await api.post('/api/groups', { name: newGroupName.trim() });
      setNewGroupName('');
      setShowCreateModal(false);
      await loadGroups();
      if (onGroupCreated) onGroupCreated(data.group);
      if (data.group?.id) {
        navigate(`/groups/${data.group.id}`);
      }
    } catch (err) {
      // Capture 400 validation or 500 server errors and present inside the modal
      const message = err.response?.data?.message || 'Unable to create group. Please try again.';
      setCreateError(message);
    } finally {
      setCreating(false);
    }
  }

  function handleLogout() {
    localStorage.removeItem('token');
    localStorage.removeItem('splitup_token');
    localStorage.removeItem('splitup_user');
    navigate('/login');
  }

  const isDashboardActive = location.pathname === '/dashboard' || location.pathname === '/';
  const isHistoryActive = location.pathname === '/history';

  const [showJoinModal, setShowJoinModal] = useState(false);
  const [joinInput, setJoinInput] = useState('');
  const [joinError, setJoinError] = useState('');

  function handleJoinSubmit(e) {
    e.preventDefault();
    setJoinError('');
    const raw = joinInput.trim();
    if (!raw) return;

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
    if (onCloseMobile) onCloseMobile();
    navigate(`/join/${targetId}`);
  }

  return (
    <>
      <aside className={`app-sidebar${mobileOpen ? ' mobile-open' : ''}`}>
        {/* ── Brand / Logo ────────────────────────────────────── */}
        <div className="sidebar-header">
          <Link
            to="/dashboard"
            className="sidebar-brand"
            onClick={onCloseMobile}
          >
            <div className="brand-badge">S</div>
            <span className="brand-title">SplitUp</span>
          </Link>

          {/* Close button on mobile */}
          <button
            type="button"
            className="sidebar-mobile-close-btn"
            onClick={onCloseMobile}
            aria-label="Close menu"
          >
            ✕
          </button>
        </div>

        {/* ── Navigation / Groups List ────────────────────────── */}
        <div className="sidebar-nav-container">
          <div className="sidebar-nav-section">
            <Link
              to="/dashboard"
              className={`sidebar-nav-item${isDashboardActive ? ' active' : ''}`}
              onClick={onCloseMobile}
            >
              <span className="sidebar-nav-icon">📊</span>
              <span>Dashboard</span>
            </Link>

            <Link
              to="/analytics"
              className={`sidebar-nav-item${location.pathname === '/analytics' ? ' active' : ''}`}
              onClick={onCloseMobile}
            >
              <span className="sidebar-nav-icon">📈</span>
              <span>Analytics</span>
            </Link>

            <Link
              to="/history"
              className={`sidebar-nav-item${isHistoryActive ? ' active' : ''}`}
              onClick={onCloseMobile}
            >
              <span className="sidebar-nav-icon">🕒</span>
              <span>History</span>
            </Link>

            <button
              type="button"
              className="sidebar-nav-item sidebar-notif-item"
              onClick={() => {
                if (onCloseMobile) onCloseMobile();
                if (onOpenNotifications) onOpenNotifications();
              }}
              style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              <span className="sidebar-nav-icon">🔔</span>
              <span style={{ flex: 1 }}>Notifications</span>
              {unreadNotifications > 0 && (
                <span className="nav-unread-badge">
                  {unreadNotifications > 99 ? '99+' : unreadNotifications}
                </span>
              )}
            </button>
          </div>

          <div className="sidebar-section-header">
            <span>YOUR GROUPS ({groups.length})</span>
            <div style={{ display: 'flex', gap: '4px' }}>
              <button
                type="button"
                className="sidebar-add-btn"
                onClick={() => {
                  setJoinError('');
                  setShowJoinModal(true);
                }}
                title="Join existing group"
                style={{ fontSize: '11px', width: '22px' }}
              >
                🔗
              </button>
              <button
                type="button"
                className="sidebar-add-btn"
                onClick={() => setShowCreateModal(true)}
                title="Create new group"
              >
                +
              </button>
            </div>
          </div>

          <div className="sidebar-groups-list">
            {/* 1. Loading State */}
            {loading ? (
              <div style={{ padding: '12px', color: '#94a3b8', fontSize: '0.85rem', textAlign: 'center' }}>
                Loading groups…
              </div>
            ) : error ? (
              /* 2. Error State with Retry CTA */
              <div style={{ padding: '10px 12px', margin: '4px 8px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.25)', borderRadius: '6px', fontSize: '0.8rem', color: '#ef4444' }}>
                <p style={{ margin: '0 0 6px 0', lineHeight: 1.3 }}>{error}</p>
                <button
                  type="button"
                  onClick={loadGroups}
                  style={{ background: '#ef4444', color: '#fff', border: 'none', borderRadius: '4px', padding: '3px 8px', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 600 }}
                >
                  ↻ Retry
                </button>
              </div>
            ) : groups.length === 0 ? (
              /* 3. Empty State */
              <div className="sidebar-empty-hint">No groups yet</div>
            ) : (
              /* 4. Populated Groups */
              groups.map((group) => {
                const isActive = String(group.id) === String(activeGroupId);
                return (
                  <Link
                    key={group.id}
                    to={`/groups/${group.id}`}
                    className={`sidebar-group-item${isActive ? ' active' : ''}`}
                    onClick={onCloseMobile}
                    style={{ opacity: group.isDeleted ? 0.75 : 1 }}
                  >
                    <div className="group-avatar-mini">
                      {group.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="group-item-name">{group.name}</span>
                    {group.isDeleted && (
                      <span style={{ fontSize: '9px', background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', padding: '1px 4px', borderRadius: '4px', marginLeft: 'auto', marginRight: '4px' }}>
                        Deleted
                      </span>
                    )}
                    {group.pendingRequestsCount > 0 && (
                      <span className="group-unread-badge">
                        {group.pendingRequestsCount}
                      </span>
                    )}
                  </Link>
                );
              })
            )}
          </div>

          <div style={{ padding: '8px 12px', display: 'flex', gap: '6px' }}>
            <button
              type="button"
              className="sidebar-new-group-btn"
              style={{ flex: 1, padding: '6px 8px', fontSize: '12px' }}
              onClick={() => {
                setJoinError('');
                setShowJoinModal(true);
              }}
            >
              🔗 Join
            </button>
            <button
              type="button"
              className="sidebar-new-group-btn"
              style={{ flex: 1, padding: '6px 8px', fontSize: '12px' }}
              onClick={() => {
                setCreateError(null);
                setShowCreateModal(true);
              }}
            >
              + Create
            </button>
          </div>
        </div>

        {/* ── User Profile (Pinned to Bottom) ─────────────────── */}
        <div className="sidebar-footer">
          <div
            className="sidebar-user-info"
            onClick={() => setShowProfileModal(true)}
            style={{ cursor: 'pointer', flex: 1, minWidth: 0 }}
            title="Click to rename or edit profile"
          >
            <div className="sidebar-user-avatar">
              {currentUser?.name?.charAt(0).toUpperCase() || 'U'}
            </div>
            <div className="sidebar-user-details" style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span className="sidebar-user-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {currentUser?.name || 'User'}
                </span>
                <span style={{ fontSize: '0.75rem', opacity: 0.6 }} title="Edit display name">✏️</span>
              </div>
              <span className="sidebar-user-email">{currentUser?.email || ''}</span>
            </div>
          </div>
          <button
            type="button"
            className="sidebar-logout-btn"
            onClick={handleLogout}
            title="Sign out"
          >
            ↪
          </button>
        </div>
      </aside>

      {/* ── Join Group Modal ──────────────────────────────────── */}
      {showJoinModal && (
        <div
          className="modal-overlay"
          onClick={(e) => { if (e.target === e.currentTarget) setShowJoinModal(false); }}
        >
          <div className="modal-box" style={{ maxWidth: '380px' }}>
            <button
              className="modal-close"
              onClick={() => setShowJoinModal(false)}
            >
              ✕
            </button>
            <div className="card-header">
              <h2 className="card-title">Join a Group</h2>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 10px 0' }}>
              Enter a Group ID or paste an invite link to request to join.
            </p>

            {joinError && (
              <div style={{ margin: '4px 0 10px 0', padding: '6px 10px', background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '6px', color: '#ef4444', fontSize: '0.8rem' }}>
                {joinError}
              </div>
            )}

            <form onSubmit={handleJoinSubmit} className="form-grid">
              <input
                value={joinInput}
                onChange={(e) => setJoinInput(e.target.value)}
                placeholder="Group ID or Invite Link"
                autoFocus
                required
              />
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '4px' }}>
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
                  Join ➔
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Quick Create Group Modal ──────────────────────────── */}
      {showCreateModal && (
        <div
          className="modal-overlay"
          onClick={(e) => { if (e.target === e.currentTarget) setShowCreateModal(false); }}
        >
          <div className="modal-box" style={{ maxWidth: '380px' }}>
            <button
              className="modal-close"
              onClick={() => setShowCreateModal(false)}
            >
              ✕
            </button>
            <div className="card-header">
              <h2 className="card-title">Create Group</h2>
            </div>

            {/* User-visible Modal Error Alert */}
            {createError && (
              <div style={{ margin: '8px 0 12px 0', padding: '8px 12px', background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '6px', color: '#ef4444', fontSize: '0.85rem' }}>
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateGroup} className="form-grid">
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

      {/* ── Edit Profile Modal ─────────────────────────────────── */}
      <EditProfileModal
        isOpen={showProfileModal}
        onClose={() => setShowProfileModal(false)}
        currentUser={currentUser}
        onUpdated={(updated) => setCurrentUser(updated)}
      />
    </>
  );
}
