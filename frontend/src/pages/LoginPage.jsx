import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { login } from '../utils/api';
import { useAuth } from '../App';
import '../styles/global.css';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { setUser, setTeam } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email || !password) return toast.error('Enter email and password');
    setLoading(true);
    try {
      const res = await login(email, password);
      localStorage.setItem('token', res.data.token);
      setUser(res.data.user);
      setTeam(res.data.team);
      toast.success(`Welcome back, ${res.data.user.name}`);
      navigate(res.data.user.role === 'commissioner' ? '/dashboard' : '/standings');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg-base)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      fontFamily: 'var(--font-body)',
    }}>
      {/* Background texture */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 0,
        backgroundImage: 'radial-gradient(circle at 20% 50%, rgba(61,139,255,0.04) 0%, transparent 60%), radial-gradient(circle at 80% 20%, rgba(61,139,255,0.03) 0%, transparent 50%)',
        pointerEvents: 'none',
      }} />

      <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 400 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{
            fontSize: '2.5rem',
            marginBottom: 12,
            filter: 'drop-shadow(0 0 20px rgba(61,139,255,0.4))',
          }}>⚾</div>
          <div style={{
            fontFamily: 'var(--font-display)',
            fontSize: '1.8rem',
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--text-primary)',
          }}>XL Baseball</div>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.65rem',
            letterSpacing: '0.25em',
            textTransform: 'uppercase',
            color: 'var(--accent)',
            marginTop: 6,
          }}>Commissioner Engine · 2026</div>
        </div>

        {/* Card */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">Sign In</div>
          </div>
          <div className="card-body">
            <form onSubmit={handleLogin}>
              <div className="form-group">
                <label className="form-label">Email Address</label>
                <input
                  className="input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoFocus
                />
              </div>
              <div className="form-group" style={{ marginBottom: 24 }}>
                <label className="form-label">Password</label>
                <input
                  className="input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>
              <button
                className="btn btn-primary btn-lg"
                type="submit"
                disabled={loading}
                style={{ width: '100%', justifyContent: 'center' }}
              >
                {loading ? 'Signing in...' : 'Sign In →'}
              </button>
            </form>
          </div>
        </div>

        <div style={{
          textAlign: 'center',
          marginTop: 20,
          fontFamily: 'var(--font-mono)',
          fontSize: '0.65rem',
          color: 'var(--text-muted)',
          letterSpacing: '0.05em',
        }}>
          Contact your commissioner to get access
        </div>
      </div>
    </div>
  );
}
