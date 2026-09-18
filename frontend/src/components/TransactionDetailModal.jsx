import { useState } from 'react';

export default function TransactionDetailModal({
  expense,
  group,
  members = [],
  currentUserId,
  onClose,
  onEdit,
  onFlag,
  onDelete,
  onHistory,
}) {
  const [copied, setCopied] = useState(false);

  if (!expense) return null;

  const isDeleted = Boolean(expense.isDeleted);
  const isEdited = !isDeleted && (expense.isEdited || (expense.editHistory && expense.editHistory.length > 0));
  const isPayer = Boolean(
    expense.paidById === currentUserId ||
    expense.paidBy?.id === currentUserId ||
    expense.payer?.id === currentUserId ||
    expense.payer?.isYou
  );

  const isCreator = Boolean(
    expense.createdById
      ? (expense.createdById === currentUserId || expense.createdBy?.id === currentUserId)
      : (expense.paidById === currentUserId || expense.paidBy?.id === currentUserId)
  );

  const payerName = isPayer
    ? 'You'
    : expense.paidBy?.name || expense.payer?.name || 'Someone';

  const groupName = group?.name || expense.group?.name || expense.groupName || 'Group';
  const category = expense.category || 'General';
  const description = expense.description || category;
  const amount = Number(expense.amount || 0);

  const dateObj = expense.date || expense.createdAt ? new Date(expense.date || expense.createdAt) : new Date();
  const formattedFullDate = dateObj.toLocaleDateString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  const formattedTime = dateObj.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });

  const splits = expense.splits || [];
  const mySplit = splits.find(
    (s) => s.userId === currentUserId || s.user?.id === currentUserId
  );

  const concerns = expense.concerns || [];
  const pendingConcerns = concerns.filter((c) => c.status === 'pending');
  const hasConcerns = concerns.length > 0;

  // Category Icon helper
  function getCategoryEmoji(cat) {
    const lower = String(cat || '').toLowerCase();
    if (lower.includes('food') || lower.includes('dinner') || lower.includes('lunch') || lower.includes('snack') || lower.includes('restaurant')) return '🍔';
    if (lower.includes('transport') || lower.includes('travel') || lower.includes('fuel') || lower.includes('uber') || lower.includes('cab')) return '🚕';
    if (lower.includes('shopping') || lower.includes('grocer') || lower.includes('mart')) return '🛍️';
    if (lower.includes('utilit') || lower.includes('bill') || lower.includes('wifi') || lower.includes('electric')) return '💡';
    if (lower.includes('entertain') || lower.includes('movie') || lower.includes('party')) return '🎬';
    if (lower.includes('health') || lower.includes('medic')) return '🏥';
    if (lower.includes('rent') || lower.includes('stay') || lower.includes('hotel')) return '🏠';
    return '📦';
  }

  function handleCopyDetails() {
    const splitSummary = splits
      .map((s) => {
        const name = s.userId === currentUserId || s.user?.id === currentUserId
          ? 'You'
          : s.user?.name || s.userName || 'Member';
        return `• ${name}: ₹${Number(s.share || 0).toFixed(2)}`;
      })
      .join('\n');

    const textToCopy = `🧾 SplitUp Transaction: ${description}\n` +
      `💰 Total: ₹${amount.toFixed(2)}\n` +
      `👤 Paid by: ${payerName}\n` +
      `🏷️ Category: ${category}\n` +
      `👥 Group: ${groupName}\n` +
      `📅 Date: ${formattedFullDate} at ${formattedTime}\n\n` +
      `📊 Splits:\n${splitSummary}`;

    navigator.clipboard?.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="tx-detail-modal-title"
    >
      <div
        className="modal-box"
        style={{
          maxWidth: '520px',
          maxHeight: '90vh',
          overflowY: 'auto',
          padding: 'var(--space-5)',
          gap: 'var(--space-4)',
          position: 'relative',
        }}
      >
        {/* Close Button */}
        <button
          type="button"
          className="modal-close"
          onClick={onClose}
          aria-label="Close transaction details"
          style={{ top: '14px', right: '14px' }}
        >
          ✕
        </button>

        {/* Top Badges Row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', paddingRight: '32px' }}>
          <span className="category-tag" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <span>{getCategoryEmoji(category)}</span>
            <span>{category}</span>
          </span>

          <span
            style={{
              fontSize: '11.5px',
              fontWeight: 600,
              padding: '2px 8px',
              borderRadius: 'var(--radius-full)',
              backgroundColor: 'var(--bg-subtle)',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            👥 {groupName}
          </span>

          {isDeleted && (
            <span
              className="admin-pill"
              style={{
                fontSize: '11px',
                padding: '2px 8px',
                background: 'var(--danger-bg)',
                color: 'var(--danger-text)',
                borderColor: 'var(--danger-border)',
                fontWeight: 700,
              }}
            >
              DELETED 🗑️
            </span>
          )}

          {isEdited && (
            <span
              className="admin-pill"
              style={{
                fontSize: '11px',
                padding: '2px 8px',
                background: 'var(--warning-bg)',
                color: 'var(--warning-text)',
                borderColor: 'var(--warning-border)',
                fontWeight: 600,
              }}
            >
              EDITED 📝
            </span>
          )}

          {hasConcerns && (
            <span
              className="admin-pill"
              style={{
                fontSize: '11px',
                padding: '2px 8px',
                background: pendingConcerns.length > 0 ? 'var(--warning-bg)' : 'var(--success-bg)',
                color: pendingConcerns.length > 0 ? 'var(--warning-text)' : 'var(--success-text)',
                borderColor: pendingConcerns.length > 0 ? 'var(--warning-border)' : 'var(--success-border)',
                fontWeight: 600,
              }}
            >
              🚩 {pendingConcerns.length > 0 ? `${pendingConcerns.length} Flagged` : 'Resolved'}
            </span>
          )}
        </div>

        {/* Hero Card: Amount & Full Description */}
        <div
          style={{
            backgroundColor: isDeleted ? 'var(--bg-subtle)' : 'var(--bg-card)',
            border: isDeleted ? '1px dashed var(--danger-border)' : '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--space-4)',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 700 }}>
                Transaction Description
              </div>
              <h2
                id="tx-detail-modal-title"
                style={{
                  fontSize: '17px',
                  fontWeight: 700,
                  color: isDeleted ? 'var(--text-muted)' : 'var(--text-primary)',
                  textDecoration: isDeleted ? 'line-through' : 'none',
                  margin: '4px 0 0 0',
                  lineHeight: 1.35,
                  wordBreak: 'break-word',
                }}
              >
                {description}
              </h2>
            </div>

            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 700 }}>
                Total Amount
              </div>
              <div
                style={{
                  fontSize: '20px',
                  fontWeight: 800,
                  color: isDeleted ? 'var(--danger-text)' : 'var(--text-primary)',
                  textDecoration: isDeleted ? 'line-through' : 'none',
                  fontVariantNumeric: 'tabular-nums',
                  marginTop: '2px',
                }}
              >
                ₹{amount.toFixed(2)}
              </div>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '6px',
              paddingTop: '8px',
              borderTop: '1px solid var(--border-subtle)',
              fontSize: '12px',
            }}
          >
            <div style={{ color: 'var(--text-secondary)' }}>
              Paid by <strong style={{ color: 'var(--text-primary)' }}>{payerName}</strong>
            </div>
            <div style={{ color: 'var(--text-muted)' }}>
              📅 {formattedFullDate} • {formattedTime}
            </div>
          </div>
        </div>

        {/* Your Share Callout */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '10px 14px',
            backgroundColor: isDeleted ? 'var(--danger-bg)' : 'var(--bg-subtle)',
            borderRadius: 'var(--radius-sm)',
            border: isDeleted ? '1px solid var(--danger-border)' : '1px solid var(--border-subtle)',
            fontSize: '13px',
          }}
        >
          <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>
            {isPayer ? 'Your Net Contribution' : 'Your Share in this Expense'}
          </span>
          <span
            style={{
              fontWeight: 700,
              fontVariantNumeric: 'tabular-nums',
              fontSize: '14.5px',
              color: isDeleted ? 'var(--danger-text)' : mySplit ? 'var(--text-primary)' : 'var(--text-muted)',
              textDecoration: isDeleted ? 'line-through' : 'none',
            }}
          >
            {isDeleted
              ? `₹${Number(mySplit?.share || 0).toFixed(2)} (Voided)`
              : mySplit
                ? `₹${Number(mySplit.share).toFixed(2)}`
                : 'Not Included (₹0.00)'}
          </span>
        </div>

        {/* Participant Splits Breakdown */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
              Split Breakdown ({splits.length} {splits.length === 1 ? 'person' : 'people'})
            </span>
            <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
              {amount > 0 ? `100% of ₹${amount.toFixed(2)}` : ''}
            </span>
          </div>

          {splits.length === 0 ? (
            <div style={{ fontSize: '12.5px', color: 'var(--text-muted)', textAlign: 'center', padding: '12px 0' }}>
              No split participant details recorded.
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                maxHeight: '180px',
                overflowY: 'auto',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                padding: '6px',
                backgroundColor: 'var(--bg-surface)',
              }}
            >
              {splits.map((split, index) => {
                const sUserId = split.userId || split.user?.id;
                const isYou = sUserId === currentUserId;
                const sUserName = isYou
                  ? 'You'
                  : split.user?.name || split.userName || `Member ${index + 1}`;
                const sShare = Number(split.share || 0);
                const isPayerMember = sUserId === (expense.paidById || expense.paidBy?.id || expense.payer?.id);
                const percent = amount > 0 ? ((sShare / amount) * 100).toFixed(1) : '0.0';

                return (
                  <div
                    key={split.id || sUserId || index}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '6px 10px',
                      backgroundColor: isYou ? 'var(--bg-subtle)' : 'transparent',
                      borderRadius: 'var(--radius-xs)',
                      fontSize: '12.5px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div
                        style={{
                          width: '22px',
                          height: '22px',
                          borderRadius: '50%',
                          backgroundColor: isYou ? 'var(--accent-primary)' : 'var(--border-subtle)',
                          color: isYou ? '#fff' : 'var(--text-secondary)',
                          fontSize: '10px',
                          fontWeight: 700,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {sUserName.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <span style={{ fontWeight: isYou ? 700 : 500, color: 'var(--text-primary)' }}>
                          {sUserName}
                        </span>
                        {isPayerMember && (
                          <span
                            style={{
                              marginLeft: '6px',
                              fontSize: '10px',
                              padding: '1px 5px',
                              borderRadius: '4px',
                              backgroundColor: 'var(--accent-subtle)',
                              color: 'var(--accent-primary)',
                              fontWeight: 600,
                            }}
                          >
                            Payer
                          </span>
                        )}
                      </div>
                    </div>

                    <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {percent}%
                      </span>
                      <strong style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>
                        ₹{sShare.toFixed(2)}
                      </strong>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Flag Concerns Notice */}
        {hasConcerns && (
          <div
            style={{
              padding: '10px 12px',
              backgroundColor: pendingConcerns.length > 0 ? 'var(--warning-bg)' : 'var(--success-bg)',
              border: `1px solid ${pendingConcerns.length > 0 ? 'var(--warning-border)' : 'var(--success-border)'}`,
              borderRadius: 'var(--radius-sm)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <div style={{ fontSize: '12px', color: pendingConcerns.length > 0 ? 'var(--warning-text)' : 'var(--success-text)' }}>
              <strong>🚩 {concerns.length} {concerns.length === 1 ? 'Flag/Concern' : 'Flags/Concerns'} Raised</strong>
              <div style={{ fontSize: '11px', opacity: 0.9 }}>
                {pendingConcerns.length > 0
                  ? `${pendingConcerns.length} pending response or resolution`
                  : 'All concerns on this transaction resolved'}
              </div>
            </div>
            {onFlag && (
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  onClose();
                  onFlag(expense);
                }}
                style={{
                  fontSize: '11.5px',
                  fontWeight: 600,
                  height: '28px',
                  padding: '0 8px',
                  background: 'rgba(255,255,255,0.2)',
                  color: pendingConcerns.length > 0 ? 'var(--warning-text)' : 'var(--success-text)',
                }}
              >
                View Discussion ➔
              </button>
            )}
          </div>
        )}

        {/* Action Buttons Box */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingTop: 'var(--space-2)',
            borderTop: '1px solid var(--border-subtle)',
          }}
        >
          {/* Quick Copy Summary */}
          <button
            type="button"
            className="btn-ghost"
            onClick={handleCopyDetails}
            style={{
              fontSize: '12px',
              padding: '4px 8px',
              height: '32px',
              color: 'var(--text-secondary)',
            }}
            title="Copy transaction summary to clipboard"
          >
            {copied ? '✓ Copied' : '📋 Copy Info'}
          </button>

          {/* Right Action Options: Edit, Flag, Delete, History */}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
            {/* Audit History (if edited or deleted) */}
            {(isEdited || isDeleted) && onHistory && (
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  onClose();
                  onHistory(expense);
                }}
                style={{ fontSize: '12px', height: '32px', padding: '0 10px', background: 'var(--bg-subtle)' }}
              >
                📜 Audit History
              </button>
            )}

            {/* Flag / Concern Button (available for non-payers to dispute/flag) */}
            {!isPayer && onFlag && (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  onClose();
                  onFlag(expense);
                }}
                style={{
                  fontSize: '12px',
                  height: '32px',
                  padding: '0 10px',
                  borderColor: hasConcerns ? 'var(--warning-border)' : undefined,
                  color: hasConcerns ? 'var(--warning-text)' : undefined,
                }}
                title="Flag an issue or view discussion"
              >
                🚩 {hasConcerns ? 'Discussions' : 'Flag'}
              </button>
            )}

            {/* Edit Button (available strictly for the person who logged/created the transaction) */}
            {!isDeleted && !expense.isEdited && isCreator && onEdit && (
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  onClose();
                  onEdit(expense);
                }}
                style={{ fontSize: '12px', height: '32px', padding: '0 12px' }}
                title="Edit transaction details and splits (available to transaction creator)"
              >
                ✏️ Edit
              </button>
            )}

            {/* Delete Button */}
            {!isDeleted && onDelete && (isPayer || group?.adminId === currentUserId) && (
              <button
                type="button"
                className="btn-danger"
                onClick={() => {
                  onClose();
                  onDelete(expense);
                }}
                style={{ fontSize: '12px', height: '32px', padding: '0 10px' }}
                title="Delete transaction"
              >
                🗑️ Delete
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
