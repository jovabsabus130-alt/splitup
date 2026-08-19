import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import api from '../lib/api';

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-brand-mark">S</div>
          <h1>Welcome back</h1>
          <p>Sign in to your SplitUp account</p>
        </div>

        <form onSubmit={handleSubmit} className="form-grid">
          <label style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)' }}>
            Email Address
            <input
              type="email"
              placeholder="you@example.com"
              value={form.email}
              onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
              required
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)' }}>
            Password
            <input
              type="password"
              placeholder="••••••••"
              value={form.password}
              onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
              required
            />
          </label>
          {error ? <div className="error-text">{error}</div> : null}
          <button type="submit" className="btn-primary" disabled={loading} style={{ width: '100%', marginTop: 'var(--space-1)', height: '42px' }}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p style={{ textAlign: 'center', fontSize: '13px', color: 'var(--text-secondary)' }}>
          Don't have an account? <Link to="/register" state={location.state} style={{ color: 'var(--accent-primary)', fontWeight: 600 }}>Create one</Link>
        </p>
      </div>
    </div>
  );
}
