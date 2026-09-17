import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useNavigation } from '../lib/NavigationContext';
import api from '../lib/api';
import AppSidebar from './AppSidebar';
import MobileBottomNav from './MobileBottomNav';
import NotificationsModal from './NotificationsModal';

export default function AppLayout({ children }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [groups, setGroups] = useState([]);
  const [loadingGroups, setLoadingGroups] = useState(false);

  const {
    unreadNotifications,
    isNotificationsOpen,
    openNotifications,
    closeNotifications,
    isQuickAddOpen,
    openQuickAdd,
    closeQuickAdd,
    refreshNotifications,
  } = useNavigation();

  const location = useLocation();
  const navigate = useNavigate();

  async function handleOpenAddFlow() {
    // If user is currently on a group detail page, scroll to the expense form
    const isGroupPage = (location.pathname.startsWith('/groups/') || location.pathname.startsWith('/group/')) && !location.pathname.endsWith('/balances');
    if (isGroupPage) {
      const expenseInput = document.querySelector('input[type="number"][step="0.01"]') || document.querySelector('form.form-grid');
      if (expenseInput) {
        expenseInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => expenseInput.focus(), 250);
        return;
      }
    }

    // Otherwise, fetch user groups and open Quick Add action modal
    openQuickAdd();
    setLoadingGroups(true);
    try {
      const { data } = await api.get('/api/groups');
      setGroups(data.groups || []);
    } catch {
      setGroups([]);
    } finally {
      setLoadingGroups(false);
    }
  }

  function handleSelectGroupForExpense(groupId) {
    closeQuickAdd();
    navigate(`/groups/${groupId}`);
    setTimeout(() => {
      const expenseInput = document.querySelector('input[type="number"][step="0.01"]') || document.querySelector('form.form-grid');
      if (expenseInput) {
        expenseInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        expenseInput.focus();
      }
    }, 350);
  }

  return (
    <div className="app-layout">
      {/* ── Mobile Top Header Bar ────────────────────────────────────────── */}
      <div className="mobile-top-bar">
        <button
          type="button"
          className="mobile-menu-btn"
          onClick={() => setMobileOpen(true)}
          aria-label="Open Navigation Menu"
        >
          ☰
        </button>
        <Link to="/dashboard" className="mobile-brand">
          <div className="brand-badge">S</div>
          <span className="brand-title">SplitUp</span>
        </Link>
        <button
          type="button"
          className="dashboard-bell-btn mobile-top-bell"
          onClick={openNotifications}
          aria-label={unreadNotifications > 0 ? `${unreadNotifications} unread notifications` : 'Notifications'}
        >
          <svg className="bell-icon" viewBox="0 0 24 24">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          {unreadNotifications > 0 && <span className="bell-blue-dot" />}
        </button>
      </div>

      {/* ── Persistent Sidebar (Desktop) / Slide-out Drawer (Mobile) ─────── */}
      <AppSidebar
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
        unreadNotifications={unreadNotifications}
        onOpenNotifications={openNotifications}
      />

      {/* ── Mobile Overlay Backdrop ──────────────────────────────────────── */}
      {mobileOpen && (
        <div
          className="mobile-backdrop"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ── Main Scrollable Area ─────────────────────────────────────────── */}
      <main className="app-main-content">
        <div className="app-main-container">
          {children}
        </div>
      </main>

      {/* ── Mobile Bottom Navigation (Visible on <= 768px) ───────────────── */}
      <MobileBottomNav
        unreadCount={unreadNotifications}
        onOpenNotifications={openNotifications}
        onOpenAddFlow={handleOpenAddFlow}
      />


      {/* ── Single Unified Notifications Modal Instance ──────────────────── */}
      <NotificationsModal
        isOpen={isNotificationsOpen}
        onClose={closeNotifications}
        onActionTaken={refreshNotifications}
      />

      {/* ── Quick Add Modal (opened via Bottom Nav 'Add') ─────────────────── */}
      {isQuickAddOpen && (
        <div
          className="modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeQuickAdd();
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="quick-add-modal-title"
        >
          <div className="modal-box" style={{ maxWidth: '420px' }}>
            <button
              className="modal-close"
              onClick={closeQuickAdd}
              aria-label="Close modal"
            >
              ✕
            </button>
            <div className="card-header" style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: 'var(--space-3)' }}>
              <div>
                <h2 id="quick-add-modal-title" className="card-title">Add Expense or Item</h2>
                <div className="card-subtitle">Select a group to log an expense or shopping list item</div>
              </div>
            </div>

            {loadingGroups ? (
              <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px' }}>
                Loading your groups…
              </div>
            ) : groups.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-secondary)' }}>
                <p style={{ margin: '0 0 12px 0', fontSize: '13px' }}>You don't belong to any groups yet.</p>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => {
                    closeQuickAdd();
                    navigate('/dashboard');
                  }}
                >
                  Create a Group First
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '320px', overflowY: 'auto' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Choose Group:
                </span>
                {groups.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    className="quick-add-group-option"
                    onClick={() => handleSelectGroupForExpense(g.id)}
                  >
                    <div className="group-avatar-mini" style={{ width: '28px', height: '28px', fontSize: '12px' }}>
                      {g.name.charAt(0).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
                      <strong style={{ display: 'block', fontSize: '13.5px', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {g.name}
                      </strong>
                    </div>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>➔</span>
                  </button>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--space-2)' }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={closeQuickAdd}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
