import { useState } from 'react';
import api from '../lib/api';

export default function EditProfileModal({ isOpen, onClose, currentUser, onUpdated }) {
  if (!isOpen) return null;

  const [name, setName] = useState(currentUser?.name || '');
  const [upiId, setUpiId] = useState(currentUser?.upiId || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  const initials = name?.trim() ? name.trim().charAt(0).toUpperCase() : (currentUser?.name?.charAt(0).toUpperCase() || 'U');

  async function handleSubmit(e) {
    e.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) {
      setError('Please enter your name.');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const payload = {
        name: cleanName,
        upiId: upiId?.trim() || null,
      };

      const res = await api.put('/api/auth/profile', payload);
      const updatedUser = res.data.user;

      // Update local storage for seamless immediate persistence
      localStorage.setItem('splitup_user', JSON.stringify(updatedUser));
      localStorage.setItem('splitup_custom_name', updatedUser.name);

      // Notify the app
      window.dispatchEvent(new CustomEvent('splitup-user-updated', { detail: updatedUser }));
      
      if (onUpdated) {
        onUpdated(updatedUser);
      }

      setSuccessMsg('Name updated successfully!');
      setTimeout(() => {
        onClose();
      }, 700);
    } catch (err) {
      console.error('Failed to update profile:', err);
      const msg = err.response?.data?.message || err.userMessage || 'Could not update profile. Please try again.';
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
      style={{ zIndex: 1000 }}
    >
      <div className="modal-box" style={{ maxWidth: '420px', padding: '24px' }}>
        <button
          className="modal-close"
          onClick={onClose}
          disabled={saving}
          type="button"
          aria-label="Close"
        >
          ✕
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '20px' }}>
          <div
            style={{
              width: '52px',
              height: '52px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.4rem',
              fontWeight: '700',
              boxShadow: '0 4px 12px rgba(99, 102, 241, 0.35)',
              flexShrink: 0,
            }}
          >
            {initials}
          </div>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: '700', margin: '0 0 2px 0', color: 'var(--text-primary)' }}>
              Edit Profile
            </h2>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Change your display name and payment details
            </p>
          </div>
        </div>

        {error && (
          <div
            style={{
              margin: '0 0 16px 0',
              padding: '10px 14px',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              borderRadius: '10px',
              color: '#dc2626',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div
            style={{
              margin: '0 0 16px 0',
              padding: '10px 14px',
              background: 'rgba(16, 185, 129, 0.12)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              borderRadius: '10px',
              color: '#059669',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontWeight: '600',
            }}
          >
            <span>✓</span>
            <span>{successMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label
              htmlFor="edit-profile-name"
              style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '6px' }}
            >
              Display Name <span style={{ color: '#dc2626' }}>*</span>
            </label>
            <input
              id="edit-profile-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Jovab Sabu"
              required
              maxLength={100}
              autoFocus
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: '10px',
                border: '1px solid var(--border-medium)',
                background: 'var(--bg-input)',
                color: 'var(--text-primary)',
                fontSize: '0.95rem',
                outline: 'none',
              }}
            />
          </div>

          <div>
            <label
              style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '6px' }}
            >
              Email Address
            </label>
            <input
              type="text"
              value={currentUser?.email || ''}
              disabled
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: '10px',
                border: '1px solid var(--border-subtle)',
                background: 'var(--bg-subtle)',
                color: 'var(--text-muted)',
                fontSize: '0.9rem',
                cursor: 'not-allowed',
              }}
            />
          </div>

          <div>
            <label
              htmlFor="edit-profile-upi"
              style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '6px' }}
            >
              UPI ID <span style={{ color: 'var(--text-muted)', fontWeight: '400' }}>(optional for settlements)</span>
            </label>
            <input
              id="edit-profile-upi"
              type="text"
              value={upiId}
              onChange={(e) => setUpiId(e.target.value)}
              placeholder="e.g. username@oksbi"
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: '10px',
                border: '1px solid var(--border-medium)',
                background: 'var(--bg-input)',
                color: 'var(--text-primary)',
                fontSize: '0.95rem',
                outline: 'none',
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '10px' }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={onClose}
              disabled={saving}
              style={{ padding: '8px 16px' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={saving || !name.trim()}
              style={{ padding: '8px 20px', display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
