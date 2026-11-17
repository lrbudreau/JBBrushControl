// ============================================================
// JB Brush Control — Google Apps Script Backend v4.7
// ============================================================

const SS_ID = '1QFfaMVXt8Y0fTnXFa1o-MXi8_P2mSKWlPHWbZ7gRjDY';

// ── Core helpers ─────────────────────────────────────────────

// Open the spreadsheet once per request, and read each tab at most once.
// (Before, every lookup re-read a whole tab — e.g. loading 50 invoices read
// the Estimates, Jobs and Customers tabs 150 times — which made the app slow.)
let _ss = null;
const _cache = {};

function getSheet(name) {
  if (!_ss) _ss = SpreadsheetApp.openById(SS_ID);
  return _ss.getSheetByName(name);
}

function readSheet(name) {
  if (!_cache[name]) _cache[name] = sheetToObjects(getSheet(name));
  return _cache[name];
}

function invalidate(name) { delete _cache[name]; }

function getSetting(key) {
  const sheet = getSheet('Settings');
  const keys  = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const vals  = sheet.getRange(2, 1, 1, sheet.getLastColumn()).getValues()[0];
  const idx   = keys.indexOf(key);
  return idx === -1 ? '' : String(vals[idx] ?? '');
}

function setSetting(key, value) {
  const sheet = getSheet('Settings');
  const keys  = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const idx   = keys.indexOf(key);
  if (idx !== -1) sheet.getRange(2, idx + 1).setValue(value);
}

// Google Sheets turns "2026-11-17" into a Date object. Comparing a Date with a
// text date ("2026-11-01") is always false, which broke every date filter
// (Hours search, dashboard "this month", Tax Summary). Turn date-only cells
// back into "yyyy-MM-dd" text so comparisons and display work.
function normalizeCell(v, tz) {
  if (v instanceof Date && !isNaN(v.getTime())) {
    if (Utilities.formatDate(v, tz, 'HH:mm:ss') === '00:00:00') {
      return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
    }
    return v.toISOString();
  }
  return v;
}

function sheetToObjects(sheet) {
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  const tz = Session.getScriptTimeZone();
  const headers = data[0];
  const result  = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (row.every(c => c === '' || c === null || c === undefined)) continue;
    const obj = {};
    headers.forEach((h, j) => { obj[h] = normalizeCell(row[j] ?? '', tz); });
    result.push(obj);
  }
  return result;
}

function appendRow(sheetName, obj) {
  const sheet   = getSheet(sheetName);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  sheet.appendRow(headers.map(h => obj[h] ?? ''));
  invalidate(sheetName);
}

function updateRecord(sheetName, idField, idValue, updates) {
  const sheet   = getSheet(sheetName);
  const data    = sheet.getDataRange().getValues();
  const headers = data[0];
  const idCol   = headers.indexOf(idField);
  if (idCol === -1) return false;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idCol]) === String(idValue)) {
      headers.forEach((h, j) => {
        if (updates[h] !== undefined) sheet.getRange(i + 1, j + 1).setValue(updates[h]);
      });
      invalidate(sheetName);
      return true;
    }
  }
  return false;
}

function deleteRecord(sheetName, idField, idValue) {
  const sheet   = getSheet(sheetName);
  const data    = sheet.getDataRange().getValues();
  const headers = data[0];
  const idCol   = headers.indexOf(idField);
  if (idCol === -1) return false;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idCol]) === String(idValue)) {
      sheet.deleteRow(i + 1);
      invalidate(sheetName);
      return true;
    }
  }
  return false;
}

function findRecord(sheetName, idField, idValue) {
  return readSheet(sheetName).find(r => String(r[idField]) === String(idValue)) || null;
}

function generateID(prefix) {
  return prefix + '_' + Date.now().toString(36).toUpperCase() + '_' + Math.random().toString(36).substr(2, 4).toUpperCase();
}

function today() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function nowISO() { return new Date().toISOString(); }

// IRS standard business mileage rate ($/mile) for the date of the trip.
// 2026 changed mid-year: 72.5¢ Jan 1–Jun 30, 76¢ from Jul 1.
function irsMileageRate(dateStr) {
  const d = String(dateStr || today()).slice(0, 10);
  if (d >= '2026-07-01') return 0.76;
  if (d >= '2026-01-01') return 0.725;
  if (d >= '2025-01-01') return 0.70;
  return 0.67;
}

function getNextNumber(numKey, prefix) {
  const current = parseInt(getSetting(numKey)) || 1;
  setSetting(numKey, String(current + 1));
  return prefix + '-' + String(current).padStart(4, '0');
}

// ── PIN hashing ───────────────────────────────────────────────
function hashPIN(pin) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(pin));
  return bytes.map(b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join('');
}

// ── Response helpers ─────────────────────────────────────────

function ok(data) {
  return ContentService
    .createTextOutput(JSON.stringify({ status: 'ok', data }))
    .setMimeType(ContentService.MimeType.JSON);
}

