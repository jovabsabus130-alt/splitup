import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { SignIn } from '@clerk/clerk-react';
import api from '../lib/api';

const isClerkEnabled = Boolean(
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ||
  import.meta.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
);


export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Forgot password states
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotStep, setForgotStep] = useState(1); // 1: enter email, 2: enter otp & new password
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotOtp, setForgotOtp] = useState('');
  const [forgotNewPassword, setForgotNewPassword] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotMsg, setForgotMsg] = useState('');
  const [forgotError, setForgotError] = useState('');

  const redirectPath = location.state?.from?.pathname || '/dashboard';

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { data } = await api.post('/api/auth/login', form);
      localStorage.setItem('token', data.token);
      localStorage.setItem('splitup_token', data.token);
      localStorage.setItem('splitup_user', JSON.stringify(data.user));
      navigate(redirectPath, { replace: true });
    } catch (apiError) {
      setError(apiError.response?.data?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  const [forgotNotRegistered, setForgotNotRegistered] = useState(false);

  async function handleRequestReset(e) {
    e.preventDefault();
    if (!forgotEmail) return;
    setForgotError('');
    setForgotMsg('');
    setForgotNotRegistered(false);
    setForgotLoading(true);
    try {
      const { data } = await api.post('/api/auth/forgot-password', { email: forgotEmail.trim() });
      setForgotMsg(data.message || 'Verification code sent to your email.');
      setForgotStep(2);
    } catch (err) {
      const isNotReg = err.response?.status === 404 || err.response?.data?.notRegistered;
      if (isNotReg) {
        setForgotNotRegistered(true);
        setForgotError('No account found with this email. Please create an account first.');
      } else {
        setForgotError(err.response?.data?.message || 'Failed to send reset code');
      }
    } finally {
      setForgotLoading(false);
    }
  }

  async function handleResetPassword(e) {
    e.preventDefault();
    if (!forgotOtp || !forgotNewPassword) return;
    setForgotError('');
    setForgotMsg('');
    setForgotLoading(true);
    try {
      const { data } = await api.post('/api/auth/reset-password', {
        email: forgotEmail.trim(),
        otp: forgotOtp.trim(),
        newPassword: forgotNewPassword,
      });
      setForgotMsg(data.message || 'Password reset successful! You can now log in.');
      setTimeout(() => {
        setShowForgotModal(false);
        setForgotStep(1);
        setForgotOtp('');
        setForgotNewPassword('');
        setForm((prev) => ({ ...prev, email: forgotEmail }));
      }, 1500);
    } catch (err) {
      setForgotError(err.response?.data?.message || 'Failed to reset password');
    } finally {
      setForgotLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-brand-mark">S</div>
          <h1>Welcome back</h1>
          <p>Sign in to your SplitUp account</p>
        </div>

        {isClerkEnabled ? (
          <div style={{ display: 'flex', justifyContent: 'center', margin: 'var(--space-2) 0' }}>
            <SignIn
              routing="hash"
              signUpUrl="/register"
              fallbackRedirectUrl="/dashboard"
            />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="form-grid">
            <label className="form-label">
              Email Address
              <input
                type="email"
                placeholder="name@example.com"
                value={form.email}
                onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                required
              />
            </label>
            <label className="form-label">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Password</span>
                <Link
                  to="/forgot-password"
                  state={{ email: form.email }}
                  style={{
                    color: 'var(--brand-primary, #6366f1)',
                    fontSize: '12px',
                    textDecoration: 'underline',
                  }}
                >
                  Forgot password?
                </Link>
              </div>
              <input
                type="password"
                placeholder="Enter your password"
                value={form.password}
                onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
                required
                autoComplete="current-password"
              />
            </label>
            {error ? <div className="error-text">{error}</div> : null}
            <button type="submit" className="btn-primary" disabled={loading} style={{ width: '100%', marginTop: 'var(--space-1)' }}>
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        )}

        {!isClerkEnabled && (
          <p style={{ textAlign: 'center', fontSize: '13px', color: 'var(--text-secondary)' }}>
            Don't have an account? <Link to="/register" state={location.state} style={{ color: 'var(--text-primary)', fontWeight: 600 }}>Create one</Link>
          </p>
        )}
      </div>

      {/* Forgot Password Modal */}
      {showForgotModal && (
        <div className="modal-backdrop" onClick={() => setShowForgotModal(false)}>
          <div className="modal-content auth-card" style={{ maxWidth: '420px' }} onClick={(e) => e.stopPropagation()}>
            <div className="auth-header" style={{ marginBottom: '16px' }}>
              <h2>Reset Password</h2>
              <p>{forgotStep === 1 ? 'Enter your email to receive a 6-digit OTP' : 'Enter the code and your new password'}</p>
            </div>

            {forgotMsg ? <div className="success-text" style={{ marginBottom: '12px' }}>{forgotMsg}</div> : null}
            {forgotError ? <div className="error-text" style={{ marginBottom: '12px' }}>{forgotError}</div> : null}

            {forgotStep === 1 ? (
              <form onSubmit={handleRequestReset} className="form-grid">
                <label className="form-label">
                  Email Address
                  <input
                    type="email"
                    placeholder="name@example.com"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    required
                  />
                </label>
                <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                  <button type="button" className="btn-secondary" onClick={() => setShowForgotModal(false)} style={{ flex: 1 }}>
                    Cancel
                  </button>
                  {forgotNotRegistered ? (
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => {
                        setShowForgotModal(false);
                        navigate('/register', { state: { email: forgotEmail.trim() } });
                      }}
                      style={{ flex: 1, background: 'linear-gradient(135deg, #10b981, #059669)' }}
                    >
                      Register Now →
                    </button>
                  ) : (
                    <button type="submit" className="btn-primary" disabled={forgotLoading} style={{ flex: 1 }}>
                      {forgotLoading ? 'Sending…' : 'Send Code'}
                    </button>
                  )}
                </div>
              </form>
            ) : (
              <form onSubmit={handleResetPassword} className="form-grid">
                <label className="form-label">
                  6-Digit OTP Code
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="123456"
                    value={forgotOtp}
                    onChange={(e) => setForgotOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    required
                    style={{ letterSpacing: '0.2em', textAlign: 'center', fontSize: '18px', fontWeight: 700 }}
                  />
                </label>
                <label className="form-label">
                  New Password
                  <input
                    type="password"
                    placeholder="At least 6 characters"
                    value={forgotNewPassword}
                    onChange={(e) => setForgotNewPassword(e.target.value)}
                    required
                    minLength={6}
                  />
                </label>
                <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                  <button type="button" className="btn-secondary" onClick={() => setForgotStep(1)} style={{ flex: 1 }}>
                    Back
                  </button>
                  <button type="submit" className="btn-primary" disabled={forgotLoading} style={{ flex: 1 }}>
                    {forgotLoading ? 'Resetting…' : 'Reset Password'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

