import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';

export default function ShareModal({ groupId, groupName, onClose }) {
  const canvasRef = useRef(null);
  const [copied, setCopied] = useState(false);

  const inviteUrl = `${window.location.origin}/join/${groupId}`;

  // Generate QR code on canvas
  useEffect(() => {
    if (canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, inviteUrl, {
        width: 200,
        margin: 1,
        color: { dark: '#18181b', light: '#ffffff' },
      });
    }
  }, [inviteUrl]);

  // Close on Escape key
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback for older browsers
      const input = document.createElement('input');
      input.value = inviteUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div
      className="modal-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label={`Invite link for ${groupName}`}
    >
      <div className="modal-box" style={{ maxWidth: '380px', textAlign: 'center' }}>
        <button
          id="share-modal-close"
          className="modal-close"
          onClick={onClose}
          aria-label="Close"
        >
          ✕
        </button>

        <div className="card-header" style={{ justifyContent: 'center' }}>
          <h2 className="card-title" style={{ fontSize: '16px' }}>Invite to {groupName}</h2>
        </div>

        <div className="qr-wrapper">
          <div className="qr-canvas-wrap">
            <canvas ref={canvasRef} id="share-qr-canvas" />
          </div>

          <div className="invite-url-row">
            <span className="invite-url-text" title={inviteUrl}>
              {inviteUrl}
            </span>
            <button
              id="copy-invite-link-btn"
              className="copy-btn btn-primary"
              onClick={handleCopy}
            >
              {copied ? '✓ Copied' : 'Copy link'}
            </button>
          </div>
        </div>

        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0 }}>
          Share the link or QR code. Anyone who opens it can request to join, and you can approve them directly from the group page.
        </p>
      </div>
    </div>
  );
}
