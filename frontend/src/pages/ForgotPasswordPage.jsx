import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import api from '../lib/api';

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const initialEmail = location.state?.email || sessionStorage.getItem('pending_reset_email') || '';
  const [email, setEmail] = useState(initialEmail);
  const [error, setError] = useState('');
  const [notRegistered, setNotRegistered] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setMessage('');
    setNotRegistered(false);
    setLoading(true);

    try {
      const payload = { email: email.trim() };
      const { data } = await api.post('/api/auth/forgot-password', payload);
      setMessage(data?.message || 'A password reset code has been sent to your email.');
      
      // Store in session and transition to reset page
      sessionStorage.setItem('pending_reset_email', payload.email);
      setTimeout(() => {
        navigate('/reset-password', { state: { email: payload.email, message: data?.message } });
      }, 1000);
    } catch (apiError) {
      const status = apiError.response?.status;
      const isNotReg = status === 404 || apiError.response?.data?.notRegistered;
      if (isNotReg) {
        setNotRegistered(true);
        setError('No account found with this email address. Please register for a SplitUp account first.');
      } else {
        setError(apiError.response?.data?.message || 'Failed to process request. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  function handleGoToRegister() {
    navigate('/register', { state: { email: email.trim() } });
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
              onChange={(e) => {
                setEmail(e.target.value);
                if (notRegistered) setNotRegistered(false);
              }}
              required
              autoFocus
            />
          </label>

          {error ? <div className="error-text">{error}</div> : null}
          {message ? <div className="success-text">{message}</div> : null}

          {notRegistered ? (
            <button
              type="button"
              onClick={handleGoToRegister}
              className="btn-primary"
              style={{ width: '100%', marginTop: 'var(--space-1)', background: 'linear-gradient(135deg, #10b981, #059669)' }}
            >
              Register with {email} →
            </button>
          ) : (
            <button
              type="submit"
              id="forgot-password-btn"
              className="btn-primary"
              disabled={loading}
              style={{ width: '100%', marginTop: 'var(--space-1)' }}
            >
              {loading ? 'Sending code…' : 'Send Reset Code'}
            </button>
          )}
        </form>

        <div style={{ textAlign: 'center', marginTop: 'var(--space-2)', fontSize: '13px' }}>
          <span style={{ color: 'var(--text-secondary)' }}>Remembered your password? </span>
          <Link to="/login" style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
            Sign in
          </Link>
          <span style={{ color: 'var(--text-secondary)' }}> or </span>
          <Link to="/register" style={{ color: 'var(--brand-primary, #6366f1)', fontWeight: 600 }}>
            Create an account
          </Link>
        </div>
      </div>
    </div>
  );
}