function err(msg, code) {
  return ContentService
    .createTextOutput(JSON.stringify({ status: 'error', code: code || 400, message: msg }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Auth ─────────────────────────────────────────────────────

function validateToken(token) {
  if (!token) return null;
  try {
    const decoded = Utilities.newBlob(Utilities.base64Decode(token)).getDataAsString();
    const [userID, pinHash] = decoded.split(':');
    const users = readSheet('Users');
    return users.find(u =>
      u.UserID === userID &&
      String(u.PIN) === String(pinHash) &&
      (u.Active === true || String(u.Active).toUpperCase() === 'TRUE')
    ) || null;
  } catch (e) { return null; }
}

function requireAuth(token) {
  const user = validateToken(token);
  if (!user) throw new Error('UNAUTHORIZED');
  return user;
}

function requireRole(token, roles) {
  const user = requireAuth(token);
  if (!roles.includes(user.Role)) throw new Error('FORBIDDEN');
  return user;
}

function requireRole_safe(token, roles) {
  try {
    const user = validateToken(token);
    return user && roles.includes(user.Role);
  } catch { return false; }
}

// ── Lookup helpers ───────────────────────────────────────────

function lookupCustomer(id) { return findRecord('Customers', 'CustomerID', id); }
function lookupJob(id)       { return findRecord('Jobs', 'JobID', id); }
function lookupEstimate(id)  { return findRecord('Estimates', 'EstimateID', id); }
function lookupInvoice(id)   { return findRecord('Invoices', 'InvoiceID', id); }
function lookupUser(id)      { return findRecord('Users', 'UserID', id); }

function enrichJob(job) {
  if (!job) return job;
  const customer = lookupCustomer(job.CustomerID);
  return { ...job, CustomerName: customer ? customer.Name : '' };
}

function enrichEstimate(est) {
  if (!est) return est;
  const job      = lookupJob(est.JobID);
  const customer = job ? lookupCustomer(job.CustomerID) : null;
  return {
    ...est,
    CustomerID:     customer ? customer.CustomerID : '',
    CustomerName:   customer ? customer.Name : '',
    CustomerEmail:  customer ? customer.Email : '',
    CustomerPhone:  customer ? customer.Phone : '',
    CustomerAddress: customer ? [customer.Address, customer.City, customer.State, customer.Zip].filter(Boolean).join(', ') : '',
    JobDescription: job ? job.Description : '',
    JobDate:        job ? job.JobDate : '',
    JobStatus:      job ? job.Status : '',
    Division:       est.Division || (job ? job.Division : '')
  };
}

function enrichInvoice(inv) {
  if (!inv) return inv;
  const est      = lookupEstimate(inv.EstimateID);
  const job      = est ? lookupJob(est.JobID) : lookupJob(inv.JobID);
  const customer = job ? lookupCustomer(job.CustomerID) : null;
  return {
    ...inv,
    CustomerID:      customer ? customer.CustomerID : '',
    CustomerName:    customer ? customer.Name : '',
    CustomerEmail:   customer ? customer.Email : '',
    CustomerPhone:   customer ? customer.Phone : '',
    CustomerAddress: customer ? [customer.Address, customer.City, customer.State, customer.Zip].filter(Boolean).join(', ') : '',
    JobDescription:  job ? job.Description : '',
    LineItems:       est ? est.LineItems : inv.LineItems,
    EstimateVersion: est ? est.Version : ''
  };
}

// ── Router ───────────────────────────────────────────────────

function doGet(e)  { return handleRequest(e); }
function doPost(e) { return handleRequest(e); }

function handleRequest(e) {
  try {
    const params = e.parameter || {};
    const body   = e.postData ? JSON.parse(e.postData.contents || '{}') : {};
    const action = params.action || body.action;
    const token  = params.token  || body.token;

    switch (action) {
      // System
      case 'ping':              return ok({ message: 'JB Brush Control API v4.7' });
      case 'batch':             return handleBatch(token, body);
      case 'getSettings':       return handleGetSettings(token);
      case 'login':             return handleLogin(body);

      // Users
      case 'getUsers':          return handleGetUsers(token);
      case 'addUser':           return handleAddUser(token, body);
      case 'updateUser':        return handleUpdateUser(token, body);
      case 'deleteUser':        return handleDeleteUser(token, body);
      case 'verifyAdminPIN':    return handleVerifyAdminPIN(token, body);

      // Invites (register link)
      case 'createInvite':      return handleCreateInvite(token, body);
      case 'getInvites':        return handleGetInvites(token);
      case 'cancelInvite':      return handleCancelInvite(token, body);
      case 'checkInvite':       return handleCheckInvite(body.code || params.code);
      case 'registerWithInvite':return handleRegisterWithInvite(body);

      // Hours
      case 'clockIn':           return handleClockIn(token, body);
      case 'clockOut':          return handleClockOut(token, body);
      case 'getHours':          return handleGetHours(token, params);
      case 'addHoursEntry':     return handleAddHoursEntry(token, body);

      // Customers
      case 'getCustomers':      return handleGetCustomers(token, params);
      case 'addCustomer':       return handleAddCustomer(token, body);
      case 'updateCustomer':    return handleUpdateCustomer(token, body);
      case 'deleteCustomer':    return handleDeleteCustomer(token, body);

      // Jobs
      case 'getJobs':           return handleGetJobs(token, params);
      case 'addJob':            return handleAddJob(token, body);
      case 'updateJob':         return handleUpdateJob(token, body);
      case 'deleteJob':         return handleDeleteJob(token, body);

      // Estimates
      case 'getEstimates':      return handleGetEstimates(token, params);
      case 'addEstimate':       return handleAddEstimate(token, body);
      case 'updateEstimate':    return handleUpdateEstimate(token, body);
      case 'acceptEstimate':    return handleAcceptEstimate(token, body);
      case 'rejectEstimate':    return handleRejectEstimate(token, body);
      case 'reviseEstimate':    return handleReviseEstimate(token, body);
      case 'convertToInvoice':  return handleConvertToInvoice(token, body);

      // Invoices
      case 'getInvoices':       return handleGetInvoices(token, params);
      case 'updateInvoice':     return handleUpdateInvoice(token, body);
      case 'getMailtoLink':     return handleGetMailtoLink(token, body);
      case 'markSent':          return handleMarkSent(token, body);
      case 'markPaid':          return handleMarkPaid(token, body);
      case 'getInvoiceLog':     return handleGetInvoiceLog(token, params);

      // Vendors
      case 'getVendors':        return handleGetVendors(token);
      case 'addVendor':         return handleAddVendor(token, body);
      case 'updateVendor':      return handleUpdateVendor(token, body);
      case 'deleteVendor':      return handleDeleteVendor(token, body);

      // Equipment
      case 'getEquipment':      return handleGetEquipment(token);
      case 'addEquipment':      return handleAddEquipment(token, body);
      case 'updateEquipment':   return handleUpdateEquipment(token, body);
      case 'deleteEquipment':   return handleDeleteEquipment(token, body);

      // Mileage
      case 'getMileage':        return handleGetMileage(token, params);
      case 'addMileage':        return handleAddMileage(token, body);
      case 'deleteMileage':     return handleDeleteMileage(token, body);

      // Expenses
      case 'getExpenses':       return handleGetExpenses(token, params);
      case 'addExpense':        return handleAddExpense(token, body);
      case 'updateExpense':     return handleUpdateExpense(token, body);
      case 'deleteExpense':     return handleDeleteExpense(token, body);

      // Licenses
      case 'getLicenses':       return handleGetLicenses(token);
      case 'addLicense':        return handleAddLicense(token, body);
      case 'updateLicense':     return handleUpdateLicense(token, body);
      case 'deleteLicense':     return handleDeleteLicense(token, body);

      // Photos
      case 'addPhoto':          return handleAddPhoto(token, body);
      case 'uploadPhoto':       return handleUploadPhoto(token, body);
      case 'getPhotos':         return handleGetPhotos(token, params);
      case 'deletePhoto':       return handleDeletePhoto(token, body);

      // Dashboard & Reports
      case 'getDashboard':      return handleGetDashboard(token);
      case 'getTaxSummary':     return handleGetTaxSummary(token, params);
      case 'refreshTaxSummary': return handleRefreshTaxSummary(token, params);
      case 'exportCSV':         return handleExportCSV(token, params);

      default: return err('Unknown action: ' + action, 404);
    }
  } catch (e) {
    if (e.message === 'UNAUTHORIZED') return err('Unauthorized', 401);
    if (e.message === 'FORBIDDEN')    return err('Forbidden', 403);
    return err(e.message, 500);
  }
}

// ── Batch ────────────────────────────────────────────────────
// The app asks for several things at once (e.g. a job screen needs jobs,
// estimates, invoices and settings). Each separate request to Apps Script
// costs 1–3 seconds, so they're bundled into one request here, and they
// share the per-request sheet cache too. Read-only ("get…") actions only.
function handleBatch(token, body) {
  const reqs = Array.isArray(body.requests) ? body.requests.slice(0, 20) : [];
  return ok(reqs.map(r => {
    if (!r || !/^get[A-Z]/.test(String(r.action))) return { status: 'error', code: 400, message: 'Not allowed in batch' };
    try {
      const out = handleRequest({ parameter: Object.assign({}, r.params || {}, { action: r.action, token: token }) });
      return JSON.parse(out.getContent());
    } catch (e) { return { status: 'error', code: 500, message: e.message }; }
  }));
}

// ============================================================
// SETTINGS
// ============================================================

function handleGetSettings(token) {
  requireAuth(token);
  const sheet    = getSheet('Settings');
  const keys     = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const vals     = sheet.getRange(2, 1, 1, sheet.getLastColumn()).getValues()[0];
  const settings = {};
  keys.forEach((k, i) => { if (k) settings[k] = vals[i] ?? ''; });
  delete settings.SECRET_KEY;
  return ok(settings);
}

// ============================================================
// AUTH / LOGIN
// ============================================================

// ── Login lockout ────────────────────────────────────────────
// The API address is public and PINs are 4 digits, so without this anyone
// could try all 10,000 PINs. After 5 wrong PINs within 15 minutes, PIN login
// is locked for 30 minutes and the owner gets an email.
// To unlock early: run unlockLogins() from the Apps Script editor.
const LOGIN_MAX_FAILS   = 5;
const LOGIN_WINDOW_MS   = 15 * 60 * 1000;
const LOGIN_LOCK_MS     = 30 * 60 * 1000;

function loginLockRemainingMs() {
  const until = Number(PropertiesService.getScriptProperties().getProperty('login_lock_until') || 0);
  return Math.max(0, until - Date.now());
}

function recordLoginFailure() {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const props = PropertiesService.getScriptProperties();
    const now   = Date.now();
    let first   = Number(props.getProperty('login_first_fail') || 0);
    let fails   = Number(props.getProperty('login_fails') || 0);
    if (!first || now - first > LOGIN_WINDOW_MS) { first = now; fails = 0; }
    fails++;
    if (fails >= LOGIN_MAX_FAILS) {
      props.setProperty('login_lock_until', String(now + LOGIN_LOCK_MS));
      props.deleteProperty('login_fails');
      props.deleteProperty('login_first_fail');
      notifyLoginLockout(fails);
    } else {
      props.setProperty('login_fails', String(fails));
      props.setProperty('login_first_fail', String(first));
    }
  } finally { lock.releaseLock(); }
}

function clearLoginFailures() {
  const props = PropertiesService.getScriptProperties();
  props.deleteProperty('login_fails');
  props.deleteProperty('login_first_fail');
}

function notifyLoginLockout(fails) {
  try {
    const to = getSetting('Email');
    if (!to) return;
    const company = getSetting('CompanyName') || 'JB Brush Control';
    GmailApp.sendEmail(to, '⚠️ ' + company + ': app login locked',
      fails + ' wrong PINs were entered in the JB Brush Control app within 15 minutes, ' +
      'so PIN login is locked for 30 minutes.\n\n' +
      'If this was someone on your team mistyping, nothing else is needed — it unlocks by itself, ' +
      'or run unlockLogins() in the Apps Script editor to unlock now.\n\n' +
      'If this keeps happening and it wasn\'t your team, someone may be guessing PINs: ' +
      'change everyone\'s PIN in the admin panel (Users).', { name: company });
  } catch (e) { Logger.log('Lockout email failed: ' + e.message); }
}

// Run from the Apps Script editor to end a lockout early.
function unlockLogins() {
  PropertiesService.getScriptProperties().deleteProperty('login_lock_until');
  clearLoginFailures();
  Logger.log('Logins unlocked');
}

function handleLogin(body) {
  const { name, pin } = body;
  if (!pin) return err('PIN required');
  const lockedMs = loginLockRemainingMs();
  if (lockedMs > 0) {
    const mins = Math.ceil(lockedMs / 60000);
    return err('Too many wrong PINs. Login is locked — try again in ' + mins + ' minute' + (mins === 1 ? '' : 's') + '.', 429);
  }
  const pinHash = hashPIN(pin);
  const users   = readSheet('Users');
  let user;
  if (name) {
    user = users.find(u =>
      String(u.Name).toLowerCase().trim() === String(name).toLowerCase().trim() &&
      String(u.PIN) === pinHash &&
      (u.Active === true || String(u.Active).toUpperCase() === 'TRUE')
    );
  } else {
    user = users.find(u =>
      String(u.PIN) === pinHash &&
      (u.Active === true || String(u.Active).toUpperCase() === 'TRUE')
    );
  }
  if (!user) { recordLoginFailure(); return err('Invalid PIN', 401); }
  clearLoginFailures();
  const token = Utilities.base64Encode(user.UserID + ':' + pinHash);
  return ok({ token, user: { UserID: user.UserID, Name: user.Name, Role: user.Role, Email: user.Email } });
}

// Admin must verify their own PIN before viewing/resetting another user's PIN
function handleVerifyAdminPIN(token, body) {
  const admin = requireRole(token, ['owner', 'admin']);
  const pinHash = hashPIN(body.pin);
  if (loginLockRemainingMs() > 0) return err('Too many wrong PINs. Try again later.', 429);
  if (String(admin.PIN) !== pinHash) { recordLoginFailure(); return err('Incorrect PIN', 401); }
  // Return the target user's plain PIN (only works if admin just verified)
  if (body.targetUserID) {
    const target = findRecord('Users', 'UserID', body.targetUserID);
    if (!target) return err('User not found', 404);
    return ok({ verified: true, userID: target.UserID, name: target.Name });
  }
  return ok({ verified: true });
}

// ============================================================
// USERS
// ============================================================

function handleGetUsers(token) {
  requireRole(token, ['owner', 'admin']);
  return ok(readSheet('Users').map(u => ({ ...u, PIN: '••••' })));
}

function handleAddUser(token, body) {
  requireRole(token, ['owner', 'admin']);
  if (!body.PIN) return err('PIN is required');
  const pinHash = hashPIN(body.PIN);
  // Enforce unique PIN
  const users = readSheet('Users');
  const dup = users.find(u =>
    String(u.PIN) === pinHash &&
    (u.Active === true || String(u.Active).toUpperCase() === 'TRUE')
  );
  if (dup) return err('That PIN is already in use by ' + dup.Name + '. Please choose a different PIN.', 409);
  const user = {
    UserID: generateID('USR'), Name: body.Name || '', Email: body.Email || '',
    PIN: pinHash, Role: body.Role || 'employee', Active: true, CreatedDate: today()
  };
  appendRow('Users', user);
  return ok({ message: 'User added', UserID: user.UserID });
}

function handleUpdateUser(token, body) {
  requireRole(token, ['owner', 'admin']);
  const updates = { ...body };
  if (body.PIN && body.PIN !== '••••') {
    const pinHash = hashPIN(body.PIN);
    // Check uniqueness (excluding self)
    const users = readSheet('Users');
    const dup = users.find(u =>
      String(u.PIN) === pinHash &&
      u.UserID !== body.UserID &&
      (u.Active === true || String(u.Active).toUpperCase() === 'TRUE')
    );
    if (dup) return err('That PIN is already in use by ' + dup.Name + '. Please choose a different PIN.', 409);
    updates.PIN = pinHash;
  } else {
    delete updates.PIN; // Don't update PIN if it's masked or empty
  }
  return updateRecord('Users', 'UserID', body.UserID, updates)
    ? ok({ message: 'User updated' }) : err('User not found', 404);
}

function handleDeleteUser(token, body) {
  requireRole(token, ['owner', 'admin']);
  return updateRecord('Users', 'UserID', body.UserID, { Active: false })
    ? ok({ message: 'User deactivated' }) : err('User not found', 404);
}

// ============================================================
// INVITES — an owner/admin creates a one-time link; the new person opens it,
// enters their name and picks a PIN. Links expire after 7 days. Stored in
// Script Properties (Project Settings → Script Properties), not the sheet.
// ============================================================

const INVITE_DAYS     = 7;
const INVITE_MAX_TAKEN = 5;   // wrong "PIN already taken" tries before the link stops working

function inviteKey(code) { return 'invite_' + String(code || '').replace(/[^A-Za-z0-9]/g, ''); }

function readInvite(code) {
  const raw = PropertiesService.getScriptProperties().getProperty(inviteKey(code));
  if (!raw) return null;
  const inv = JSON.parse(raw);
  if (Date.now() > inv.expires) { PropertiesService.getScriptProperties().deleteProperty(inviteKey(code)); return null; }
  return inv;
}

function handleCreateInvite(token, body) {
  const admin = requireRole(token, ['owner', 'admin']);
  const role  = ['employee', 'admin', 'owner'].includes(body.Role) ? body.Role : 'employee';
  if (role === 'owner' && admin.Role !== 'owner') return err('Only an owner can invite another owner', 403);
  const code = Utilities.getUuid().replace(/-/g, '');
  const inv  = {
    code: code, role: role, name: String(body.Name || '').trim(),
    createdBy: admin.Name, created: Date.now(), expires: Date.now() + INVITE_DAYS * 86400000, taken: 0
  };
  PropertiesService.getScriptProperties().setProperty(inviteKey(code), JSON.stringify(inv));
  return ok({ code: code, role: role, name: inv.name, expires: new Date(inv.expires).toISOString() });
}

function handleGetInvites(token) {
  requireRole(token, ['owner', 'admin']);
  const props = PropertiesService.getScriptProperties();
  const all   = props.getProperties();
  const list  = [];
  Object.keys(all).forEach(k => {
    if (k.indexOf('invite_') !== 0) return;
    const inv = JSON.parse(all[k]);
    if (Date.now() > inv.expires) { props.deleteProperty(k); return; }
    list.push({ code: inv.code, role: inv.role, name: inv.name, createdBy: inv.createdBy,
                created: new Date(inv.created).toISOString(), expires: new Date(inv.expires).toISOString() });
  });
  list.sort((a, b) => a.created < b.created ? 1 : -1);
  return ok(list);
}

function handleCancelInvite(token, body) {
  requireRole(token, ['owner', 'admin']);
  PropertiesService.getScriptProperties().deleteProperty(inviteKey(body.code));
  return ok({ message: 'Invite canceled' });
}

// Public: lets the register page say "You've been invited as an employee"
function handleCheckInvite(code) {
  const inv = readInvite(code);
  if (!inv) return err('This invite link is no longer valid. Ask for a new one.', 404);
  return ok({ role: inv.role, name: inv.name, createdBy: inv.createdBy });
}

// Public: create the account from an invite, and log them in
// PINs anyone would try first: 0000, 1111 … 9999, 1234-style runs (up or
// down), and a few favorites. Refused with the same message as a PIN that's
// already in use, so nobody can tell someone else has it.
function isEasyPIN(pin) {
  if (/^(\d)\1{3}$/.test(pin)) return true;                       // 1111
  const d = pin.split('').map(Number);
  const up = d.every((x, i) => i === 0 || x === d[i - 1] + 1);
  const down = d.every((x, i) => i === 0 || x === d[i - 1] - 1);
  if (up || down) return true;                                     // 1234, 4321
  return ['1212','1122','1313','2580','0852','1004','2000','6969','1010','2020','0101','1357','2468','7777'].includes(pin);
}

function handleRegisterWithInvite(body) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const inv = readInvite(body.code);
    if (!inv) return err('This invite link is no longer valid. Ask for a new one.', 404);
    const name = String(body.Name || '').trim();
    const pin  = String(body.PIN || '');
    if (!name) return err('Please enter your name');
    if (!/^\d{4}$/.test(pin)) return err('PIN must be exactly 4 digits');

    const PICK_ANOTHER = 'That PIN is too easy to guess. Please pick a different one.';
    if (isEasyPIN(pin)) return err(PICK_ANOTHER, 409);

    const pinHash = hashPIN(pin);
    const users   = readSheet('Users');
    const taken   = users.some(u => String(u.PIN) === pinHash && (u.Active === true || String(u.Active).toUpperCase() === 'TRUE'));
    if (taken) {
      // Limit tries so an invite can't be used to discover other people's PINs
      inv.taken = (inv.taken || 0) + 1;
      const props = PropertiesService.getScriptProperties();
      if (inv.taken >= INVITE_MAX_TAKEN) {
        props.deleteProperty(inviteKey(body.code));
        return err('Too many tries. This invite link no longer works — ask for a new one.', 429);
      }
      props.setProperty(inviteKey(body.code), JSON.stringify(inv));
      return err(PICK_ANOTHER, 409);   // same wording as an easy PIN — don't reveal it's in use
    }

    const user = {
      UserID: generateID('USR'), Name: name, Email: String(body.Email || '').trim(),
      PIN: pinHash, Role: inv.role, Active: true, CreatedDate: today()
    };
    appendRow('Users', user);
    PropertiesService.getScriptProperties().deleteProperty(inviteKey(body.code));   // one use only
    const token = Utilities.base64Encode(user.UserID + ':' + pinHash);
    return ok({ token: token, user: { UserID: user.UserID, Name: user.Name, Role: user.Role, Email: user.Email } });
  } finally { lock.releaseLock(); }
}

