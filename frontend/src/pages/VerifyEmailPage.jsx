import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import api from '../lib/api';

export default function VerifyEmailPage() {
  const navigate = useNavigate();
  const location = useLocation();

  // Email can be passed via location.state (from RegisterPage) or stored in sessionStorage
  const emailFromState = location.state?.email || sessionStorage.getItem('pending_verify_email') || '';
  const [email] = useState(emailFromState);
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
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
    if (!/^\d*$/.test(value)) return; // digits only
    const next = [...otp];
    next[index] = value.slice(-1); // keep last char
    setOtp(next);
    if (value && index < 5) inputRefs.current[index + 1]?.focus();
  }

  function handleOtpKeyDown(index, e) {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  function handlePaste(e) {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (text.length === 6) {
      setOtp(text.split(''));
      inputRefs.current[5]?.focus();
    }
    e.preventDefault();
  }

  async function handleVerify(e) {
    e.preventDefault();
    const code = otp.join('');
    if (code.length !== 6) {
      setError('Please enter the full 6-digit code.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const { data } = await api.post('/api/auth/verify-otp', { email, otp: code });
      localStorage.setItem('token', data.token);
      localStorage.setItem('splitup_token', data.token);
      localStorage.setItem('splitup_user', JSON.stringify(data.user));
      sessionStorage.removeItem('pending_verify_email');
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.message || 'Verification failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (countdown > 0) return;
    setResending(true);
    setError('');
    setMessage('');
    try {
      await api.post('/api/auth/resend-otp', { email });
      setMessage('A new code has been sent to your email.');
      setCountdown(60);
      setOtp(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to resend code');
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <div className="brand-logo" style={{ margin: '0 auto var(--space-3)' }}>S</div>
          <h1>Check your email</h1>
          <p>
            We sent a 6-digit code to <strong>{email || 'your email'}</strong>
          </p>
        </div>

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
      </div>
    </div>
  );
}
