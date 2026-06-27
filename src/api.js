import { CONFIG } from './config';

export async function api(action, params = {}, body = null) {
  const token = sessionStorage.getItem('jb_token');
  try {
    if (body !== null) {
      const res = await fetch(CONFIG.API_URL, {
        method: 'POST',
        body: JSON.stringify({ action, token, ...body }),
      });
      return await res.json();
    } else {
      const qs = new URLSearchParams({
        action,
        ...(token ? { token } : {}),
        ...params
      }).toString();
      const res = await fetch(`${CONFIG.API_URL}?${qs}`);
      return await res.json();
    }
  } catch (e) {
    return { status: 'error', message: e.message };
  }
}

export function saveSession(token, user) {
  sessionStorage.setItem('jb_token', token);
  sessionStorage.setItem('jb_user', JSON.stringify(user));
}

export function clearSession() {
  sessionStorage.removeItem('jb_token');
  sessionStorage.removeItem('jb_user');
  sessionStorage.removeItem('jb_webauthn');
}

export function getSession() {
  try {
    const token = sessionStorage.getItem('jb_token');
    const user  = JSON.parse(sessionStorage.getItem('jb_user'));
    if (token && user) return { token, user };
    return null;
  } catch { return null; }
}

export function getUser() {
  try { return JSON.parse(sessionStorage.getItem('jb_user')); } catch { return null; }
}

export function isOwnerOrAdmin() {
  const u = getUser();
  return u && ['owner', 'admin'].includes(u.Role);
}