// ============================================================
// CLOCK IN / OUT
// ============================================================

function handleClockIn(token, body) {
  const user  = requireAuth(token);
  const hours = readSheet('Hours');
  const open  = hours.find(h => String(h.EmployeeID) === user.UserID && !h.ClockOut);
  if (open) return err('Already clocked in since ' + open.ClockIn);
  const entry = {
    HoursID: generateID('HRS'), EmployeeID: user.UserID,
    ClockIn: nowISO(), ClockOut: '', TotalHours: '',
    JobID: body.JobID || '', Notes: body.Notes || '', Date: today()
  };
  appendRow('Hours', entry);
  return ok({ message: 'Clocked in', ClockIn: entry.ClockIn, HoursID: entry.HoursID });
}

function handleClockOut(token, body) {
  const user  = requireAuth(token);
  const sheet = getSheet('Hours');
  const data  = sheet.getDataRange().getValues();
  const hdrs  = data[0];
  const empCol = hdrs.indexOf('EmployeeID'), outCol = hdrs.indexOf('ClockOut');
  const inCol  = hdrs.indexOf('ClockIn'),    totalCol = hdrs.indexOf('TotalHours');
  for (let i = data.length - 1; i >= 1; i--) {
    if (String(data[i][empCol]) === user.UserID && !data[i][outCol]) {
      const total = Math.round(((new Date() - new Date(data[i][inCol])) / 3600000) * 100) / 100;
      sheet.getRange(i + 1, outCol + 1).setValue(new Date().toISOString());
      sheet.getRange(i + 1, totalCol + 1).setValue(total);
      if (body.JobID) sheet.getRange(i + 1, hdrs.indexOf('JobID') + 1).setValue(body.JobID);
      if (body.Notes) sheet.getRange(i + 1, hdrs.indexOf('Notes') + 1).setValue(body.Notes);
      invalidate('Hours');
      return ok({ message: 'Clocked out', TotalHours: total });
    }
  }
  return err('No open clock-in found');
}

