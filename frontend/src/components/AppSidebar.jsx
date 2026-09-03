import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import api from '../lib/api';

export default function AppSidebar({ mobileOpen, onCloseMobile, onGroupCreated }) {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const activeGroupId = params.groupId;

  const [groups, setGroups] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  
  // UI & Network State Handlers
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null); // Explicit error state for group fetching
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null); // Modal-level error banner

  useEffect(() => {
    const userStr = localStorage.getItem('splitup_user');
    if (userStr) {
      try {
        setCurrentUser(JSON.parse(userStr));
      } catch {
        // Corrupted localStorage token fallback
        setCurrentUser(null);
      }
    }
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

  const isDashboardActive = location.pathname === '/dashboard';

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
              <span>Dashboard</span>
            </Link>
          </div>

          <div className="sidebar-section-header">
            <span>YOUR GROUPS ({groups.length})</span>
            <button
              type="button"
              className="sidebar-add-btn"
              onClick={() => setShowCreateModal(true)}
              title="Create new group"
            >
              +
            </button>
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
                  >
                    <div className="group-avatar-mini">
                      {group.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="group-item-name">{group.name}</span>
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

          <div style={{ padding: '8px 12px' }}>
            <button
              type="button"
              className="sidebar-new-group-btn"
              onClick={() => {
                setCreateError(null);
                setShowCreateModal(true);
              }}
            >
              + New Group
            </button>
          </div>
        </div>

        {/* ── User Profile (Pinned to Bottom) ─────────────────── */}
        <div className="sidebar-footer">
          <div className="sidebar-user-info">
            <div className="sidebar-user-avatar">
              {currentUser?.name?.charAt(0).toUpperCase() || 'U'}
            </div>
            <div className="sidebar-user-details">
              <span className="sidebar-user-name">{currentUser?.name || 'User'}</span>
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
    </>
  );
}
