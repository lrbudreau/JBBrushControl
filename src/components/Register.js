import React, { useEffect, useState } from 'react';
import { api, saveSession } from '../api';
import { isBiometricAvailable, registerBiometric } from '../hooks/useWebAuthn';

// Opened from an invite link: https://…/JBBrushControl/?invite=CODE
export default function Register({ code, onDone, onCancel }) {
  const [invite, setInvite]   = useState(null);   // { role, name, createdBy }
  const [checking, setChecking] = useState(true);
  const [badLink, setBadLink] = useState('');
  const [name, setName]       = useState('');
  const [email, setEmail]     = useState('');
  const [pin, setPin]         = useState('');
  const [pin2, setPin2]       = useState('');
  const [error, setError]     = useState('');
  const [saving, setSaving]   = useState(false);
  const [done, setDone]       = useState(null);   // { token, user } after success → Face ID offer

  useEffect(() => {
    api('checkInvite', { code }).then(r => {
      if (r.status === 'ok') { setInvite(r.data); setName(r.data.name || ''); }
      else setBadLink(r.message || 'This invite link is no longer valid.');
      setChecking(false);
    });
  }, [code]);

  const submit = async () => {
    setError('');
    if (!name.trim())           return setError('Please enter your name.');
    if (!/^\d{4}$/.test(pin))   return setError('Your PIN must be exactly 4 numbers.');
    if (pin !== pin2)           return setError("The two PINs don't match.");
    setSaving(true);
    const r = await api('registerWithInvite', {}, { code, Name: name.trim(), Email: email.trim(), PIN: pin });
    setSaving(false);
    if (r.status !== 'ok') {
      setError(r.message || 'Something went wrong. Try again.');
      if (r.code === 409) { setPin(''); setPin2(''); }
      if (r.code === 404 || r.code === 429) setBadLink(r.message);
      return;
    }
    // Same storage the PIN login uses, so Face ID and "welcome back" work
    localStorage.setItem('jb_last_user', JSON.stringify({ UserID: r.data.user.UserID, Name: r.data.user.Name, Role: r.data.user.Role }));
    localStorage.setItem(`jb_bio_token_${r.data.user.UserID}`, r.data.token);
    saveSession(r.data.token, r.data.user);
    if (isBiometricAvailable()) setDone(r.data);
    else onDone(r.data.user);
  };

  const enableFaceID = async () => {
    try { await registerBiometric(done.user.UserID, done.user.Name); } catch (e) { /* skip */ }
    onDone(done.user);
  };

  const roleLabel = { employee: 'an employee', admin: 'an admin', owner: 'an owner' };

  return (
    <div style={S.wrap}>
      <div style={S.card}>
        <img src="images/logo.svg" alt="JB Brush Control" style={{ maxWidth: 240, marginBottom: 20 }} />

        {checking ? (
          <div style={S.sub}>Checking your invite…</div>

        ) : done ? (
          <>
            <div style={{ fontSize: 48, marginBottom: 10 }}>🎉</div>
            <div style={S.title}>Welcome, {done.user.Name}!</div>
            <div style={S.sub}>Your account is ready. Turn on Face ID or fingerprint so you don't have to type your PIN.</div>
            <button style={{ ...S.btn, marginBottom: 10 }} onClick={enableFaceID}>Enable Face ID / Fingerprint</button>
            <button style={S.btnGhost} onClick={() => onDone(done.user)}>Not now</button>
          </>

        ) : badLink ? (
          <>
            <div style={{ fontSize: 44, marginBottom: 10 }}>🔗</div>
            <div style={S.title}>Link not valid</div>
            <div style={S.sub}>{badLink}</div>
            <button style={S.btnGhost} onClick={onCancel}>Go to sign in</button>
          </>

        ) : (
          <>
            <div style={S.title}>Create your account</div>
            <div style={S.sub}>
              {invite.createdBy ? `${invite.createdBy} invited you` : "You've been invited"} to join as {roleLabel[invite.role] || invite.role}.
            </div>
            {error && <div style={S.error}>{error}</div>}

            <label style={S.label}>Your name *</label>
            <input style={S.input} value={name} onChange={e => setName(e.target.value)} placeholder="First and last name" autoComplete="name" />

            <label style={S.label}>Email (optional)</label>
            <input style={S.input} value={email} onChange={e => setEmail(e.target.value)} inputMode="email" autoComplete="email" placeholder="you@example.com" />

            <div style={{ display: 'flex', gap: 10, width: '100%' }}>
              <div style={{ flex: 1 }}>
                <label style={S.label}>Pick a 4-digit PIN *</label>
                <input style={{ ...S.input, letterSpacing: 6, textAlign: 'center' }} value={pin} type="password"
                  inputMode="numeric" maxLength={4} autoComplete="new-password"
                  onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={S.label}>Type it again *</label>
                <input style={{ ...S.input, letterSpacing: 6, textAlign: 'center' }} value={pin2} type="password"
                  inputMode="numeric" maxLength={4} autoComplete="new-password"
                  onChange={e => setPin2(e.target.value.replace(/\D/g, '').slice(0, 4))} />
              </div>
            </div>
            <div style={S.hint}>You'll use this PIN to sign in. Avoid easy ones like 1234 or 1111, and don't share it.</div>

            <button style={{ ...S.btn, marginTop: 16, opacity: saving ? 0.6 : 1 }} onClick={submit} disabled={saving}>
              {saving ? 'Creating account…' : 'Create account'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

const S = {
  wrap:  { minHeight: '100vh', background: 'linear-gradient(160deg, #1a4a1a 0%, #2d6a2d 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card:  { background: 'white', borderRadius: 20, padding: '28px 24px', width: '100%', maxWidth: 380, boxShadow: '0 20px 60px rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: 800, color: '#1a4a1a', marginBottom: 6, textAlign: 'center' },
  sub:   { fontSize: 14, color: '#6b7280', marginBottom: 18, textAlign: 'center', lineHeight: 1.5 },
  error: { background: '#fee2e2', color: '#dc2626', padding: '10px 14px', borderRadius: 8, fontSize: 13, marginBottom: 12, fontWeight: 600, width: '100%', textAlign: 'center' },
  label: { alignSelf: 'flex-start', fontSize: 13, fontWeight: 600, color: '#374151', margin: '10px 0 5px', display: 'block' },
  input: { width: '100%', minHeight: 48, padding: '10px 12px', border: '2px solid #d1d5db', borderRadius: 8, fontSize: 16, fontFamily: 'inherit', boxSizing: 'border-box' },
  hint:  { alignSelf: 'flex-start', fontSize: 12, color: '#9ca3af', marginTop: 6 },
  btn:      { width: '100%', padding: '14px 20px', borderRadius: 10, border: 'none', background: '#1a4a1a', color: 'white', fontSize: 15, fontWeight: 700, cursor: 'pointer' },
  btnGhost: { width: '100%', padding: '14px 20px', borderRadius: 10, border: '2px solid #d1d5db', background: 'white', color: '#6b7280', fontSize: 15, fontWeight: 700, cursor: 'pointer' },
};