function handleGetHours(token, params) {
  const user = requireAuth(token);
  let hours  = readSheet('Hours').map(h => {
    const emp = lookupUser(h.EmployeeID);
    return { ...h, EmployeeName: emp ? emp.Name : h.EmployeeID };
  });
  if (!['owner', 'admin'].includes(user.Role)) hours = hours.filter(h => h.EmployeeID === user.UserID);
  if (params.startDate)  hours = hours.filter(h => h.Date >= params.startDate);
  if (params.endDate)    hours = hours.filter(h => h.Date <= params.endDate);
  if (params.employeeID) hours = hours.filter(h => h.EmployeeID === params.employeeID);
  return ok(hours);
}

function handleAddHoursEntry(token, body) {
  const user       = requireAuth(token);
  const employeeID = (requireRole_safe(token, ['owner', 'admin']) && body.EmployeeID)
    ? body.EmployeeID : user.UserID;
  const entry = {
    HoursID:    generateID('HRS'),
    EmployeeID: employeeID,
    ClockIn:    body.ClockIn    || '',
    ClockOut:   body.ClockOut   || '',
    TotalHours: parseFloat(body.TotalHours) || 0,
    JobID:      body.JobID      || '',
    Notes:      body.Notes      || '',
    Date:       body.Date       || today()
  };
  appendRow('Hours', entry);
  return ok({ message: 'Hours logged', HoursID: entry.HoursID });
}

// ============================================================
// CUSTOMERS
// ============================================================

function handleGetCustomers(token, params) {
  requireAuth(token);
  let c = readSheet('Customers');
  if (params.division)   c = c.filter(x => x.Division === params.division || x.Division === 'Both');
  if (params.activeOnly === 'true') c = c.filter(x => String(x.Active).toUpperCase() === 'TRUE');
  return ok(c);
}

function handleAddCustomer(token, body) {
  requireAuth(token);
  const c = {
    CustomerID: generateID('CUS'), Name: body.Name || '', Phone: body.Phone || '',
    Email: body.Email || '', Address: body.Address || '', City: body.City || '',
    State: body.State || 'IN', Zip: body.Zip || '', Division: body.Division || 'Spray',
    Notes: body.Notes || '', Active: true
  };
  appendRow('Customers', c);
  return ok({ message: 'Customer added', CustomerID: c.CustomerID });
}

function handleUpdateCustomer(token, body) {
  requireAuth(token);
  return updateRecord('Customers', 'CustomerID', body.CustomerID, body)
    ? ok({ message: 'Customer updated' }) : err('Customer not found', 404);
}

function handleDeleteCustomer(token, body) {
  requireRole(token, ['owner', 'admin']);
  return updateRecord('Customers', 'CustomerID', body.CustomerID, { Active: false })
    ? ok({ message: 'Customer deactivated' }) : err('Customer not found', 404);
}

// ============================================================
// JOBS
// Status flow: Estimate → Scheduled → Finished | Canceled
// ============================================================

function handleGetJobs(token, params) {
  requireAuth(token);
  let jobs = readSheet('Jobs').map(enrichJob);
  if (params.division)   jobs = jobs.filter(j => j.Division === params.division);
  if (params.status)     jobs = jobs.filter(j => j.Status === params.status);
  if (params.customerID) jobs = jobs.filter(j => j.CustomerID === params.customerID);
  // My Jobs: exclude Canceled and Finished
  if (params.active === 'true') jobs = jobs.filter(j => !['Canceled','Finished'].includes(j.Status));
  return ok(jobs);
}

function handleAddJob(token, body) {
  requireAuth(token);
  const job = {
    JobID:       generateID('JOB'),
    CustomerID:  body.CustomerID  || '',
    Division:    body.Division    || 'Spray',
    Description: body.Description || '',
    Status:      body.Status      || 'Estimate',
    Priority:    body.Priority    || 'Normal',
    JobDate:     body.JobDate     || '',
    Notes:       body.Notes       || ''
  };
  appendRow('Jobs', job);
  return ok({ message: 'Job added', JobID: job.JobID });
}

