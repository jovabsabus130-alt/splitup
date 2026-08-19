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
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const userStr = localStorage.getItem('splitup_user');
    if (userStr) {
      try {
        setCurrentUser(JSON.parse(userStr));
      } catch { }
    }
  }, []);

  async function loadGroups() {
    try {
      const { data } = await api.get('/api/groups');
      setGroups(data.groups || []);
    } catch { }
  }

  useEffect(() => {
    loadGroups();
    if (onCloseMobile) onCloseMobile();
  }, [location.pathname]);

  async function handleCreateGroup(e) {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    setCreating(true);
    try {
      const { data } = await api.post('/api/groups', { name: newGroupName.trim() });
      setNewGroupName('');
      setShowCreateModal(false);
      await loadGroups();
      if (onGroupCreated) onGroupCreated(data.group);
      if (data.group?.id) {
        navigate(`/groups/${data.group.id}`);
      }
    } catch { }
    finally {
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
            {groups.length === 0 ? (
              <div className="sidebar-empty-hint">No groups yet</div>
            ) : (
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
              onClick={() => setShowCreateModal(true)}
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
            <form onSubmit={handleCreateGroup} className="form-grid">
              <input
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="e.g. Goa Trip, Apartment 402"
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
