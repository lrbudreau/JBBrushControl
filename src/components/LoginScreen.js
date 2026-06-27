import React, { useState } from 'react';
import { api, saveSession } from '../api';

export default function LoginScreen({ onLogin }) {
  const [name, setName]   = useState('');
  const [pin, setPin]     = useState('');
  const [step, setStep]   = useState('name'); // 'name' | 'pin'
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleNameSubmit = () => {
    if (!name.trim()) return setError('Please enter your name');
    setError('');
    setStep('pin');
  };

  const handlePinKey = (key) => {
    if (key === 'clear') { setPin(''); return; }
    if (key === 'back')  { setPin(p => p.slice(0, -1)); return; }
    if (pin.length >= 8) return;
    setPin(p => p + key);
  };

  const handlePinSubmit = async () => {
    if (!pin) return setError('Enter your PIN');
    setLoading(true);
    setError('');
    const r = await api('login', {}, { name: name.trim(), pin });
    if (r.status === 'ok') {
      saveSession(r.data.token, r.data.user);
      onLogin(r.data.user);
    } else {
      setError('Invalid name or PIN');
      setPin('');
    }
    setLoading(false);
  };

  return (
    <div className="login-wrap">
      <div className="login-card">
        {/* Logo */}
        <div className="login-logo">
          <img src="images/logo.svg" alt="JB Brush Control" style={{ maxHeight: 80 }} />
        </div>

        {step === 'name' ? (
          <>
            <div className="login-title">Welcome back</div>
            <div className="login-sub">Enter your name to continue</div>
            {error && <div className="login-error">{error}</div>}
            <div className="form-group">
              <label>Your Name</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleNameSubmit()}
                placeholder="e.g. JB"
                autoCapitalize="words"
                autoFocus
              />
            </div>
            <button className="btn btn-primary btn-full" style={{ marginTop: 8 }} onClick={handleNameSubmit}>
              Continue →
            </button>
          </>
        ) : (
          <>
            <div className="login-title">Hi, {name}!</div>
            <div className="login-sub">Enter your PIN</div>
            {error && <div className="login-error">{error}</div>}

            {/* PIN dots */}
            <div className="pin-display">
              {[...Array(Math.max(4, pin.length))].map((_, i) => (
                <div key={i} className={`pin-dot ${i < pin.length ? 'filled' : ''}`} />
              ))}
            </div>

            {/* PIN pad */}
            <div className="pin-pad">
              {['1','2','3','4','5','6','7','8','9'].map(k => (
                <button key={k} className="pin-key" onClick={() => handlePinKey(k)}>{k}</button>
              ))}
              <button className="pin-key clear" onClick={() => setStep('name')}>← Back</button>
              <button className="pin-key" onClick={() => handlePinKey('0')}>0</button>
              <button className="pin-key clear" onClick={() => handlePinKey('back')}>⌫</button>
            </div>

            <button
              className="btn btn-primary btn-full"
              onClick={handlePinSubmit}
              disabled={loading || !pin}
            >
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </>
        )}

        <p style={{ marginTop: 20, fontSize: 11, color: 'var(--gray-500)', textAlign: 'center' }}>
          JB Brush Control · Ditch Spraying & Tree Services
        </p>
      </div>
    </div>
  );
}