function handleUpdateJob(token, body) {
  requireAuth(token);
  const allowed = ['CustomerID','Division','Description','Status','Priority','JobDate','Notes'];
  const updates = {};
  allowed.forEach(k => { if (body[k] !== undefined) updates[k] = body[k]; });
  return updateRecord('Jobs', 'JobID', body.JobID, updates)
    ? ok({ message: 'Job updated' }) : err('Job not found', 404);
}

function handleDeleteJob(token, body) {
  requireRole(token, ['owner', 'admin']);
  return updateRecord('Jobs', 'JobID', body.JobID, { Status: 'Canceled' })
    ? ok({ message: 'Job canceled' }) : err('Job not found', 404);
}

// ============================================================
// ESTIMATES
// Status flow: Pending → Accepted → Invoice | Rejected
// ============================================================

function handleGetEstimates(token, params) {
  requireAuth(token);
  let ests = readSheet('Estimates').map(enrichEstimate);
  if (params.jobID)  ests = ests.filter(e => e.JobID === params.jobID);
  if (params.status) ests = ests.filter(e => e.Status === params.status);
  return ok(ests);
}

function handleAddEstimate(token, body) {
  requireAuth(token);
  const prefix   = getSetting('EstimatePrefix') || 'EST';
  const estID    = getNextNumber('NextEstimateNum', prefix);
  const subtotal = parseFloat(body.Subtotal) || 0;
 
  // Only use settings tax rate if body.TaxRate is not explicitly provided
  const taxRate  = (body.TaxRate !== undefined && body.TaxRate !== null && body.TaxRate !== '')
    ? parseFloat(body.TaxRate)
    : parseFloat(getSetting('TaxRate')) || 0;
 
  const taxAmount = Math.round(subtotal * taxRate * 100) / 100;
  const est = {
    EstimateID:   estID,
    JobID:        body.JobID   || '',
    Version:      'Initial',
    EstimateDate: body.EstimateDate || today(),
    LineItems:    typeof body.LineItems === 'object' ? JSON.stringify(body.LineItems) : (body.LineItems || ''),
    Subtotal:     subtotal,
    TaxRate:      taxRate,
    TaxAmount:    taxAmount,
    Total:        Math.round((subtotal + taxAmount) * 100) / 100,
    Status:       'Pending',
    ApprovedDate: '',
    Notes:        body.Notes || ''
  };
  appendRow('Estimates', est);
  return ok({ message: 'Estimate created', EstimateID: estID, Total: est.Total });
}

function handleUpdateEstimate(token, body) {
  requireAuth(token);
  return updateRecord('Estimates', 'EstimateID', body.EstimateID, body)
    ? ok({ message: 'Estimate updated' }) : err('Estimate not found', 404);
}

// Accept estimate → Job becomes Scheduled (prompt for date on frontend)
function handleAcceptEstimate(token, body) {
  requireRole(token, ['owner', 'admin']);
  const est = findRecord('Estimates', 'EstimateID', body.EstimateID);
  if (!est) return err('Estimate not found', 404);
  updateRecord('Estimates', 'EstimateID', body.EstimateID, { Status: 'Accepted', ApprovedDate: today() });
  const jobUpdates = { Status: 'Scheduled' };
  if (body.JobDate) jobUpdates.JobDate = body.JobDate;   // date picked when accepting
  updateRecord('Jobs', 'JobID', est.JobID, jobUpdates);
  return ok({ message: 'Estimate accepted, job scheduled', JobID: est.JobID });
}

// Reject estimate → Job becomes Canceled
function handleRejectEstimate(token, body) {
  requireRole(token, ['owner', 'admin']);
  
  // Find the estimate
  const sheet = getSheet('Estimates');
  const data  = sheet.getDataRange().getValues();
  const hdrs  = data[0];
  const estIDCol = hdrs.indexOf('EstimateID');
  const jobIDCol = hdrs.indexOf('JobID');
  const statusCol = hdrs.indexOf('Status');
  
  let jobID = null;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][estIDCol]).trim() === String(body.EstimateID).trim()) {
      jobID = String(data[i][jobIDCol]).trim();
      sheet.getRange(i + 1, statusCol + 1).setValue('Rejected');
      break;
    }
  }
  
  if (!jobID) return err('Estimate not found', 404);
  
  // Update the job status
  const jobSheet = getSheet('Jobs');
  const jobData  = jobSheet.getDataRange().getValues();
  const jobHdrs  = jobData[0];
  const jobIDCol2   = jobHdrs.indexOf('JobID');
  const jobStatusCol = jobHdrs.indexOf('Status');
  
  let jobFound = false;
  for (let i = 1; i < jobData.length; i++) {
    if (String(jobData[i][jobIDCol2]).trim() === jobID) {
      jobSheet.getRange(i + 1, jobStatusCol + 1).setValue('Canceled');
      jobFound = true;
      break;
    }
  }
  
  invalidate('Estimates'); invalidate('Jobs');
  Logger.log('Reject estimate: ' + body.EstimateID + ', jobID: ' + jobID + ', jobFound: ' + jobFound);
  
  return ok({ message: 'Estimate rejected, job canceled', JobID: jobID, jobFound: jobFound });
}
function handleReviseEstimate(token, body) {
  requireAuth(token);
  const original = findRecord('Estimates', 'EstimateID', body.EstimateID);
  if (!original) return err('Estimate not found', 404);
  const prefix    = getSetting('EstimatePrefix') || 'EST';
  const estID     = getNextNumber('NextEstimateNum', prefix);
  const subtotal  = parseFloat(body.Subtotal) || parseFloat(original.Subtotal) || 0;
  const taxRate   = parseFloat(body.TaxRate)  || parseFloat(original.TaxRate)  || 0;
  const taxAmount = Math.round(subtotal * taxRate * 100) / 100;
  const revised = {
    EstimateID:   estID,
    JobID:        original.JobID,
    Version:      'Revised',
    EstimateDate: today(),
    LineItems:    typeof body.LineItems === 'object' ? JSON.stringify(body.LineItems) : (body.LineItems || original.LineItems),
    Subtotal:     subtotal, TaxRate: taxRate, TaxAmount: taxAmount,
    Total:        Math.round((subtotal + taxAmount) * 100) / 100,
    Status:       'Pending', ApprovedDate: '',
    Notes:        body.Notes || ('Revised from ' + body.EstimateID)
  };
  appendRow('Estimates', revised);
  updateRecord('Estimates', 'EstimateID', body.EstimateID, { Status: 'Superseded' });
  return ok({ message: 'Revised estimate created', EstimateID: estID, Total: revised.Total });
}

// Convert to invoice → Job becomes Finished, removed from active jobs
function handleConvertToInvoice(token, body) {
  requireRole(token, ['owner', 'admin']);
  const est = findRecord('Estimates', 'EstimateID', body.EstimateID);
  if (!est) return err('Estimate not found', 404);
  if (est.Status === 'Invoice') return err('Already converted to invoice');
  const job    = lookupJob(est.JobID);
  const prefix = getSetting('InvoicePrefix') || 'JB';
  const invID  = getNextNumber('NextInvoiceNum', prefix);
  const invoice = {
    InvoiceID:  invID,
    EstimateID: est.EstimateID,
    JobID:      est.JobID,
    Division:   job ? job.Division : '',
    IssueDate:  today(),
    DueDate:    body.DueDate || '',
    LineItems:  est.LineItems,
    Subtotal:   est.Subtotal,
    TaxRate:    est.TaxRate,
    TaxAmount:  est.TaxAmount,
    Total:      est.Total,
    Status:     'Awaiting Payment',
    PaidDate:   '',
    PaymentMethod: '',
    Notes:      body.Notes || ('Converted from ' + est.EstimateID)
  };
  appendRow('Invoices', invoice);
  // Update estimate status to Invoice, job to Finished
  updateRecord('Estimates', 'EstimateID', est.EstimateID, { Status: 'Invoice', ApprovedDate: today() });
  updateRecord('Jobs', 'JobID', est.JobID, { Status: 'Finished' });
  const enriched = enrichInvoice(invoice);
  appendRow('InvoiceLog', {
    LogID: generateID('LOG'), invoiceID: invID, Event: 'Created',
    EventDate: nowISO(), CustomerEmail: enriched.CustomerEmail || '',
    Notes: 'Converted from estimate ' + est.EstimateID
  });
  return ok({ message: 'Invoice created', InvoiceID: invID, Total: est.Total });
}

// ============================================================
// INVOICES
// Status flow: Awaiting Payment → Paid
// ============================================================

