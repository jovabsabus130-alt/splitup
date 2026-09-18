import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import EditProfileModal from './EditProfileModal';

export default function Navbar({ groupName, groupId }) {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(null);
  const [showProfileModal, setShowProfileModal] = useState(false);

  useEffect(() => {
    function syncUser() {
      const userStr = localStorage.getItem('splitup_user');
      if (userStr) {
        try {
          const u = JSON.parse(userStr);
          setCurrentUser(u);
        } catch {}
      } else if (window.Clerk && window.Clerk.user) {
        const cu = window.Clerk.user;
        const customName = localStorage.getItem('splitup_custom_name');
        const name = customName || cu.fullName || cu.firstName || cu.primaryEmailAddress?.emailAddress || 'User';
        const email = cu.primaryEmailAddress?.emailAddress || cu.emailAddresses?.[0]?.emailAddress || '';
        setCurrentUser({ id: cu.id, name, email });
      }
    }

    syncUser();

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

  function logout() {
    if (window.Clerk && window.Clerk.signOut) {
      window.Clerk.signOut();
    }
    localStorage.removeItem('token');
    localStorage.removeItem('splitup_token');
    localStorage.removeItem('splitup_user');
    localStorage.removeItem('splitup_custom_name');
    navigate('/login');
  }

  const userName = currentUser?.name || '';

  return (
    <>
      <header className="navbar">
        <div className="navbar-inner">
          <div className="navbar-brand-wrap">
            <Link to="/dashboard" className="brand-link">
              <div className="brand-logo">S</div>
              <span>SplitUp</span>
            </Link>

            {groupName && (
              <div className="nav-breadcrumbs">
                <span className="nav-sep">/</span>
                {groupId ? (
                  <Link to={`/groups/${groupId}`} className="nav-current">
                    {groupName}
                  </Link>
                ) : (
                  <span className="nav-current">{groupName}</span>
                )}
              </div>
            )}
          </div>

          <div className="navbar-user-actions">
            {userName && (
              <div
                className="user-pill"
                title={`Logged in as ${userName} (Click to edit profile)`}
                onClick={() => setShowProfileModal(true)}
                style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <div className="user-avatar-mini">{userName.charAt(0).toUpperCase()}</div>
                <span>{userName}</span>
                <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>✏️</span>
              </div>
            )}
            <button type="button" onClick={logout} className="btn-ghost" style={{ height: '32px' }}>
              Sign out
            </button>
          </div>
        </div>
      </header>

      <EditProfileModal
        isOpen={showProfileModal}
        onClose={() => setShowProfileModal(false)}
        currentUser={currentUser}
        onUpdated={(updated) => setCurrentUser(updated)}
      />
    </>
  );
}
