import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../lib/api';

export default function JoinRequestPage() {
  const { groupId } = useParams();

  const [groupName, setGroupName] = useState('');
  const [status, setStatus] = useState('idle'); // idle | loading | success | error | already_member
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    async function fetchGroupName() {
      try {
        const { data } = await api.get(`/api/groups/${groupId}/preview`);
        setGroupName(data.group.name);
        if (data.isMember) {
          setStatus('already_member');
        } else if (data.requestStatus === 'pending') {
          setStatus('success');
        }
      } catch (err) {
        if (err.response?.status === 404) {
          setErrorMsg('This invite link is invalid or the group no longer exists.');
          setStatus('error');
        } else {
          setErrorMsg(err.response?.data?.message || 'Failed to load group invite.');
        }
      }
    }
    fetchGroupName();
  }, [groupId]);

  async function handleRequest() {
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
              <h1>Join Group</h1>
              {groupName && <p style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '15px', marginTop: '4px' }}>{groupName}</p>}
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
              You've been invited to join this shared expense group. Request access below to start tracking and splitting expenses.
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
              {status === 'loading' ? 'Sending request…' : 'Request to Join'}
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