function handleGetInvoices(token, params) {
  requireAuth(token);
  let invs = readSheet('Invoices').map(enrichInvoice);
  if (params.status)     invs = invs.filter(i => i.Status === params.status);
  if (params.division)   invs = invs.filter(i => i.Division === params.division);
  if (params.customerID) invs = invs.filter(i => i.CustomerID === params.customerID);
  return ok(invs);
}

function handleUpdateInvoice(token, body) {
  requireRole(token, ['owner', 'admin']);
  return updateRecord('Invoices', 'InvoiceID', body.InvoiceID, body)
    ? ok({ message: 'Invoice updated' }) : err('Invoice not found', 404);
}

function handleGetMailtoLink(token, body) {
  requireRole(token, ['owner', 'admin']);
  const inv = findRecord('Invoices', 'InvoiceID', body.InvoiceID);
  if (!inv) return err('Invoice not found', 404);
  const enriched = enrichInvoice(inv);
  const company  = getSetting('CompanyName') || 'JB Brush Control';
  const phone    = getSetting('Phone') || '';
  const email    = enriched.CustomerEmail || '';
  let lineItemsText = '';
  try {
    const items = JSON.parse(inv.LineItems || enriched.LineItems);
    if (Array.isArray(items)) {
      lineItemsText = items.map(item => item.description + '  $' + parseFloat(item.amount || 0).toFixed(2)).join('\n');
    }
  } catch(e) { lineItemsText = inv.LineItems || ''; }
  const subject  = encodeURIComponent('Invoice ' + inv.InvoiceID + ' from ' + company + ' — $' + parseFloat(inv.Total).toFixed(2));
  const bodyText = encodeURIComponent(
    'Dear ' + enriched.CustomerName + ',\n\n' +
    'Invoice #: ' + inv.InvoiceID + '\n' +
    'Date: ' + inv.IssueDate + '\n' +
    'Due Date: ' + (inv.DueDate || 'Upon receipt') + '\n\n' +
    '--- LINE ITEMS ---\n' + lineItemsText + '\n\n' +
    'Subtotal: $' + parseFloat(inv.Subtotal).toFixed(2) + '\n' +
    'Tax: $' + parseFloat(inv.TaxAmount).toFixed(2) + '\n' +
    'TOTAL DUE: $' + parseFloat(inv.Total).toFixed(2) + '\n\n' +
    'Thank you for your business!\n' + company + (phone ? '\n' + phone : '')
  );
  // Also return full invoice data for PDF generation
  return ok({
    mailtoLink:    'mailto:' + email + '?subject=' + subject + '&body=' + bodyText,
    customerEmail: email,
    invoiceID:     inv.InvoiceID,
    total:         inv.Total,
    invoice:       enriched
  });
}

function handleMarkSent(token, body) {
  requireRole(token, ['owner', 'admin']);
  const inv = findRecord('Invoices', 'InvoiceID', body.InvoiceID);
  if (!inv) return err('Invoice not found', 404);
  updateRecord('Invoices', 'InvoiceID', body.InvoiceID, { Status: 'Awaiting Payment' });
  const enriched = enrichInvoice(inv);
  appendRow('InvoiceLog', {
    LogID: generateID('LOG'), invoiceID: body.InvoiceID, Event: 'Sent',
    EventDate: nowISO(), CustomerEmail: enriched.CustomerEmail || '',
    Notes: body.Notes || ''
  });
  return ok({ message: 'Invoice marked as sent' });
}

function handleMarkPaid(token, body) {
  requireRole(token, ['owner', 'admin']);
  const inv = findRecord('Invoices', 'InvoiceID', body.InvoiceID);
  if (!inv) return err('Invoice not found', 404);
  const paidDate = body.PaidDate || today();
  updateRecord('Invoices', 'InvoiceID', body.InvoiceID, {
    Status: 'Paid',
    PaidDate: paidDate,
    PaymentMethod: body.PaymentMethod || ''
  });
  const enriched = enrichInvoice(inv);
  appendRow('InvoiceLog', {
    LogID: generateID('LOG'), invoiceID: body.InvoiceID, Event: 'Paid',
    EventDate: nowISO(), CustomerEmail: enriched.CustomerEmail || '',
    Notes: (body.PaymentMethod ? 'Payment method: ' + body.PaymentMethod + '. ' : '') + (body.Notes || '')
  });
  return ok({ message: 'Invoice marked as paid', PaidDate: paidDate });
}

function handleGetInvoiceLog(token, params) {
  requireAuth(token);
  let logs = readSheet('InvoiceLog');
  if (params.invoiceID) logs = logs.filter(l => l.invoiceID === params.invoiceID);
  return ok(logs);
}

// ============================================================
// VENDORS
// ============================================================

function handleGetVendors(token) {
  requireAuth(token);
  return ok(readSheet('Vendors'));
}

function handleAddVendor(token, body) {
  requireRole(token, ['owner', 'admin']);
  const v = {
    VendorID:  generateID('VEN'),
    Name:      body.Name     || '',
    Category:  body.Category || '',
    Phone:     body.Phone    || '',
    Address:   body.Address  || '',
    Notes:     body.Notes    || '',
    Active:    true
  };
  appendRow('Vendors', v);
  return ok({ message: 'Vendor added', VendorID: v.VendorID });
}

function handleUpdateVendor(token, body) {
  requireRole(token, ['owner', 'admin']);
  return updateRecord('Vendors', 'VendorID', body.VendorID, body)
    ? ok({ message: 'Vendor updated' }) : err('Vendor not found', 404);
}

function handleDeleteVendor(token, body) {
  requireRole(token, ['owner', 'admin']);
  return updateRecord('Vendors', 'VendorID', body.VendorID, { Active: false })
    ? ok({ message: 'Vendor deactivated' }) : err('Vendor not found', 404);
}

// ============================================================
// EQUIPMENT
// ============================================================

function handleGetEquipment(token) {
  requireAuth(token);
  return ok(readSheet('Equipment'));
}

function handleAddEquipment(token, body) {
  requireRole(token, ['owner', 'admin']);
  const e = {
    EquipmentID:  generateID('EQP'),
    Name:         body.Name         || '',
    Type:         body.Type         || 'Truck',
    LicensePlate: body.LicensePlate || '',
    Year:         body.Year         || '',
    Make:         body.Make         || '',
    Model:        body.Model        || '',
    Notes:        body.Notes        || '',
    Active:       true
  };
  appendRow('Equipment', e);
  return ok({ message: 'Equipment added', EquipmentID: e.EquipmentID });
}

function handleUpdateEquipment(token, body) {
  requireRole(token, ['owner', 'admin']);
  return updateRecord('Equipment', 'EquipmentID', body.EquipmentID, body)
    ? ok({ message: 'Equipment updated' }) : err('Equipment not found', 404);
}

function handleDeleteEquipment(token, body) {
  requireRole(token, ['owner', 'admin']);
  return updateRecord('Equipment', 'EquipmentID', body.EquipmentID, { Active: false })
    ? ok({ message: 'Equipment deactivated' }) : err('Equipment not found', 404);
}

// ============================================================
// MILEAGE
// ============================================================

function handleGetMileage(token, params) {
  const user = requireAuth(token);
  let miles  = readSheet('Mileage').map(m => {
    const equip = findRecord('Equipment', 'EquipmentID', m.EquipmentID);
    const emp   = lookupUser(m.EmployeeID);
    return { ...m, TruckName: equip ? equip.Name : (m.TruckName || ''), DriverName: emp ? emp.Name : m.EmployeeID };
  });
  if (!['owner', 'admin'].includes(user.Role)) miles = miles.filter(m => m.EmployeeID === user.UserID);
  if (params.startDate)   miles = miles.filter(m => m.Date >= params.startDate);
  if (params.endDate)     miles = miles.filter(m => m.Date <= params.endDate);
  if (params.division)    miles = miles.filter(m => m.Division === params.division);
  if (params.equipmentID) miles = miles.filter(m => m.EquipmentID === params.equipmentID);
  return ok(miles);
}

