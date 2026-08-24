import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import api from '../lib/api';

export default function RegisterPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const redirectPath = location.state?.from?.pathname || '/dashboard';

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      const payload = {
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
      };

      const { data } = await api.post('/api/auth/register', payload);
      if (data.token) {
        localStorage.setItem('token', data.token);
        localStorage.setItem('splitup_token', data.token);
        localStorage.setItem('splitup_user', JSON.stringify(data.user));
        navigate(redirectPath, { replace: true });
      } else {
        navigate('/login', { state: location.state });
      }
    } catch (apiError) {
      setError(apiError.response?.data?.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-brand-mark">S</div>
          <h1>Create your account</h1>
          <p>Start tracking and settling shared expenses</p>
        </div>

        <form onSubmit={handleSubmit} className="form-grid">
          <label className="form-label">
            Full Name
            <input
              value={form.name}
              placeholder="Full name"
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              required
            />
          </label>

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
            Password
            <input
              type="password"
              placeholder="At least 6 characters"
              value={form.password}
              onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
              required
              minLength={6}
            />
          </label>

          {error ? <div className="error-text">{error}</div> : null}
          <button type="submit" className="btn-primary" disabled={loading} style={{ width: '100%', marginTop: 'var(--space-1)' }}>
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p style={{ textAlign: 'center', fontSize: '13px', color: 'var(--text-secondary)' }}>
          Already have an account? <Link to="/login" state={location.state} style={{ color: 'var(--text-primary)', fontWeight: 600 }}>Sign in</Link>
        </p>

        <div className="auth-trust-footer">
          <span>🔒 Free to use • No card required</span>
        </div>
      </div>
    </div>
  );
}
