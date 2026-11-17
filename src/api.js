import { CONFIG } from './config';

export async function api(action, params = {}, body = null) {
  // Admin uses localStorage, mobile uses sessionStorage
  const token = localStorage.getItem('jb_token') || sessionStorage.getItem('jb_token');
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

// Mobile session — clears when browser closes
export function saveSession(token, user) {
  sessionStorage.setItem('jb_token', token);
  sessionStorage.setItem('jb_user', JSON.stringify(user));
  // Also save to localStorage for admin panel access
  localStorage.setItem('jb_token', token);
  localStorage.setItem('jb_user', JSON.stringify(user));
}

export function clearSession() {
  sessionStorage.removeItem('jb_token');
  sessionStorage.removeItem('jb_user');
  localStorage.removeItem('jb_token');
  localStorage.removeItem('jb_user');
  // NOTE: keep 'jb_last_user' so the Face ID / fingerprint shortcut
  // is still offered on the login screen after signing out.
}

export function getSession() {
  try {
    const token = sessionStorage.getItem('jb_token') || localStorage.getItem('jb_token');
    const userStr = sessionStorage.getItem('jb_user') || localStorage.getItem('jb_user');
    const user = JSON.parse(userStr);
    if (token && user) return { token, user };
    return null;
  } catch { return null; }
}

export function getUser() {
  try {
    const str = sessionStorage.getItem('jb_user') || localStorage.getItem('jb_user');
    return JSON.parse(str);
  } catch { return null; }
}

export function isOwnerOrAdmin() {
  const u = getUser();
  return u && ['owner', 'admin'].includes(u.Role);
}

export function isOwner() {
  const u = getUser();
  return u && u.Role === 'owner';
}

// ── Date formatting ───────────────────────────────────────────
// Converts any date string (ISO, YYYY-MM-DD, etc.) to MM/DD/YYYY
export function formatDate(val) {
  if (!val) return '';
  try {
    // Handle ISO timestamps like 2026-06-28T04:00:00.000Z
    // Force parse as local date for YYYY-MM-DD strings to avoid timezone shift
    let d;
    if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val)) {
      const [y,m,day] = val.split('-');
      d = new Date(parseInt(y), parseInt(m)-1, parseInt(day));
    } else {
      d = new Date(val);
    }
    if (isNaN(d.getTime())) return String(val);
    return d.toLocaleDateString('en-US', { month:'2-digit', day:'2-digit', year:'numeric' });
  } catch { return String(val); }
}

// ── Local-date helpers ────────────────────────────────────────
// new Date().toISOString() is UTC, so after ~7-8pm Eastern it returns
// TOMORROW's date. These use the phone/computer's local date instead.
function pad(n) { return String(n).padStart(2, '0'); }
function ymd(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

export function localToday() { return ymd(new Date()); }

export function localMonthStart() {
  const d = new Date();
  return ymd(new Date(d.getFullYear(), d.getMonth(), 1));
}

// Convert whatever the sheet returns (ISO timestamp, Date string…) into
// YYYY-MM-DD so <input type="date"> can display it.
export function toInputDate(val) {
  if (!val) return '';
  if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
  const d = new Date(val);
  return isNaN(d.getTime()) ? '' : ymd(d);
}

// IRS standard business mileage rate ($/mile) for the date of the trip.
// 2026 changed mid-year: 72.5¢ Jan 1–Jun 30, 76¢ from Jul 1.
export function irsMileageRate(dateVal) {
  const d = toInputDate(dateVal) || localToday();
  if (d >= '2026-07-01') return 0.76;
  if (d >= '2026-01-01') return 0.725;
  if (d >= '2025-01-01') return 0.70;
  return 0.67;
}

export function mileageDeduction(rows) {
  return rows.reduce((s, m) => s + (parseFloat(m.TotalMiles) || 0) * irsMileageRate(m.Date), 0);
}
