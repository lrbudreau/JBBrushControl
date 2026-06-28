import { CONFIG } from '../config';

let accessToken = null;
let tokenExpiry  = null;

// ── Initialize Google Identity Services ──────────────────────
function loadGsiScript() {
  return new Promise(resolve => {
    if (window.google?.accounts?.oauth2) { resolve(); return; }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.onload = resolve;
    document.head.appendChild(script);
  });
}

// ── Request Drive access token ────────────────────────────────
export async function requestDriveAccess() {
  // Return cached token if still valid
  if (accessToken && tokenExpiry && Date.now() < tokenExpiry) return accessToken;

  await loadGsiScript();

  return new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: CONFIG.GOOGLE_CLIENT_ID,
      scope: CONFIG.DRIVE_SCOPE,
      callback: (response) => {
        if (response.error) { reject(new Error(response.error)); return; }
        accessToken = response.access_token;
        tokenExpiry = Date.now() + (response.expires_in * 1000) - 60000;
        resolve(accessToken);
      },
    });
    client.requestAccessToken({ prompt: '' }); // '' = no prompt if already authorized
  });
}

// ── Drive API helpers ─────────────────────────────────────────
async function driveGet(url) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  return res.json();
}

async function drivePost(url, body, isMultipart = false) {
  const res = await fetch(url, {
    method: 'POST',
    headers: isMultipart
      ? { Authorization: `Bearer ${accessToken}` }
      : { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: isMultipart ? body : JSON.stringify(body),
  });
  return res.json();
}

// ── Find or create a Drive folder ────────────────────────────
async function findOrCreateFolder(name, parentId = null) {
  const q = parentId
    ? `name='${name}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`
    : `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;

  const search = await driveGet(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)&key=${CONFIG.GOOGLE_API_KEY}`
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
  const folderName = `${jobID} — ${customerName || 'Job'}`;
  const folderId = await findOrCreateFolder(folderName, jobsId);
  return {
    folderId,
    folderUrl: `https://drive.google.com/drive/folders/${folderId}`,
  };
}

// ── Upload a photo file ───────────────────────────────────────
export async function uploadPhoto(file, folderId) {
  const metadata = {
    name: file.name || `photo_${Date.now()}.jpg`,
    parents: [folderId],
  };

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', file);

  const result = await drivePost(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,thumbnailLink',
    form,
    true
  );

  // Make the file publicly viewable so thumbnails work
  if (result.id) {
    await fetch(`https://www.googleapis.com/drive/v3/files/${result.id}/permissions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ role: 'reader', type: 'anyone' }),
    });
  }

  return result;
}

// ── List photos in a folder ───────────────────────────────────
export async function listPhotosInFolder(folderId) {
  if (!accessToken) await requestDriveAccess();
  const data = await driveGet(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`'${folderId}' in parents and trashed=false`)}&fields=files(id,name,webViewLink,thumbnailLink,mimeType,createdTime)&orderBy=createdTime`
  );
  return data.files || [];
}

// ── Check if Drive is already authorized ─────────────────────
export function isDriveAuthorized() {
  return !!(accessToken && tokenExpiry && Date.now() < tokenExpiry);
}
