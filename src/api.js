const API_URL = 'https://script.google.com/macros/s/AKfycbyq7zpYmGIG5qlX7wYk3xZ-D2L2PShEf9G3H2sqsHXu02DZ9qbbAUpXhQzUITR2EJUUNg/exec';

export async function api(action, params = {}, body = null) {
  const token = sessionStorage.getItem('jb_token');
  try {
    if (body !== null) {
      const res = await fetch(API_URL, {
        method: 'POST',
        body: JSON.stringify({ action, token, ...body }),
      });
      return await res.json();
    } else {
      const qs = new URLSearchParams({ action, ...(token ? { token } : {}), ...params }).toString();
      const res = await fetch(`${API_URL}?${qs}`);
      return await res.json();
    }
  } catch (e) {
    return { status: 'error', message: e.message };
  }
}

// Session storage — clears when browser/tab closes
export function saveSession(token, user) {
  sessionStorage.setItem('jb_token', token);
  sessionStorage.setItem('jb_user', JSON.stringify(user));
}

export function clearSession() {
  sessionStorage.removeItem('jb_token');
  sessionStorage.removeItem('jb_user');
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

export function isOwner() {
  const u = getUser();
  return u && u.Role === 'owner';
}
