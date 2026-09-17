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
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <h2 id="history-modal-title" className="card-title">
                {expense.isDeleted ? '🗑️ Deleted Transaction Audit History' : 'Transaction Edit History'}
              </h2>
              {expense.isDeleted ? (
                <span className="admin-pill" style={{ background: 'var(--danger-bg)', color: 'var(--danger-text)', borderColor: 'var(--danger-border)', fontWeight: 700 }}>
                  DELETED / VOIDED 🗑️
                </span>
              ) : (
                <span className="admin-pill" style={{ background: 'var(--warning-bg)', color: 'var(--warning-text)', borderColor: 'var(--warning-border)' }}>
                  {history.length} {history.length === 1 ? 'Edit' : 'Edits'} Recorded
                </span>
              )}
            </div>
            <div className="card-subtitle" style={{ marginTop: '4px' }}>
              {expense.description || expense.category} &bull; {expense.isDeleted ? (
                <span>Previous Amount: <strong style={{ color: 'var(--danger)', textDecoration: 'line-through' }}>₹{Number(expense.amount).toFixed(2)}</strong> (Voided)</span>
              ) : (
                <span>Current Value: <strong>₹{Number(expense.amount).toFixed(2)}</strong></span>
              )}
            </div>
          </div>
        </div>

        {expense.isDeleted && (
          <div
            style={{
              marginTop: 'var(--space-3)',
              padding: '10px 14px',
              backgroundColor: 'var(--danger-bg)',
              border: '1px solid var(--danger-border)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--danger-text)',
              fontSize: '12.5px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '8px',
            }}
          >
            <span style={{ fontSize: '16px' }}>⚠️</span>
            <div>
              <strong>This transaction was deleted by its creator.</strong>
              <div style={{ marginTop: '2px', opacity: 0.9 }}>
                It is excluded from all group balances and settlement calculations. The original amount, category, and split allocations are archived below for transparency and audit accountability.
              </div>
            </div>
          </div>
        )}

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
              const previousData = record.previousData;

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

                  {/* Changes Diff Section */}
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

                  {/* Previous State Snapshot Section */}
                  {previousData && (
                    <div
                      style={{
                        marginTop: 'var(--space-3)',
                        paddingTop: 'var(--space-3)',
                        borderTop: '1px dashed var(--border-subtle)',
                        fontSize: '12px',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      <div style={{ fontWeight: 600, marginBottom: '4px', color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: '10.5px', letterSpacing: '0.04em' }}>
                        Previous Transaction Snapshot
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '6px' }}>
                        <span>Amount: <strong>₹{Number(previousData.amount || 0).toFixed(2)}</strong></span>
                        <span>Category: <strong>{previousData.category || 'N/A'}</strong></span>
                        {previousData.description && <span>Description: <em>{previousData.description}</em></span>}
                      </div>
                      {Array.isArray(previousData.splits) && previousData.splits.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
                          <span style={{ color: 'var(--text-muted)' }}>Original Splits:</span>
                          {previousData.splits.map((s, sIdx) => (
                            <span
                              key={sIdx}
                              style={{
                                background: 'var(--bg-subtle)',
                                padding: '1px 6px',
                                borderRadius: '4px',
                                border: '1px solid var(--border-subtle)',
                                fontVariantNumeric: 'tabular-nums',
                              }}
                            >
                              {s.userName || 'Member'}: ₹{Number(s.share || 0).toFixed(2)}
                            </span>
                          ))}
                        </div>
                      )}
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
