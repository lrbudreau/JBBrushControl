// Service account Drive integration — no user login required
// The service account key is injected at build time via REACT_APP_GOOGLE_SA_KEY

import { CONFIG } from '../config';

let _token = null;
let _tokenExpiry = null;

// ── Parse service account key ────────────────────────────────
function getServiceAccountKey() {
  try {
    const raw = process.env.REACT_APP_GOOGLE_SA_KEY;
    if (!raw) throw new Error('Service account key not found');
    return JSON.parse(raw);
  } catch (e) {
    console.error('Service account key error:', e);
    return null;
  }
}

// ── Generate JWT for service account auth ────────────────────
async function generateJWT(key) {
  const now    = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim  = {
    iss:   key.client_email,
    scope: 'https://www.googleapis.com/auth/drive.file',
    aud:   'https://oauth2.googleapis.com/token',
    exp:   now + 3600,
    iat:   now,
  };

  const b64 = obj => btoa(JSON.stringify(obj))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

  const unsigned = `${b64(header)}.${b64(claim)}`;

  // Import the private key
  const pemBody = key.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\n/g, '');

  const binaryDer = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0));

  const cryptoKey = await window.crypto.subtle.importKey(
    'pkcs8', binaryDer.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign']
  );

  const signature = await window.crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5', cryptoKey,
    new TextEncoder().encode(unsigned)
  );

  const b64sig = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

  return `${unsigned}.${b64sig}`;
}

// ── Get access token ─────────────────────────────────────────
async function getAccessToken() {
  if (_token && _tokenExpiry && Date.now() < _tokenExpiry) return _token;

  const key = getServiceAccountKey();
  if (!key) throw new Error('No service account key configured');

  const jwt = await generateJWT(key);

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion:  jwt,
    }),
  });

  const data = await res.json();
  if (!data.access_token) throw new Error('Failed to get access token: ' + JSON.stringify(data));

  _token       = data.access_token;
  _tokenExpiry = Date.now() + (data.expires_in * 1000) - 60000;
  return _token;
}

// ── Drive API helpers ─────────────────────────────────────────
async function driveGet(url) {
  const token = await getAccessToken();
  const res   = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  return res.json();
}

async function drivePost(url, body, isMultipart = false) {
  const token = await getAccessToken();
  const res   = await fetch(url, {
    method: 'POST',
    headers: isMultipart
      ? { Authorization: `Bearer ${token}` }
      : { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: isMultipart ? body : JSON.stringify(body),
  });
  return res.json();
}

// ── Find or create folder ─────────────────────────────────────
async function findOrCreateFolder(name, parentId = null) {
  const q = parentId
    ? `name='${name}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`
    : `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;

  const search = await driveGet(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)`
  );

  if (search.files && search.files.length > 0) return search.files[0].id;

  const folder = await drivePost('https://www.googleapis.com/drive/v3/files', {
    name,
    mimeType: 'application/vnd.google-apps.folder',
    ...(parentId ? { parents: [parentId] } : {}),
  });
  return folder.id;
}

// ── Get or create job photos folder ──────────────────────────
export async function getJobFolder(jobID, customerName) {
  const rootId   = await findOrCreateFolder(CONFIG.DRIVE_ROOT_FOLDER);
  const jobsId   = await findOrCreateFolder('Jobs', rootId);
  const folderId = await findOrCreateFolder(`${jobID} — ${customerName || 'Job'}`, jobsId);
  return { folderId, folderUrl: `https://drive.google.com/drive/folders/${folderId}` };
}

// ── Upload photo ──────────────────────────────────────────────
export async function uploadPhoto(file, folderId) {
  const token    = await getAccessToken();
  const metadata = {
    name:    file.name || `photo_${Date.now()}.jpg`,
    parents: [folderId],
  };

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', file);

  const result = await drivePost(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,thumbnailLink',
    form, true
  );

  // Make publicly viewable so thumbnails work without auth
  if (result.id) {
    await fetch(`https://www.googleapis.com/drive/v3/files/${result.id}/permissions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ role: 'reader', type: 'anyone' }),
    });
    // Fetch fresh metadata with thumbnail
    const meta = await driveGet(
      `https://www.googleapis.com/drive/v3/files/${result.id}?fields=id,name,webViewLink,thumbnailLink`
    );
    return meta;
  }
  return result;
}

// ── List photos in folder ─────────────────────────────────────
export async function listPhotosInFolder(folderId) {
  const data = await driveGet(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`'${folderId}' in parents and trashed=false`)}&fields=files(id,name,webViewLink,thumbnailLink,mimeType,createdTime)&orderBy=createdTime`
  );
  return data.files || [];
}

// ── No longer needed — kept for compatibility ─────────────────
export function isDriveAuthorized() { return true; }
export async function requestDriveAccess() { return getAccessToken(); }
