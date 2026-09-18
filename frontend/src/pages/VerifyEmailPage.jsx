import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import api from '../lib/api';

export default function VerifyEmailPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const emailFromState = location.state?.email || sessionStorage.getItem('pending_verify_email') || '';
  const [email, setEmail] = useState(emailFromState);
  const [newEmailInput, setNewEmailInput] = useState(emailFromState);
  const [isEditingEmail, setIsEditingEmail] = useState(!emailFromState);
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const [message, setMessage] = useState(location.state?.message || '');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const inputRefs = useRef([]);

  // Countdown timer for resend button
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  function handleOtpChange(index, value) {
    const digits = value.replace(/\D/g, '');
    if (!digits && value !== '') return;

    const next = [...otp];
    if (digits.length > 1) {
      // Multiple digits entered (or mobile autofill / paste)
      for (let i = 0; i < digits.length && index + i < 6; i++) {
        next[index + i] = digits[i];
      }
      setOtp(next);
      const nextIdx = Math.min(5, index + digits.length);
      inputRefs.current[nextIdx]?.focus();
      return;
    }

    next[index] = digits.slice(-1);
    setOtp(next);

    if (digits && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handleOtpKeyDown(index, e) {
    if (e.key === 'Backspace') {
      if (!otp[index] && index > 0) {
        const next = [...otp];
        next[index - 1] = '';
        setOtp(next);
        inputRefs.current[index - 1]?.focus();
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handlePaste(e) {
    e.preventDefault();
    const pastedData = (e.clipboardData || window.clipboardData).getData('text');
    const digits = pastedData.replace(/\D/g, '').slice(0, 6);
    if (!digits) return;

    const next = [...otp];
    for (let i = 0; i < 6; i++) {
      next[i] = digits[i] || '';
    }
    setOtp(next);

    if (digits.length === 6) {
      inputRefs.current[5]?.focus();
    } else {
      inputRefs.current[digits.length]?.focus();
    }
  }

  async function handleVerify(e) {
    e.preventDefault();
    const targetEmail = email.trim();
    if (!targetEmail) {
      setError('Please provide a valid email address.');
      return;
    }
    const code = otp.join('');
    if (code.length !== 6) {
      setError('Please enter the full 6-digit code.');
      return;
    }
    setError('');
    setMessage('');
    setLoading(true);
    try {
      const { data } = await api.post('/api/auth/verify-email', { email: targetEmail, otp: code });
      localStorage.setItem('token', data.token);
      localStorage.setItem('splitup_token', data.token);
      localStorage.setItem('splitup_user', JSON.stringify(data.user));
      sessionStorage.removeItem('pending_verify_email');
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || 'Verification failed. Please check your code and try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSendCodeToNewEmail(e) {
    e.preventDefault();
    const targetNewEmail = newEmailInput.trim();
    if (!targetNewEmail) {
      setError('Please enter a valid email address.');
      return;
    }
    setResending(true);
    setError('');
    setMessage('');
    try {
      const { data } = await api.post('/api/auth/resend-verification', {
        email: targetNewEmail,
        oldEmail: email || undefined,
      });
      setEmail(targetNewEmail);
      sessionStorage.setItem('pending_verify_email', targetNewEmail);
      setIsEditingEmail(false);
      setMessage(data?.message || `A verification code has been sent to ${targetNewEmail}.`);
      setCountdown(60);
      setOtp(['', '', '', '', '', '']);
      setTimeout(() => {
        inputRefs.current[0]?.focus();
      }, 100);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to send code to new email. Please try again.');
    } finally {
      setResending(false);
    }
  }

  async function handleResend() {
    if (countdown > 0 || resending) return;
    const targetEmail = email.trim();
    if (!targetEmail) {
      setError('Please provide an email address to resend the code.');
      return;
    }
    setResending(true);
    setError('');
    setMessage('');
    try {
      const { data } = await api.post('/api/auth/resend-verification', { email: targetEmail });
      setMessage(data?.message || 'A new verification code has been sent to your email.');
      setCountdown(60);
      setOtp(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to resend code. Please try again.');
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-brand-mark">S</div>
          {isEditingEmail ? (
            <>
              <h1>Change Email Address</h1>
              <p>Enter the email address where you would like to receive your verification code</p>
            </>
          ) : (
            <>
              <h1>Check your email</h1>
              <p>
                We sent a 6-digit verification code to{' '}
                <strong style={{ color: 'var(--text-primary)' }}>{email || 'your email'}</strong>
              </p>
              {email && (
                <button
                  type="button"
                  onClick={() => {
                    setNewEmailInput(email);
                    setIsEditingEmail(true);
                    setError('');
                    setMessage('');
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--brand-primary, #6366f1)',
                    fontSize: '12px',
                    cursor: 'pointer',
                    marginTop: '4px',
                    textDecoration: 'underline',
                  }}
                >
                  Change email address
                </button>
              )}
            </>
          )}
        </div>

        {isEditingEmail ? (
          <form onSubmit={handleSendCodeToNewEmail} className="form-grid">
            <label className="form-label" style={{ marginBottom: 'var(--space-1)' }}>
              New Email Address
              <input
                type="email"
                placeholder="name@example.com"
                value={newEmailInput}
                onChange={(e) => setNewEmailInput(e.target.value)}
                required
                autoFocus
              />
            </label>

            {error ? <div className="error-text">{error}</div> : null}
            {message ? <div className="success-text">{message}</div> : null}

            <div style={{ display: 'flex', gap: '8px', marginTop: 'var(--space-1)' }}>
              {email && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setIsEditingEmail(false);
                    setError('');
                  }}
                  style={{ flex: 1 }}
                >
                  Cancel
                </button>
              )}
              <button
                type="submit"
                className="btn-primary"
                disabled={resending}
                style={{ flex: email ? 1.5 : 1 }}
              >
                {resending ? 'Sending Code…' : 'Send Code to this Email'}
              </button>
            </div>
          </form>
        ) : (
          <>
            <form onSubmit={handleVerify} className="form-grid">
              <div className="otp-inputs" onPaste={handlePaste}>
                {otp.map((digit, i) => (
                  <input
                    key={i}
                    id={`otp-digit-${i}`}
                    ref={(el) => (inputRefs.current[i] = el)}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleOtpChange(i, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(i, e)}
                    className="otp-box"
                    autoComplete="off"
                    autoFocus={i === 0}
                  />
                ))}
              </div>

              {error ? <div className="error-text">{error}</div> : null}
              {message ? <div className="success-text">{message}</div> : null}

              <button type="submit" id="verify-otp-btn" className="btn-primary" disabled={loading} style={{ width: '100%', marginTop: 'var(--space-1)' }}>
                {loading ? 'Verifying…' : 'Verify & Sign in'}
              </button>
            </form>

            <div className="resend-row">
              <span style={{ color: 'var(--text-secondary)' }}>Didn't receive the code?</span>
              <button
                id="resend-otp-btn"
                className="resend-btn"
                onClick={handleResend}
                disabled={countdown > 0 || resending}
              >
                {resending ? 'Sending…' : countdown > 0 ? `Resend in ${countdown}s` : 'Resend code'}
              </button>
            </div>
          </>
        )}

        <div style={{ textAlign: 'center', marginTop: 'var(--space-2)', fontSize: '13px' }}>
          <span style={{ color: 'var(--text-secondary)' }}>Back to </span>
          <Link to="/login" style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
            Sign in
          </Link>
          <span style={{ color: 'var(--text-secondary)' }}> or </span>
          <Link to="/register" style={{ color: 'var(--brand-primary, #6366f1)', fontWeight: 600 }}>
            Register
          </Link>
        </div>
      </div>
    </div>
  );
}
