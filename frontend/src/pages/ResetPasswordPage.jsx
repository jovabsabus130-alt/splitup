import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import api from '../lib/api';

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const initialEmail = location.state?.email || sessionStorage.getItem('pending_reset_email') || '';
  const [email, setEmail] = useState(initialEmail);
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState(location.state?.message || '');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setMessage('');

    if (!email.trim()) {
      setError('Please provide your email address.');
      return;
    }

    if (otp.trim().length !== 6) {
      setError('Reset code must be 6 digits.');
      return;
    }

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);

    try {
      const payload = {
        email: email.trim(),
        otp: otp.trim(),
        newPassword,
      };

      const { data } = await api.post('/api/auth/reset-password', payload);
      setMessage(data?.message || 'Password reset successful! Redirecting to login…');
      sessionStorage.removeItem('pending_reset_email');

      setTimeout(() => {
        navigate('/login', { state: { email: payload.email, resetSuccess: true } });
      }, 1500);
    } catch (apiError) {
      setError(apiError.response?.data?.message || 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-brand-mark">🔑</div>
          <h1>Set New Password</h1>
          <p>Enter the 6-digit code sent to your email and your new password</p>
        </div>

        <form onSubmit={handleSubmit} className="form-grid">
          <label className="form-label">
            Email Address
            <input
              type="email"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>

          <label className="form-label">
            6-Digit Reset Code
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="123456"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              required
              style={{ letterSpacing: '0.25em', textAlign: 'center', fontSize: '18px', fontWeight: 700 }}
              autoFocus
            />
          </label>

          <label className="form-label">
            New Password
            <input
              type="password"
              placeholder="At least 6 characters"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={6}
            />
          </label>

          <label className="form-label">
            Confirm New Password
            <input
              type="password"
              placeholder="Repeat new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={6}
            />
          </label>

          {error ? <div className="error-text">{error}</div> : null}
          {message ? <div className="success-text">{message}</div> : null}

          <button
            type="submit"
            id="reset-password-btn"
            className="btn-primary"
            disabled={loading}
            style={{ width: '100%', marginTop: 'var(--space-1)' }}
          >
            {loading ? 'Resetting password…' : 'Update Password'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 'var(--space-2)', fontSize: '13px' }}>
          <span style={{ color: 'var(--text-secondary)' }}>Back to </span>
          <Link to="/login" style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
            Sign in
          </Link>
          <span style={{ color: 'var(--text-secondary)' }}> or </span>
          <Link to="/forgot-password" style={{ color: 'var(--brand-primary, #6366f1)', fontWeight: 600 }}>
            Request new code
          </Link>
        </div>
      </div>
    </div>
  );
}
