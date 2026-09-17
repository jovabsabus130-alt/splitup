import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import api from '../lib/api';

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const initialEmail = location.state?.email || sessionStorage.getItem('pending_reset_email') || '';
  const [email, setEmail] = useState(initialEmail);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    try {
      const payload = { email: email.trim() };
      const { data } = await api.post('/api/auth/forgot-password', payload);
      setMessage(data?.message || 'If an account exists with that email, a password reset code has been sent.');
      
      // Store in session and offer transition to reset page
      sessionStorage.setItem('pending_reset_email', payload.email);
      setTimeout(() => {
        navigate('/reset-password', { state: { email: payload.email, message: data?.message } });
      }, 1800);
    } catch (apiError) {
      setError(apiError.response?.data?.message || 'Failed to process request');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-brand-mark">🔒</div>
          <h1>Forgot Password</h1>
          <p>Enter your account email to receive a password reset code</p>
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
              autoFocus
            />
          </label>

          {error ? <div className="error-text">{error}</div> : null}
          {message ? <div className="success-text">{message}</div> : null}

          <button
            type="submit"
            id="forgot-password-btn"
            className="btn-primary"
            disabled={loading}
            style={{ width: '100%', marginTop: 'var(--space-1)' }}
          >
            {loading ? 'Sending code…' : 'Send Reset Code'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 'var(--space-2)', fontSize: '13px' }}>
          <span style={{ color: 'var(--text-secondary)' }}>Remembered your password? </span>
          <Link to="/login" style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
