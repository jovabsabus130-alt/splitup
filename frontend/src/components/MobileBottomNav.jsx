import { useLocation, useNavigate } from 'react-router-dom';

export default function MobileBottomNav({
  unreadCount = 0,
  onOpenNotifications,
  onOpenAddFlow,
}) {
  const navigate = useNavigate();
  const location = useLocation();

  const isHomeActive = location.pathname === '/dashboard' || location.pathname === '/';
  const isHistoryActive = location.pathname === '/history';

  return (
    <nav className="mobile-bottom-nav" aria-label="Mobile Navigation">
      <div className="mobile-bottom-nav-inner">
        {/* ── 1. Home ── */}
        <button
          type="button"
          className={`bottom-nav-item${isHomeActive ? ' active' : ''}`}
          onClick={() => navigate('/dashboard')}
          aria-label="Home Dashboard"
          aria-current={isHomeActive ? 'page' : undefined}
        >
          <div className="bottom-nav-icon-wrap">
            <svg
              className="bottom-nav-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
          </div>
          <span className="bottom-nav-label">Home</span>
        </button>

        {/* ── 2. History ── */}
        <button
          type="button"
          className={`bottom-nav-item${isHistoryActive ? ' active' : ''}`}
          onClick={() => navigate('/history')}
          aria-label="Expense History"
          aria-current={isHistoryActive ? 'page' : undefined}
        >
          <div className="bottom-nav-icon-wrap">
            <svg
              className="bottom-nav-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
          <span className="bottom-nav-label">History</span>
        </button>

        {/* ── 3. Add (Central Action) ── */}
        <button
          type="button"
          className="bottom-nav-item bottom-nav-add-item"
          onClick={onOpenAddFlow}
          aria-label="Add Expense or Shopping Item"
        >
          <div className="bottom-nav-add-btn">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ width: '22px', height: '22px' }}
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </div>
          <span className="bottom-nav-label" style={{ fontWeight: 600 }}>Add</span>
        </button>

        {/* ── 4. Notifications ── */}
        <button
          type="button"
          className="bottom-nav-item"
          onClick={onOpenNotifications}
          aria-label={unreadCount > 0 ? `${unreadCount} unread notifications` : 'Notifications'}
        >
          <div className="bottom-nav-icon-wrap">
            <svg
              className="bottom-nav-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            {unreadCount > 0 && (
              <span className="bottom-nav-badge" aria-hidden="true">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </div>
          <span className="bottom-nav-label">Notifications</span>
        </button>
      </div>
    </nav>
  );
}
