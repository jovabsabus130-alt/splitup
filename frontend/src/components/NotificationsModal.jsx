import { useEffect, useState } from 'react';
import api from '../lib/api';

export default function NotificationsModal({ isOpen, onClose, onActionTaken }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState({});

  async function loadNotifications() {
    try {
      const { data } = await api.get('/api/notifications');
      setNotifications(data.notifications || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load notifications');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isOpen) {
      loadNotifications();
    }
  }, [isOpen]);

  async function handleMarkAllRead() {
    try {
      await api.post('/api/notifications/read-all');
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    } catch {}
  }

  async function handleConfirmPayment(notification) {
    const settlementId = notification.data?.settlementId;
    const groupId = notification.groupId || notification.data?.groupId;
    if (!settlementId || !groupId) return;

    setActionLoading((prev) => ({ ...prev, [notification.id]: 'confirming' }));
    try {
      await api.post(`/api/groups/${groupId}/settlements/${settlementId}/confirm`);
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === notification.id ? { ...n, actionTaken: 'confirmed', isRead: true } : n
        )
      );
      if (onActionTaken) onActionTaken();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to confirm payment');
    } finally {
      setActionLoading((prev) => ({ ...prev, [notification.id]: null }));
    }
  }

  async function handleRejectPayment(notification) {
    const settlementId = notification.data?.settlementId;
    const groupId = notification.groupId || notification.data?.groupId;
    if (!settlementId || !groupId) return;

    const reason = window.prompt('Reason for rejecting payment (optional):', 'Payment not received');
    if (reason === null) return; // User cancelled prompt

    setActionLoading((prev) => ({ ...prev, [notification.id]: 'rejecting' }));
    try {
      await api.post(`/api/groups/${groupId}/settlements/${settlementId}/reject`, { reason });
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === notification.id ? { ...n, actionTaken: 'rejected', isRead: true } : n
        )
      );
      if (onActionTaken) onActionTaken();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to reject payment');
    } finally {
      setActionLoading((prev) => ({ ...prev, [notification.id]: null }));
    }
  }

  if (!isOpen) return null;

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="notifications-modal-title"
    >
      <div className="modal-box" style={{ maxWidth: '540px', maxHeight: '88vh', overflowY: 'auto' }}>
        <button
          className="modal-close"
          onClick={onClose}
          aria-label="Close notifications"
        >
          ✕
        </button>

        <div className="card-header" style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: 'var(--space-3)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', paddingRight: '24px' }}>
            <div>
              <h2 id="notifications-modal-title" className="card-title">Notifications</h2>
              <div className="card-subtitle">Payment confirmation requests & activity alerts</div>
            </div>
            {notifications.some((n) => !n.isRead) && (
              <button
                type="button"
                className="btn-ghost"
                style={{ fontSize: '12px', height: '28px', padding: '0 8px' }}
                onClick={handleMarkAllRead}
              >
                Mark all read
              </button>
            )}
          </div>
        </div>

        {error && <div className="error-text" style={{ marginTop: 'var(--space-3)' }}>{error}</div>}

        {loading ? (
          <div style={{ padding: 'var(--space-8) 0', textAlign: 'center', color: 'var(--text-secondary)' }}>
            Loading notifications…
          </div>
        ) : notifications.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: 'var(--space-10) var(--space-4)',
              background: 'var(--bg-subtle)',
              borderRadius: 'var(--radius-md)',
              margin: 'var(--space-4) 0',
              color: 'var(--text-secondary)',
            }}
          >
            <div style={{ fontSize: '28px', marginBottom: '8px' }}>🔔</div>
            <p>No notifications at the moment. You are all caught up!</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
            {notifications.map((notif) => {
              const isPaymentRequest = notif.type === 'payment_confirmation_request';
              const isConfirmed = notif.type === 'payment_confirmed' || notif.actionTaken === 'confirmed';
              const isRejected = notif.type === 'payment_rejected' || notif.actionTaken === 'rejected';
              const isPendingAction = isPaymentRequest && !notif.actionTaken;

              const dateStr = new Date(notif.createdAt).toLocaleString(undefined, {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              });

              return (
                <div
                  key={notif.id}
                  style={{
                    background: notif.isRead ? 'var(--bg-surface)' : 'var(--bg-subtle)',
                    border: `1px solid ${notif.isRead ? 'var(--border-subtle)' : 'var(--border-hover)'}`,
                    borderRadius: 'var(--radius-md)',
                    padding: 'var(--space-3) var(--space-4)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'var(--space-2)',
                    boxShadow: notif.isRead ? 'none' : 'var(--shadow-xs)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '16px' }}>
                        {isPaymentRequest ? '💳' : isConfirmed ? '✅' : isRejected ? '❌' : '🔔'}
                      </span>
                      <strong style={{ fontSize: '13.5px', color: 'var(--text-primary)' }}>
                        {notif.title}
                      </strong>
                    </div>
                    <span style={{ fontSize: '11.5px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {dateStr}
                    </span>
                  </div>

                  <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)' }}>
                    {notif.message}
                  </p>

                  {/* ── Direct Action Buttons for Payment Requests ── */}
                  {isPendingAction && (
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '4px', borderTop: '1px solid var(--border-subtle)', paddingTop: '8px' }}>
                      <button
                        type="button"
                        id={`reject-notif-btn-${notif.id}`}
                        className="btn-danger"
                        style={{ height: '30px', fontSize: '12px', padding: '0 12px' }}
                        onClick={() => handleRejectPayment(notif)}
                        disabled={!!actionLoading[notif.id]}
                      >
                        {actionLoading[notif.id] === 'rejecting' ? 'Rejecting…' : 'Reject Payment'}
                      </button>
                      <button
                        type="button"
                        id={`confirm-notif-btn-${notif.id}`}
                        className="btn-primary"
                        style={{ height: '30px', fontSize: '12px', padding: '0 14px', backgroundColor: 'var(--success)', borderColor: 'var(--success)' }}
                        onClick={() => handleConfirmPayment(notif)}
                        disabled={!!actionLoading[notif.id]}
                      >
                        {actionLoading[notif.id] === 'confirming' ? 'Confirming…' : 'Confirm as Paid'}
                      </button>
                    </div>
                  )}

                  {notif.actionTaken && (
                    <div style={{ fontSize: '12px', fontWeight: 600, color: notif.actionTaken === 'confirmed' ? 'var(--success)' : 'var(--danger)', marginTop: '2px' }}>
                      {notif.actionTaken === 'confirmed' ? '✓ You confirmed this payment' : '✕ You rejected this payment'}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--space-5)' }}>
          <button
            type="button"
            className="btn-secondary"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
