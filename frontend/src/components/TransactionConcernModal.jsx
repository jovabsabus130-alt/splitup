import { useEffect, useState } from 'react';
import api from '../lib/api';

export default function TransactionConcernModal({ groupId, expense, currentUserId, onClose, onConcernUpdated }) {
  const [concerns, setConcerns] = useState(expense.concerns || []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // New Concern Form State
  const [reason, setReason] = useState('');
  const [submittingConcern, setSubmittingConcern] = useState(false);
  const [showRaiseForm, setShowRaiseForm] = useState(false);

  // Response Form State map keyed by concernId
  const [responses, setResponses] = useState({});
  const [submittingResponseId, setSubmittingResponseId] = useState(null);

  const isPayer = Boolean(
    expense.paidById === currentUserId ||
    expense.paidBy?.id === currentUserId ||
    expense.payer?.id === currentUserId ||
    expense.payer?.isYou
  );

  const effectiveGroupId = groupId || expense.groupId || expense.group?.id;
  const expenseDesc = expense.description || expense.category || 'Transaction';
  const expenseAmount = Number(expense.amount || 0).toFixed(2);
  const payerName = expense.payer?.name || expense.paidBy?.name || 'Payer';

  async function fetchConcerns() {
    if (!effectiveGroupId || !expense?.id) return;
    try {
      const { data } = await api.get(`/api/groups/${effectiveGroupId}/expenses/${expense.id}/concerns`);
      setConcerns(data.concerns || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load transaction concerns');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchConcerns();
  }, [effectiveGroupId, expense?.id]);

  async function handleRaiseConcern(e) {
    e.preventDefault();
    if (!reason.trim()) return;

    setSubmittingConcern(true);
    setError('');
    setSuccessMsg('');

    try {
      const { data } = await api.post(`/api/groups/${effectiveGroupId}/expenses/${expense.id}/concerns`, {
        reason: reason.trim(),
      });

      setSuccessMsg('Concern raised successfully. The payer has been notified.');
      setReason('');
      setShowRaiseForm(false);
      await fetchConcerns();
      if (onConcernUpdated) onConcernUpdated(data.concern);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to raise concern');
    } finally {
      setSubmittingConcern(false);
    }
  }

  async function handleRespondToConcern(concernId, status = 'resolved') {
    const responseText = (responses[concernId] || '').trim();
    if (!responseText) {
      setError('Please provide a response before submitting.');
      return;
    }

    setSubmittingResponseId(concernId);
    setError('');
    setSuccessMsg('');

    try {
      const { data } = await api.patch(
        `/api/groups/${effectiveGroupId}/expenses/${expense.id}/concerns/${concernId}/respond`,
        {
          payerResponse: responseText,
          status,
        }
      );

      setSuccessMsg(`Response submitted and marked as ${status}.`);
      setResponses((prev) => ({ ...prev, [concernId]: '' }));
      await fetchConcerns();
      if (onConcernUpdated) onConcernUpdated(data.concern);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to submit response');
    } finally {
      setSubmittingResponseId(null);
    }
  }

  const pendingCount = concerns.filter((c) => c.status === 'pending').length;
  const resolvedCount = concerns.filter((c) => c.status === 'resolved').length;

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="concern-modal-title"
    >
      <div className="modal-box" style={{ maxWidth: '620px', maxHeight: '88vh', overflowY: 'auto' }}>
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
              <h2 id="concern-modal-title" className="card-title">Transaction Flags & Concerns</h2>
              {concerns.length > 0 && (
                <span
                  className="admin-pill"
                  style={{
                    background: pendingCount > 0 ? 'var(--warning-bg)' : 'var(--success-bg)',
                    color: pendingCount > 0 ? 'var(--warning-text)' : 'var(--success-text)',
                    borderColor: pendingCount > 0 ? 'var(--warning-border)' : 'var(--success-border)',
                  }}
                >
                  {pendingCount > 0 ? `⚠️ ${pendingCount} Pending` : `✅ ${resolvedCount} Resolved`}
                </span>
              )}
            </div>
            <div className="card-subtitle">
              {expenseDesc} &bull; <strong>₹{expenseAmount}</strong> &bull; Paid by {payerName}
            </div>
          </div>
        </div>

        {error && <div className="error-text" style={{ marginTop: 'var(--space-3)' }}>{error}</div>}
        {successMsg && <div className="success-banner" style={{ marginTop: 'var(--space-3)', padding: '8px 12px', fontSize: '13px', borderRadius: 'var(--radius-sm)' }}>{successMsg}</div>}

        {/* ── Action to Raise a Concern (Non-payers only) ── */}
        {!isPayer && (
          <div style={{ marginTop: 'var(--space-4)' }}>
            {!showRaiseForm ? (
              <button
                type="button"
                className="btn-secondary"
                style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px' }}
                onClick={() => setShowRaiseForm(true)}
              >
                <span>🚩</span>
                <span>Raise a Concern on this Transaction</span>
              </button>
            ) : (
              <form onSubmit={handleRaiseConcern} className="card" style={{ padding: 'var(--space-4)', background: 'var(--bg-subtle)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <strong style={{ fontSize: '13.5px', color: 'var(--text-primary)' }}>Raise a Concern / Flag</strong>
                  <button
                    type="button"
                    className="btn-ghost"
                    style={{ height: '24px', fontSize: '12px', padding: '0 6px' }}
                    onClick={() => setShowRaiseForm(false)}
                  >
                    Cancel
                  </button>
                </div>
                <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                  Describe what seems incorrect (e.g. split proportion, item price, unauthorized expense). The payer will be notified immediately.
                </p>
                <textarea
                  placeholder="Explain the issue with this expense…"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  required
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-subtle)',
                    fontSize: '13px',
                    fontFamily: 'inherit',
                    resize: 'vertical',
                    background: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                  }}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => setShowRaiseForm(false)}
                    disabled={submittingConcern}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn-primary"
                    disabled={submittingConcern || !reason.trim()}
                  >
                    {submittingConcern ? 'Submitting…' : 'Submit Concern 🚩'}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* ── Concerns List / Audit Timeline ── */}
        <div style={{ marginTop: 'var(--space-4)' }}>
          <h3 style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 'var(--space-3)' }}>
            Recorded Concerns ({concerns.length})
          </h3>

          {loading ? (
            <div style={{ padding: 'var(--space-6) 0', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px' }}>
              Loading transaction concerns…
            </div>
          ) : concerns.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: 'var(--space-6) var(--space-4)',
                background: 'var(--bg-subtle)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--text-secondary)',
                fontSize: '13px',
              }}
            >
              No concerns have been raised on this transaction yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {concerns.map((concern) => {
                const raiserName = concern.raisedBy?.name || (concern.raisedById === currentUserId ? 'You' : 'Group Member');
                const isRaiser = concern.raisedById === currentUserId || concern.raisedBy?.id === currentUserId;
                const formattedDate = new Date(concern.createdAt).toLocaleString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                });
                const resolvedDate = concern.resolvedAt
                  ? new Date(concern.resolvedAt).toLocaleString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : null;

                const isPending = concern.status === 'pending';
                const isResolved = concern.status === 'resolved';

                return (
                  <div
                    key={concern.id}
                    style={{
                      background: 'var(--bg-surface)',
                      border: isPending ? '1px solid var(--warning-border)' : '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-md)',
                      padding: 'var(--space-4)',
                      boxShadow: 'var(--shadow-xs)',
                    }}
                  >
                    {/* Concern Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '14px' }}>🚩</span>
                        <strong style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
                          Raised by {raiserName} {isRaiser ? '(You)' : ''}
                        </strong>
                        <span
                          className="admin-pill"
                          style={{
                            fontSize: '10.5px',
                            padding: '1px 6px',
                            background: isPending ? 'var(--warning-bg)' : isResolved ? 'var(--success-bg)' : 'var(--bg-subtle)',
                            color: isPending ? 'var(--warning-text)' : isResolved ? 'var(--success-text)' : 'var(--text-muted)',
                            borderColor: isPending ? 'var(--warning-border)' : isResolved ? 'var(--success-border)' : 'var(--border-subtle)',
                          }}
                        >
                          {isPending ? 'Pending Review' : isResolved ? 'Resolved' : 'Dismissed'}
                        </span>
                      </div>
                      <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                        {formattedDate}
                      </span>
                    </div>

                    {/* Concern Reason Text */}
                    <div
                      style={{
                        background: 'var(--bg-subtle)',
                        padding: '8px 12px',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: '13px',
                        color: 'var(--text-primary)',
                        lineHeight: 1.4,
                      }}
                    >
                      &ldquo;{concern.reason}&rdquo;
                    </div>

                    {/* Payer Response Display if available */}
                    {concern.payerResponse && (
                      <div
                        style={{
                          marginTop: 'var(--space-3)',
                          padding: '10px 12px',
                          borderRadius: 'var(--radius-sm)',
                          backgroundColor: 'var(--bg-app)',
                          borderLeft: isResolved ? '3px solid var(--success)' : '3px solid var(--text-muted)',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                          <span style={{ fontSize: '11.5px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                            💬 Payer Response ({payerName})
                          </span>
                          {resolvedDate && (
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                              {resolvedDate}
                            </span>
                          )}
                        </div>
                        <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-primary)' }}>
                          {concern.payerResponse}
                        </p>
                      </div>
                    )}

                    {/* Payer Response Form Interface for pending concerns */}
                    {isPayer && isPending && (
                      <div
                        style={{
                          marginTop: 'var(--space-3)',
                          paddingTop: 'var(--space-3)',
                          borderTop: '1px dashed var(--border-subtle)',
                        }}
                      >
                        <div style={{ fontWeight: 600, fontSize: '12px', color: 'var(--accent-primary)', marginBottom: '6px' }}>
                          Respond as Payer
                        </div>
                        <textarea
                          placeholder="Type your explanation or action taken…"
                          rows={2}
                          value={responses[concern.id] || ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            setResponses((prev) => ({ ...prev, [concern.id]: val }));
                          }}
                          style={{
                            width: '100%',
                            padding: '6px 10px',
                            fontSize: '12.5px',
                            borderRadius: 'var(--radius-sm)',
                            border: '1px solid var(--border-subtle)',
                            fontFamily: 'inherit',
                            resize: 'vertical',
                            background: 'var(--bg-surface)',
                            color: 'var(--text-primary)',
                          }}
                        />
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px', marginTop: '6px' }}>
                          <button
                            type="button"
                            className="btn-ghost"
                            style={{ height: '28px', fontSize: '11.5px', padding: '0 8px' }}
                            disabled={submittingResponseId === concern.id || !(responses[concern.id] || '').trim()}
                            onClick={() => handleRespondToConcern(concern.id, 'dismissed')}
                          >
                            Dismiss Concern
                          </button>
                          <button
                            type="button"
                            className="btn-primary"
                            style={{ height: '28px', fontSize: '11.5px', padding: '0 10px' }}
                            disabled={submittingResponseId === concern.id || !(responses[concern.id] || '').trim()}
                            onClick={() => handleRespondToConcern(concern.id, 'resolved')}
                          >
                            {submittingResponseId === concern.id ? 'Submitting…' : 'Mark Resolved ✅'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

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
