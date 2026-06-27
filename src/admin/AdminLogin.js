import React, { useState } from 'react';
import { api, saveSession } from '../api';
import './admin.css';

// Simple password hash (not cryptographic, just obfuscation for a family app)
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return hash.toString(16);
}

export default function AdminLogin({ onLogin }) {
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!password) return setError('Enter your password');
    setLoading(true);
    setError('');

    // Login using the admin role PIN stored in Settings
    // We use the name "Admin" with the AdminPIN from Settings
    const r = await api('login', {}, { name: 'Admin', pin: password });
    if (r.status === 'ok' && ['admin', 'owner'].includes(r.data.user.Role)) {
      saveSession(r.data.token, r.data.user);
      onLogin(r.data.user);
    } else if (r.status === 'ok') {
      setError('This account does not have admin access.');
    } else {
      setError('Incorrect password. Please try again.');
    }
    setLoading(false);
  };

  return (
    <div className="admin-login-wrap">
      <div className="admin-login-card">
        <img src="images/logo.svg" alt="JB Brush Control" style={{ maxWidth: 240, marginBottom: 24 }} />
        <div className="admin-login-title">Admin Panel</div>
        <div className="admin-login-sub">Sign in to access reports, invoices, and business data.</div>
        {error && <div className="admin-login-error">{error}</div>}
        <form onSubmit={submit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display:'block', fontSize:13, fontWeight:600, color:'#374151', marginBottom:6 }}>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter admin password"
              autoFocus
              style={{ width:'100%', padding:'10px 14px', border:'2px solid #d1d5db', borderRadius:8, fontSize:15, fontFamily:'inherit' }}
            />
          </div>
          <button type="submit" disabled={loading}
            style={{ width:'100%', padding:'12px', borderRadius:8, border:'none', background:'#1a4a1a', color:'white', fontSize:15, fontWeight:700, cursor:'pointer' }}>
            {loading ? 'Signing in…' : 'Sign In →'}
          </button>
        </form>
        <p style={{ marginTop:20, fontSize:12, color:'#9ca3af', textAlign:'center' }}>
          Employee app: <a href="/" style={{ color:'#2d6a2d' }}>lrbudreau.github.io/JBBrushControl</a>
        </p>
      </div>
    </div>
  );
}
