import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { useNavigation } from '../lib/NavigationContext';

function getNotificationIcon(type) {
  switch (type) {
    case 'payment_confirmation_request':
      return '💳';
    case 'payment_confirmed':
      return '✅';
    case 'payment_rejected':
      return '❌';
    case 'group_invitation':
    case 'group_member_added':
      return '👥';
    case 'join_request':
      return '🚪';
    case 'join_request_approved':
      return '🎉';
    case 'join_request_denied':
      return '🚫';
    case 'expense_created':
      return '💰';
    case 'expense_edited':
      return '📝';
    case 'concern_raised':
      return '🚩';
    case 'concern_responded':
      return '💬';
    default:
      return '🔔';
  }
}

export default function NotificationsModal({ isOpen, onClose, onActionTaken }) {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState({});

  const { notificationPermission, requestPermission, sendTestNotification } = useNavigation();

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
      if (onActionTaken) onActionTaken();
    } catch {}
  }

  async function handleMarkSingleRead(notifId) {
    try {
      await api.patch(`/api/notifications/${notifId}/read`);
      setNotifications((prev) =>
        prev.map((n) => (n.id === notifId ? { ...n, isRead: true } : n))
      );
      if (onActionTaken) onActionTaken();
    } catch {}
  }

  async function handleNotificationClick(notification) {
    if (!notification.isRead) {
      await handleMarkSingleRead(notification.id);
    }

    const targetGroupId = notification.groupId || notification.data?.groupId;
    if (targetGroupId) {
      onClose();
      navigate(`/groups/${targetGroupId}`);
    }
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
      <div className="modal-box" style={{ maxWidth: '560px', maxHeight: '88vh', overflowY: 'auto' }}>
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
              <div className="card-subtitle">Activity alerts, group updates & financial requests</div>
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

        {/* System Notification Bar Device Alerts Banner */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          padding: '10px 14px',
          borderRadius: 'var(--radius-md)',
          background: notificationPermission === 'granted' ? 'rgba(16, 185, 129, 0.08)' : notificationPermission === 'denied' ? 'rgba(239, 68, 68, 0.08)' : 'rgba(99, 102, 241, 0.08)',
          border: `1px solid ${notificationPermission === 'granted' ? 'rgba(16, 185, 129, 0.25)' : notificationPermission === 'denied' ? 'rgba(239, 68, 68, 0.25)' : 'rgba(99, 102, 241, 0.25)'}`,
          marginTop: 'var(--space-1)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '16px' }}>{notificationPermission === 'granted' ? '🔔' : notificationPermission === 'denied' ? '⚠️' : '🔕'}</span>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-primary)' }}>
                {notificationPermission === 'granted' ? 'Device Notification Bar Active' : notificationPermission === 'denied' ? 'Notifications Blocked in Browser' : 'Notification Bar Alerts'}
              </span>
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                {notificationPermission === 'granted'
                  ? 'Receive alerts even when SplitUp is in the background'
                  : notificationPermission === 'denied'
                  ? 'Click the site info/lock icon 🔒 next to the URL to allow notifications'
                  : 'Get alerts in device notification bar when tab is closed'}
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
            {notificationPermission !== 'granted' ? (
              <button
                type="button"
                className="btn-primary"
                style={{ fontSize: '12px', padding: '4px 10px', minHeight: '30px' }}
                onClick={requestPermission}
              >
                {notificationPermission === 'denied' ? 'Help / Allow' : 'Turn On'}
              </button>
            ) : (
              <button
                type="button"
                className="btn-secondary"
                style={{ fontSize: '11.5px', padding: '4px 8px', minHeight: '30px' }}
                onClick={sendTestNotification}
                title="Send a test notification to your system notification bar"
              >
                Test Alert
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
              const isPendingAction = isPaymentRequest && !notif.actionTaken;
              const hasGroup = Boolean(notif.groupId || notif.data?.groupId);
              const icon = getNotificationIcon(notif.type);

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
                    cursor: hasGroup && !isPendingAction ? 'pointer' : 'default',
                    transition: 'background 0.15s ease',
                  }}
                  onClick={() => {
                    if (hasGroup && !isPendingAction) {
                      handleNotificationClick(notif);
                    }
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '16px' }}>
                        {icon}
                      </span>
                      <strong style={{ fontSize: '13.5px', color: 'var(--text-primary)' }}>
                        {notif.title}
                      </strong>
                      {!notif.isRead && (
                        <span
                          style={{
                            width: '7px',
                            height: '7px',
                            borderRadius: '50%',
                            backgroundColor: 'var(--accent-primary)',
                            display: 'inline-block',
                          }}
                          title="Unread"
                        />
                      )}
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
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRejectPayment(notif);
                        }}
                        disabled={!!actionLoading[notif.id]}
                      >
                        {actionLoading[notif.id] === 'rejecting' ? 'Rejecting…' : 'Reject Payment'}
                      </button>
                      <button
                        type="button"
                        id={`confirm-notif-btn-${notif.id}`}
                        className="btn-primary"
                        style={{ height: '30px', fontSize: '12px', padding: '0 14px', backgroundColor: 'var(--success)', borderColor: 'var(--success)' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleConfirmPayment(notif);
                        }}
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

                  {/* ── Quick Jump Link ── */}
                  {hasGroup && !isPendingAction && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '2px' }}>
                      <span style={{ fontSize: '11.5px', color: 'var(--accent-primary)', fontWeight: 500 }}>
                        Open Group ➔
                      </span>
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