function handleAddMileage(token, body) {
  const user  = requireAuth(token);
  const start = parseFloat(body.StartMiles) || 0;
  const end   = parseFloat(body.EndMiles)   || 0;
  const total = parseFloat(body.TotalMiles) || Math.max(0, end - start);
  const entry = {
    MileageID:   generateID('MIL'),
    Date:        body.Date        || today(),
    EquipmentID: body.EquipmentID || '',
    TruckName:   body.TruckName   || '',
    EmployeeID:  user.UserID,
    JobID:       body.JobID       || '',
    StartMiles:  start, EndMiles: end, TotalMiles: total,
    Purpose:     body.Purpose     || '',
    Division:    body.Division    || '',
    PointA:      body.PointA      || '',
    PointB:      body.PointB      || '',
    Rounds:      parseInt(body.Rounds) || 1
  };
  appendRow('Mileage', entry);
  return ok({ message: 'Mileage logged', TotalMiles: total, Deduction: Math.round(total * irsMileageRate(entry.Date) * 100) / 100 });
}

function handleDeleteMileage(token, body) {
  requireRole(token, ['owner', 'admin']);
  return deleteRecord('Mileage', 'MileageID', body.MileageID)
    ? ok({ message: 'Mileage entry deleted' }) : err('Entry not found', 404);
}

// ============================================================
// EXPENSES
// Category includes: Fuel, Chemical, Parts and Repairs, Supplies,
// Assets, Taxes and Licenses, Insurance, Other
// ============================================================

function handleGetExpenses(token, params) {
  requireAuth(token);
  let e = readSheet('Expenses');
  if (params.startDate) e = e.filter(x => x.Date >= params.startDate);
  if (params.endDate)   e = e.filter(x => x.Date <= params.endDate);
  if (params.category)  e = e.filter(x => x.Category === params.category);
  if (params.division)  e = e.filter(x => x.Division === params.division);
  return ok(e);
}

function handleAddExpense(token, body) {
  const user = requireAuth(token);
  const e = {
    ExpenseID:   generateID('EXP'),
    Date:        body.Date        || today(),
    Category:    body.Category    || 'Other',
    Description: body.Description || '',
    Amount:      parseFloat(body.Amount) || 0,
    Vendor:      body.Vendor      || '',
    EmployeeID:  user.UserID,
    JobID:       body.JobID       || '',
    Division:    body.Division    || '',
    ReceiptFileID: body.ReceiptFileID || '',
    ReceiptUrl:  body.ReceiptUrl  || '',
    Notes:       body.Notes       || ''
  };
  appendRow('Expenses', e);
  return ok({ message: 'Expense logged', ExpenseID: e.ExpenseID });
}

function handleUpdateExpense(token, body) {
  requireRole(token, ['owner', 'admin']);
  return updateRecord('Expenses', 'ExpenseID', body.ExpenseID, body)
    ? ok({ message: 'Expense updated' }) : err('Expense not found', 404);
}

function handleDeleteExpense(token, body) {
  requireRole(token, ['owner', 'admin']);
  return deleteRecord('Expenses', 'ExpenseID', body.ExpenseID)
    ? ok({ message: 'Expense deleted' }) : err('Expense not found', 404);
}

// ============================================================
// LICENSES
// ============================================================

function handleGetLicenses(token) {
  requireAuth(token);
  const now = new Date();
  return ok(readSheet('Licenses').map(lic => {
    const days = Math.ceil((new Date(lic.ExpirationDate) - now) / 86400000);
    return { ...lic, DaysUntilExpiry: days, ExpiryWarning: days <= 60 };
  }));
}

function handleAddLicense(token, body) {
  requireRole(token, ['owner', 'admin']);
  const lic = {
    LicenseID: generateID('LIC'), HolderName: body.HolderName || '',
    EmployeeID: body.EmployeeID || '', LicenseType: body.LicenseType || '',
    LicenseNumber: body.LicenseNumber || '', IssueDate: body.IssueDate || '',
    ExpirationDate: body.ExpirationDate || '', State: body.State || 'IN',
    Notes: body.Notes || '', Active: true
  };
  appendRow('Licenses', lic);
  return ok({ message: 'License added', LicenseID: lic.LicenseID });
}

function handleUpdateLicense(token, body) {
  requireRole(token, ['owner', 'admin']);
  return updateRecord('Licenses', 'LicenseID', body.LicenseID, body)
    ? ok({ message: 'License updated' }) : err('License not found', 404);
}

function handleDeleteLicense(token, body) {
  requireRole(token, ['owner', 'admin']);
  return updateRecord('Licenses', 'LicenseID', body.LicenseID, { Active: false })
    ? ok({ message: 'License deactivated' }) : err('License not found', 404);
}

// ============================================================
// PHOTOS
// ============================================================

function handleAddPhoto(token, body) {
  const user = requireAuth(token);
  const photo = {
    PhotoID:      generateID('PHT'),
    JobID:        body.JobID        || '',
    ExpenseID:    body.ExpenseID    || '',
    FileName:     body.FileName     || '',
    DriveFileID:  body.DriveFileID  || '',
    DriveUrl:     body.DriveUrl     || '',
    ThumbnailUrl: body.ThumbnailUrl || '',
    UploadedBy:   user.UserID,
    UploadDate:   today(),
    Notes:        body.Notes        || ''
  };
  appendRow('Photos', photo);
  return ok({ message: 'Photo logged', PhotoID: photo.PhotoID });
}

// Photos are sent here from the phone (already shrunk) and saved in the
// business owner's Google Drive: JB Brush Control / Jobs / "JOB-ID — Customer".
// No Google sign-in needed on the phone, and every photo ends up in one place.
const DRIVE_ROOT = 'JB Brush Control';

function getOrCreateFolder(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

function getJobDriveFolder(jobID) {
  const job  = lookupJob(jobID);
  const cust = job ? lookupCustomer(job.CustomerID) : null;
  const root = getOrCreateFolder(DriveApp.getRootFolder(), DRIVE_ROOT);
  const jobs = getOrCreateFolder(root, 'Jobs');
  return getOrCreateFolder(jobs, cust && cust.Name ? jobID + ' — ' + cust.Name : jobID);
}

function handleUploadPhoto(token, body) {
  const user = requireAuth(token);
  if (!body.Data) return err('No photo data');
  const isReceipt = body.Folder === 'Receipts';
  if (!isReceipt && !body.JobID) return err('JobID is required');

  const folder = isReceipt
    ? getOrCreateFolder(getOrCreateFolder(DriveApp.getRootFolder(), DRIVE_ROOT), 'Receipts')
    : getJobDriveFolder(body.JobID);

  const name = body.FileName || ('photo_' + Date.now() + '.jpg');
  const blob = Utilities.newBlob(Utilities.base64Decode(body.Data), body.MimeType || 'image/jpeg', name);
  const file = folder.createFile(blob);
  // Viewable by link so thumbnails show in the app (may be blocked by some Google Workspace policies)
  try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) {}

  const result = { DriveFileID: file.getId(), DriveUrl: file.getUrl(), FolderUrl: folder.getUrl(), FileName: name };

  if (!isReceipt) {
    const photo = {
      PhotoID: generateID('PHT'), JobID: body.JobID, ExpenseID: '',
      FileName: name, DriveFileID: result.DriveFileID, DriveUrl: result.DriveUrl,
      ThumbnailUrl: '', UploadedBy: user.UserID, UploadDate: today(), Notes: body.Notes || ''
    };
    appendRow('Photos', photo);
    result.PhotoID = photo.PhotoID;
    // Put a link to the folder in the job notes (once)
    const job = lookupJob(body.JobID);
    if (job && String(job.Notes || '').indexOf('Photos: ') === -1) {
      updateRecord('Jobs', 'JobID', body.JobID, { Notes: (job.Notes ? job.Notes + '\n' : '') + 'Photos: ' + result.FolderUrl });
    }
  }
  return ok(result);
}

// Run this once from the Apps Script editor to approve Google Drive access.
// (Creates and deletes a test folder, so it proves the backend can save photos.)
// After changing permissions, always Deploy → Manage deployments → New version.
function authorizeDrive() {
  const test = DriveApp.getRootFolder().createFolder('JB test - delete me');
  test.setTrashed(true);
  Logger.log('Drive access OK: can create folders');
}

function handleGetPhotos(token, params) {
  requireAuth(token);
  let photos = readSheet('Photos');
  const jobID     = params.jobID     || params.JobID;
  const expenseID = params.expenseID || params.ExpenseID;
  if (jobID)     photos = photos.filter(p => String(p.JobID)     === String(jobID));
  if (expenseID) photos = photos.filter(p => String(p.ExpenseID) === String(expenseID));
  return ok(photos);
}

