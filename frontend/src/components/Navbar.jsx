import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

export default function Navbar({ groupName, groupId }) {
  const navigate = useNavigate();
  const [userName, setUserName] = useState('');

  useEffect(() => {
    const userStr = localStorage.getItem('splitup_user');
    if (userStr) {
      try {
        const u = JSON.parse(userStr);
        if (u.name) setUserName(u.name);
      } catch {}
    }
  }, []);

  function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('splitup_token');
    localStorage.removeItem('splitup_user');
    navigate('/login');
  }

  return (
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
            <div className="user-pill" title={`Logged in as ${userName}`}>
              <div className="user-avatar-mini">{userName.charAt(0).toUpperCase()}</div>
              <span>{userName}</span>
            </div>
          )}
          <button type="button" onClick={logout} className="btn-ghost" style={{ height: '32px' }}>
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
