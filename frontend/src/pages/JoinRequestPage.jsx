import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import api from '../lib/api';

const isClerkConfigured = Boolean(
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ||
  import.meta.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
);

export default function JoinRequestPage() {
  const { groupId: rawGroupId } = useParams();
  const groupId = (rawGroupId || '').trim();
  const location = useLocation();
  const navigate = useNavigate();

  const [groupName, setGroupName] = useState('');
  const [memberCount, setMemberCount] = useState(0);
  const [status, setStatus] = useState('idle'); // idle | loading | success | error | already_member
  const [errorMsg, setErrorMsg] = useState('');

  const isLoggedIn = Boolean(
    localStorage.getItem('splitup_token') ||
    localStorage.getItem('token') ||
    (isClerkConfigured && window.Clerk?.session)
  );

  useEffect(() => {
    if (!groupId || groupId === 'undefined') {
      setErrorMsg('This invite link is missing a valid Group ID. Please request a fresh invite link or Group ID from the group admin.');
      setStatus('error');
      return;
    }

    async function fetchGroupName() {
      try {
        const { data } = await api.get(`/api/groups/${groupId}/preview`);
        setGroupName(data.group.name);
        if (data.group.memberCount) setMemberCount(data.group.memberCount);
        if (data.isMember) {
          setStatus('already_member');
        } else if (data.requestStatus === 'pending') {
          setStatus('success');
        } else {
          setStatus('idle');
        }
      } catch (err) {
        if (err.response?.status === 404) {
          setErrorMsg('This invite link is invalid or the group no longer exists.');
          setStatus('error');
        } else {
          setErrorMsg(err.response?.data?.message || 'Failed to load group invite.');
          setStatus('error');
        }
      }
    }
    fetchGroupName();
  }, [groupId]);

  async function handleRequest() {
    if (!groupId || groupId === 'undefined') return;

    if (!isLoggedIn) {
      navigate('/login', { state: { from: location } });
      return;
    }

    setStatus('loading');
    setErrorMsg('');
    try {
      const { data } = await api.post(`/api/groups/${groupId}/join-request`);
      setGroupName(data.groupName || groupName);
      setStatus('success');
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to send join request.';
      if (msg.includes('already a member')) {
        setStatus('already_member');
      } else {
        setErrorMsg(msg);
        setStatus('error');
      }
    }
  }

  return (
    <div className="join-page">
      <div className="join-card">
        <div className="auth-header">
          <div className="auth-brand-mark">S</div>

          {status === 'success' ? (
            <>
              <h1>Request Sent</h1>
              {groupName && <p style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '15px', marginTop: '4px' }}>{groupName}</p>}
            </>
          ) : status === 'already_member' ? (
            <>
              <h1>Already a Member</h1>
              {groupName && <p style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '15px', marginTop: '4px' }}>{groupName}</p>}
            </>
          ) : (
            <>
              <h1>Join {groupName || 'Group'}</h1>
              {groupName && (
                <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '4px' }}>
                  {memberCount > 0 ? `${memberCount} active member${memberCount === 1 ? '' : 's'}` : 'Shared Expense Group'}
                </p>
              )}
            </>
          )}
        </div>

        {status === 'success' ? (
          <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
            <div className="success-text">
              Your request was sent to the group admin. You'll gain access once approved.
            </div>
            <Link to="/dashboard" className="btn-secondary" style={{ width: '100%' }}>
              Return to Dashboard
            </Link>
          </div>
        ) : status === 'already_member' ? (
          <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
            <div className="success-text">
              You are already a member of this group.
            </div>
            <Link to={`/groups/${groupId}`} className="btn-primary" style={{ width: '100%' }}>
              Open Group
            </Link>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
            <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)', textAlign: 'center', lineHeight: 1.5 }}>
              You've been invited to join <strong>{groupName || 'this group'}</strong>. Request access below to start tracking and splitting expenses.
            </p>

            {errorMsg && (
              <div className="error-text">{errorMsg}</div>
            )}

            <button
              id="send-join-request-btn"
              className="btn-primary"
              onClick={handleRequest}
              disabled={status === 'loading' || (status === 'error' && errorMsg.includes('invalid'))}
              style={{ width: '100%' }}
            >
              {status === 'loading' ? 'Sending request…' : isLoggedIn ? 'Request to Join' : 'Sign in to Join Group'}
            </button>

            <Link to="/dashboard" className="btn-secondary" style={{ width: '100%' }}>
              Cancel
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