function handleDeletePhoto(token, body) {
  requireRole(token, ['owner', 'admin']);
  return deleteRecord('Photos', 'PhotoID', body.PhotoID)
    ? ok({ message: 'Photo deleted' }) : err('Photo not found', 404);
}

// ============================================================
// DASHBOARD
// ============================================================

function handleGetDashboard(token) {
  requireAuth(token);
  const now        = new Date();
  const monthStart = Utilities.formatDate(new Date(now.getFullYear(), now.getMonth(), 1), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const jobs     = readSheet('Jobs');
  const invoices = readSheet('Invoices');
  const hours    = readSheet('Hours');
  const expenses = readSheet('Expenses');
  const mileage  = readSheet('Mileage');
  const licenses = readSheet('Licenses');
  const jobsMonth   = jobs.filter(j => j.JobDate >= monthStart);
  const outstanding = invoices.filter(i => i.Status === 'Awaiting Payment');
  const paidMonth   = invoices.filter(i => i.Status === 'Paid' && i.PaidDate >= monthStart);
  const clockedIn   = hours.filter(h => h.ClockIn && !h.ClockOut);
  const expiring    = licenses.filter(l => {
    if (!(l.Active === true || String(l.Active).toUpperCase() === 'TRUE')) return false;
    const days = Math.ceil((new Date(l.ExpirationDate) - now) / 86400000);
    return days >= 0 && days <= 60;
  });
  return ok({
    jobsThisMonth:       jobsMonth.length,
    sprayJobs:           jobsMonth.filter(j => j.Division === 'Spray').length,
    treeJobs:            jobsMonth.filter(j => j.Division === 'Tree').length,
    revenueThisMonth:    Math.round(paidMonth.reduce((s,i) => s+(parseFloat(i.Total)||0),0)*100)/100,
    outstandingInvoices: outstanding.length,
    outstandingTotal:    Math.round(outstanding.reduce((s,i) => s+(parseFloat(i.Total)||0),0)*100)/100,
    clockedIn:           clockedIn.map(h => { const e=lookupUser(h.EmployeeID); return e?e.Name:h.EmployeeID; }),
    expensesThisMonth:   Math.round(expenses.filter(e=>e.Date>=monthStart).reduce((s,e)=>s+(parseFloat(e.Amount)||0),0)*100)/100,
    milesThisMonth:      Math.round(mileage.filter(m=>m.Date>=monthStart).reduce((s,m)=>s+(parseFloat(m.TotalMiles)||0),0)*10)/10,
    expiringLicenses:    expiring.map(l => ({
      name: l.HolderName, type: l.LicenseType, expires: l.ExpirationDate,
      days: Math.ceil((new Date(l.ExpirationDate)-now)/86400000)
    }))
  });
}

// ============================================================
// TAX SUMMARY
// ============================================================

function handleGetTaxSummary(token, params) {
  requireRole(token, ['owner', 'admin']);
  return ok(readSheet('Tax_Summary'));
}

function handleRefreshTaxSummary(token, params) {
  requireRole(token, ['owner', 'admin']);
  const year        = params.year || String(new Date().getFullYear());
  const invoices    = readSheet('Invoices');
  const expenses    = readSheet('Expenses');
  const mileage     = readSheet('Mileage');
  const hours       = readSheet('Hours');
  const sheet       = getSheet('Tax_Summary');
  const headers     = sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0];
  if (sheet.getLastRow() > 1) sheet.getRange(2,1,sheet.getLastRow()-1,sheet.getLastColumn()).clearContent();
  const divisions = ['Spray','Tree','All'];
  let count = 0;
  for (let q = 1; q <= 4; q++) {
    const qStart = year+'-'+String((q-1)*3+1).padStart(2,'0')+'-01';
    const qEnd   = year+'-'+['03-31','06-30','09-30','12-31'][q-1];
    divisions.forEach(div => {
      const fd   = r => div==='All'||r.Division===div;
      const qInv = invoices.filter(i=>i.Status==='Paid'&&i.PaidDate>=qStart&&i.PaidDate<=qEnd&&fd(i));
      const qExp = expenses.filter(e=>e.Date>=qStart&&e.Date<=qEnd&&fd(e));
      const qMil = mileage.filter(m=>m.Date>=qStart&&m.Date<=qEnd&&fd(m));
      const qHrs = hours.filter(h=>h.Date>=qStart&&h.Date<=qEnd);
      const rev  = qInv.reduce((s,i)=>s+(parseFloat(i.Total)||0),0);
      const exp  = qExp.reduce((s,e)=>s+(parseFloat(e.Amount)||0),0);
      const fuel = qExp.filter(e=>e.Category==='Fuel').reduce((s,e)=>s+(parseFloat(e.Amount)||0),0);
      const chem = qExp.filter(e=>e.Category==='Chemical').reduce((s,e)=>s+(parseFloat(e.Amount)||0),0);
      const milDed = qMil.reduce((s,m)=>s+(parseFloat(m.TotalMiles)||0)*irsMileageRate(m.Date),0);
      const hrs  = qHrs.reduce((s,h)=>s+(parseFloat(h.TotalHours)||0),0);
      const row  = {
        Period:'Q'+q+' '+year, Division:div,
        TotalRevenue:Math.round(rev*100)/100, TotalExpenses:Math.round(exp*100)/100,
        FuelCosts:Math.round(fuel*100)/100, ChemicalCosts:Math.round(chem*100)/100,
        LaborCosts:Math.round(hrs*100)/100, MileageDeduction:Math.round(milDed*100)/100,
        NetIncome:Math.round((rev-exp)*100)/100, Notes:''
      };
      sheet.appendRow(headers.map(h=>row[h]??''));
      count++;
    });
  }
  invalidate('Tax_Summary');
  return ok({ message:'Tax summary refreshed', periods:count });
}

// ============================================================
// CSV EXPORT
// ============================================================

function handleExportCSV(token, params) {
  requireRole(token, ['owner','admin']);
  const allowed = ['Invoices','Expenses','Mileage','Hours','InvoiceLog','Tax_Summary','Estimates','Jobs','Customers','Photos','Vendors','Equipment','Licenses'];
  if (!allowed.includes(params.sheet)) return err('Sheet not exportable');
  const data = getSheet(params.sheet).getDataRange().getValues();
  const csv  = data.map(row=>row.map(cell=>{
    const s=String(cell??'').replace(/"/g,'""');
    return (s.includes(',')||s.includes('"')||s.includes('\n'))?'"'+s+'"':s;
  }).join(',')).join('\n');
  return ok({ csv, sheetName:params.sheet, rows:data.length-1 });
}


// ============================================================
// LICENSE EXPIRY REMINDER
// ============================================================

function sendLicenseExpiryReminders() {
  const licenses   = readSheet('Licenses');
  const now        = new Date();
  const company    = getSetting('CompanyName') || 'JB Brush Control';
  const ownerEmail = getSetting('Email');
  if (!ownerEmail) return;
  const expiring = licenses.filter(lic => {
    const days = Math.ceil((new Date(lic.ExpirationDate)-now)/86400000);
    return (lic.Active===true||String(lic.Active).toUpperCase()==='TRUE') && [60,30,14,7].includes(days);
  });
  if (!expiring.length) return;
  const rows = expiring.map(lic=>{
    const days=Math.ceil((new Date(lic.ExpirationDate)-now)/86400000);
    return '<tr><td>'+lic.HolderName+'</td><td>'+lic.LicenseType+'</td><td>'+lic.LicenseNumber+'</td><td>'+lic.ExpirationDate+'</td><td style="color:'+(days<=14?'red':'orange')+'">'+days+' days</td></tr>';
  }).join('');
  GmailApp.sendEmail(ownerEmail,
    '⚠️ License Expiry Alert — '+expiring.length+' license(s) expiring soon',
    expiring.map(l=>l.HolderName+' - '+l.LicenseType+' expires '+l.ExpirationDate).join('\n'),
    { htmlBody:'<html><body style="font-family:Arial,sans-serif"><h2 style="color:#1a4a1a">⚠️ '+company+'</h2><table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse"><tr style="background:#f5f5f5"><th>Name</th><th>Type</th><th>Number</th><th>Expires</th><th>Days Left</th></tr>'+rows+'</table></body></html>', name:company }
  );
}