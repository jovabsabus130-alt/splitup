import { useEffect, useState } from 'react';
import api from '../lib/api';

export default function ExpenseHistoryModal({ groupId, expense, onClose }) {
  const [history, setHistory] = useState(expense.editHistory || []);
  const [loading, setLoading] = useState(!expense.editHistory);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadHistory() {
      if (!groupId || !expense?.id) return;
      try {
        const { data } = await api.get(`/api/groups/${groupId}/expenses/${expense.id}/history`);
        setHistory(data.history || []);
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to load edit history');
      } finally {
        setLoading(false);
      }
    }

    if (!expense.editHistory || expense.editHistory.length === 0) {
      loadHistory();
    } else {
      setLoading(false);
    }
  }, [groupId, expense]);

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="history-modal-title"
    >
      <div className="modal-box" style={{ maxWidth: '580px', maxHeight: '88vh', overflowY: 'auto' }}>
        <button
          className="modal-close"
          onClick={onClose}
          aria-label="Close modal"
        >
          ✕
        </button>

        <div className="card-header" style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: 'var(--space-3)' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h2 id="history-modal-title" className="card-title">Transaction Edit History</h2>
              <span className="admin-pill" style={{ background: 'var(--warning-bg)', color: 'var(--warning-text)', borderColor: 'var(--warning-border)' }}>
                {history.length} {history.length === 1 ? 'Edit' : 'Edits'} Recorded
              </span>
            </div>
            <div className="card-subtitle">
              {expense.description || expense.category} &bull; Current Value: <strong>₹{Number(expense.amount).toFixed(2)}</strong>
            </div>
          </div>
        </div>

        {error && <div className="error-text" style={{ marginTop: 'var(--space-3)' }}>{error}</div>}

        {loading ? (
          <div style={{ padding: 'var(--space-8) 0', textAlign: 'center', color: 'var(--text-secondary)' }}>
            Loading change audit logs…
          </div>
        ) : history.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: 'var(--space-8) var(--space-4)',
              background: 'var(--bg-subtle)',
              borderRadius: 'var(--radius-md)',
              margin: 'var(--space-4) 0',
              color: 'var(--text-secondary)',
            }}
          >
            No prior edits recorded for this transaction. It is currently in its original state.
          </div>
        ) : (
          <div className="edit-history-timeline" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', marginTop: 'var(--space-4)' }}>
            {history.map((record, index) => {
              const editDate = new Date(record.createdAt).toLocaleString(undefined, {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              });

              const editorName = record.editedBy?.name || 'Group Member';
              const changes = Array.isArray(record.changes) ? record.changes : [];

              return (
                <div
                  key={record.id || index}
                  className="edit-history-card"
                  style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    padding: 'var(--space-4)',
                    boxShadow: 'var(--shadow-xs)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      borderBottom: '1px solid var(--border-subtle)',
                      paddingBottom: 'var(--space-2)',
                      marginBottom: 'var(--space-3)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '14px' }}>📝</span>
                      <strong style={{ fontSize: '13.5px', color: 'var(--text-primary)' }}>
                        Edited by {editorName}
                      </strong>
                    </div>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      {editDate}
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {changes.length === 0 ? (
                      <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                        Details updated.
                      </span>
                    ) : (
                      changes.map((ch, chIdx) => (
                        <div
                          key={chIdx}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            background: 'var(--bg-subtle)',
                            padding: '8px 12px',
                            borderRadius: 'var(--radius-sm)',
                            fontSize: '13px',
                          }}
                        >
                          <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>
                            {ch.field}
                          </span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ color: 'var(--danger)', textDecoration: 'line-through' }}>
                              {String(ch.from)}
                            </span>
                            <span style={{ color: 'var(--text-muted)' }}>&rarr;</span>
                            <span style={{ color: 'var(--success)', fontWeight: 600 }}>
                              {String(ch.to)}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
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
