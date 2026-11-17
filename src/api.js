import { CONFIG } from './config';

// ── Speed-ups ─────────────────────────────────────────────────
// Each trip to Google Apps Script takes 1–3 seconds, so:
//  1. Requests made at the same moment are bundled into ONE trip ("batch").
//  2. Results are remembered for 30 seconds, so going back and forth between
//     screens is instant. Saving anything clears this memory so you never
//     see your own change missing.
//  3. Identical requests already on the way are shared, not repeated.
const CACHE_MS = 30 * 1000;
const cache    = new Map();   // key -> { t, result }
const inflight = new Map();   // key -> Promise
let queue = [];
let timer = null;
let batchSupported = true;

function getToken() {
  // Admin uses localStorage, mobile uses sessionStorage
  return localStorage.getItem('jb_token') || sessionStorage.getItem('jb_token');
}

async function rawGet(action, params, token) {
  try {
    const qs = new URLSearchParams({ action, ...(token ? { token } : {}), ...params }).toString();
    const res = await fetch(`${CONFIG.API_URL}?${qs}`);
    return await res.json();
  } catch (e) {
    return { status: 'error', message: e.message };
  }
}

async function rawPost(action, body, token) {
  try {
    const res = await fetch(CONFIG.API_URL, {
      method: 'POST',
      body: JSON.stringify({ action, token, ...body }),
    });
    return await res.json();
  } catch (e) {
    return { status: 'error', message: e.message };
  }
}

async function flush() {
  const items = queue; queue = []; timer = null;
  const token = getToken();
  const oneByOne = () => items.forEach(it => rawGet(it.action, it.params, token).then(it.resolve));
  if (items.length === 1 || !batchSupported) return oneByOne();
  const r = await rawPost('batch', { requests: items.map(it => ({ action: it.action, params: it.params })) }, token);
  if (r.status === 'ok' && Array.isArray(r.data)) {
    items.forEach((it, i) => it.resolve(r.data[i] || { status: 'error', message: 'No response' }));
  } else {
    if (/Unknown action/i.test(r.message || '')) batchSupported = false; // older backend
    oneByOne();
  }
}

export function clearApiCache() { cache.clear(); }

export async function api(action, params = {}, body = null) {
  // Saving / changing something: send now, and forget remembered results
  if (body !== null) {
    cache.clear();
    const r = await rawPost(action, body, getToken());
    cache.clear();
    return r;
  }
  const key = action + '?' + JSON.stringify(params);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < CACHE_MS) return hit.result;
  if (inflight.has(key)) return inflight.get(key);
  const p = new Promise(resolve => {
    queue.push({ action, params, resolve });
    if (!timer) timer = setTimeout(flush, 15);
  }).then(r => {
    inflight.delete(key);
    if (r.status === 'ok') cache.set(key, { t: Date.now(), result: r });
    return r;
  });
  inflight.set(key, p);
  return p;
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
  cache.clear();
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
