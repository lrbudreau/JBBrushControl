import React, { useState, useEffect } from 'react';
import { api, saveSession } from '../api';
import {
  isBiometricAvailable, hasBiometricRegistered,
  registerBiometric, authenticateWithBiometric
} from '../hooks/useWebAuthn';

// Store last logged-in user for biometric shortcut
function getLastUser() {
  try { return JSON.parse(localStorage.getItem('jb_last_user')); } catch { return null; }
}
function setLastUser(user) {
  localStorage.setItem('jb_last_user', JSON.stringify({ UserID: user.UserID, Name: user.Name, Role: user.Role }));
}

export default function MobileLogin({ onLogin }) {
  const [pin, setPin]         = useState('');
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);
  const [showBio, setShowBio] = useState(false);
  const [lastUser, setLU]     = useState(null);
  const [bioPrompt, setBioPrompt] = useState(false); // after PIN success, offer biometric
  const [pendingUser, setPending] = useState(null);
  const [pendingToken, setPendingToken] = useState(null);

  useEffect(() => {
    const lu = getLastUser();
    if (lu && isBiometricAvailable() && hasBiometricRegistered(lu.UserID)) {
      setLU(lu);
      setShowBio(true);
    }
  }, []);

  const handleBioLogin = async () => {
    if (!lastUser) return;
    setLoading(true);
    setError('');
    try {
      const ok = await authenticateWithBiometric(lastUser.UserID);
      if (ok) {
        // Re-use stored session token from localStorage
        const storedToken = localStorage.getItem(`jb_bio_token_${lastUser.UserID}`);
        if (storedToken) {
          saveSession(storedToken, lastUser);
          onLogin(lastUser);
        } else {
          setError('Session expired. Please use your PIN.');
          setShowBio(false);
        }
      }
    } catch (e) {
      setError('Biometric failed. Use your PIN below.');
    }
    setLoading(false);
  };

  const handlePinKey = (key) => {
    if (key === 'back') { setPin(p => p.slice(0, -1)); return; }
    if (pin.length >= 8) return;
    const next = pin + key;
    setPin(next);
    // Auto-submit at 4 digits
    if (next.length >= 4) setTimeout(() => submitPin(next), 120);
  };

  const submitPin = async (pinValue) => {
    setLoading(true);
    setError('');
    const r = await api('login', {}, { pin: pinValue });
    if (r.status === 'ok') {
      setLastUser(r.data.user);
      setLastUser(r.data.user);
      setLastUser(r.data.user);
      // Check if biometric available and not yet registered
      if (isBiometricAvailable() && !hasBiometricRegistered(r.data.user.UserID)) {
        setPending(r.data.user);
        setPendingToken(r.data.token);
        setBioPrompt(true);
      } else {
        completeLogin(r.data.token, r.data.user);
      }
    } else {
      setError('Wrong PIN. Try again.');
      setPin('');
    }
    setLoading(false);
  };

  const completeLogin = (token, user) => {
    setLastUser(user);
    localStorage.setItem(`jb_bio_token_${user.UserID}`, token);
    saveSession(token, user);
    onLogin(user);
  };

  const handleRegisterBio = async () => {
    try {
      await registerBiometric(pendingUser.UserID, pendingUser.Name);
      completeLogin(pendingToken, pendingUser);
    } catch (e) {
      // Skip biometric, just log in normally
      completeLogin(pendingToken, pendingUser);
    }
  };

  const skipBio = () => completeLogin(pendingToken, pendingUser);

  // Biometric registration prompt
  if (bioPrompt) {
    return (
      <div style={styles.wrap}>
        <div style={styles.card}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>🔐</div>
          <div style={styles.title}>Enable Face ID?</div>
          <div style={styles.sub}>Log in faster next time with Face ID or fingerprint — no PIN needed.</div>
          <button style={{ ...styles.bigBtn, background: '#2d6a2d', marginBottom: 12 }} onClick={handleRegisterBio}>
            Enable Face ID / Fingerprint
          </button>
          <button style={{ ...styles.bigBtn, background: 'transparent', color: '#6b7280', border: '2px solid #d1d5db' }} onClick={skipBio}>
            Not now
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.card}>
        {/* Logo */}
        <img src="images/logo.svg" alt="JB Brush Control" style={{ maxWidth: 280, marginBottom: 24, filter: 'none' }} />

        {/* Biometric shortcut */}
        {showBio && lastUser && (
          <div style={{ marginBottom: 20, textAlign: 'center' }}>
            <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 10 }}>Welcome back, <strong>{lastUser.Name}</strong></div>
            <button style={{ ...styles.bigBtn, background: '#1a4a1a', fontSize: 16 }} onClick={handleBioLogin} disabled={loading}>
              {loading ? '…' : '🔐 Use Face ID / Fingerprint'}
            </button>
            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 10 }}>or enter PIN below</div>
          </div>
        )}

        {!showBio && <div style={styles.title}>Enter your PIN</div>}

        {error && <div style={styles.error}>{error}</div>}

        {/* PIN dots */}
        <div style={styles.pinRow}>
          {[0,1,2,3].map(i => (
            <div key={i} style={{ ...styles.pinDot, background: i < pin.length ? '#1a4a1a' : 'transparent' }} />
          ))}
        </div>

        {/* PIN pad */}
        <div style={styles.pad}>
          {['1','2','3','4','5','6','7','8','9','','0','back'].map((k, i) => (
            <button
              key={i}
              style={{
                ...styles.key,
                ...(k === '' ? { visibility: 'hidden' } : {}),
                ...(k === 'back' ? { fontSize: 22 } : {}),
              }}
              onClick={() => k !== '' && handlePinKey(k)}
              disabled={loading}
            >
              {k === 'back' ? '⌫' : k}
            </button>
          ))}
        </div>

        <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 16, textAlign: 'center' }}>
          JB Brush Control · Ditch Spraying & Tree Services
        </div>
      </div>
    </div>
  );
}

const styles = {
  wrap: {
    minHeight: '100vh',
    background: 'linear-gradient(160deg, #1a4a1a 0%, #2d6a2d 100%)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 24,
  },
  card: {
    background: 'white', borderRadius: 20,
    padding: '32px 24px', width: '100%', maxWidth: 360,
    boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
  },
  title: { fontSize: 20, fontWeight: 800, color: '#1a4a1a', marginBottom: 6 },
  sub:   { fontSize: 14, color: '#6b7280', marginBottom: 20, textAlign: 'center', lineHeight: 1.5 },
  error: { background: '#fee2e2', color: '#dc2626', padding: '10px 14px', borderRadius: 8, fontSize: 13, marginBottom: 14, fontWeight: 600, width: '100%', textAlign: 'center' },
  pinRow: { display: 'flex', gap: 14, marginBottom: 24 },
  pinDot: { width: 18, height: 18, borderRadius: '50%', border: '2px solid #1a4a1a', transition: 'background 0.15s' },
  pad: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, width: '100%', maxWidth: 280 },
  key: {
    height: 68, borderRadius: 10, border: '2px solid #e5e7eb',
    background: 'white', fontSize: 24, fontWeight: 700,
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'background 0.1s', WebkitTapHighlightColor: 'transparent',
    color: '#111827',
  },
  bigBtn: {
    width: '100%', padding: '14px 20px', borderRadius: 10, border: 'none',
    color: 'white', fontSize: 15, fontWeight: 700, cursor: 'pointer',
  },
};
