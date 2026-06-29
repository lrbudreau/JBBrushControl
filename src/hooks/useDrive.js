import { CONFIG } from '../config';

let accessToken  = null;
let tokenExpiry  = null;
let tokenClient  = null;
let initPromise  = null;

// ── Load GSI script once ──────────────────────────────────────
function loadGSI() {
  if (initPromise) return initPromise;
  initPromise = new Promise(resolve => {
    if (window.google?.accounts?.oauth2) { resolve(); return; }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.onload = resolve;
    document.head.appendChild(script);
  });
  return initPromise;
}

// ── Get access token — silent first, prompt only if needed ────
export async function requestDriveAccess(forcePrompt = false) {
  // Return cached token if still valid
  if (!forcePrompt && accessToken && tokenExpiry && Date.now() < tokenExpiry) {
    return accessToken;
  }

  await loadGSI();

  return new Promise((resolve, reject) => {
    if (!tokenClient) {
      tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: CONFIG.GOOGLE_CLIENT_ID,
        scope: 'https://www.googleapis.com/auth/drive.file',
        callback: (response) => {
          if (response.error) {
            console.error('Drive auth error:', response.error);
            reject(new Error(response.error));
            return;
          }
          accessToken = response.access_token;
          tokenExpiry = Date.now() + ((response.expires_in || 3600) * 1000) - 60000;
          console.log('✅ Drive access token obtained');
          resolve(accessToken);
        },
      });
    } else {
      tokenClient.callback = (response) => {
        if (response.error) { reject(new Error(response.error)); return; }
        accessToken = response.access_token;
        tokenExpiry = Date.now() + ((response.expires_in || 3600) * 1000) - 60000;
        resolve(accessToken);
      };
    }
    // '' = silent if already authorized, 'consent' = force prompt
    tokenClient.requestAccessToken({ prompt: forcePrompt ? 'consent' : '' });
  });
}

// ── Drive API helpers ─────────────────────────────────────────
async function driveGet(url) {
  const token = await requestDriveAccess();
  const res   = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  return res.json();
}

async function drivePost(url, body, isMultipart = false) {
  const token = await requestDriveAccess();
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
  const folderId = await findOrCreateFolder(
    customerName ? `${jobID} — ${customerName}` : jobID,
    jobsId
  );
  return { folderId, folderUrl: `https://drive.google.com/drive/folders/${folderId}` };
}

// ── Upload a photo ────────────────────────────────────────────
export async function uploadPhoto(file, folderId) {
  console.log('📸 Uploading:', file.name, 'to folder:', folderId);
  const token    = await requestDriveAccess();
  const metadata = {
    name:    file.name || `photo_${Date.now()}.jpg`,
    parents: [folderId],
  };

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', file);

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,thumbnailLink',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    }
  );
  const result = await res.json();

  if (result.error) {
    console.error('❌ Upload failed:', result.error);
    throw new Error(result.error.message || 'Upload failed');
  }

  console.log('✅ Uploaded:', result.id);

  // Make publicly viewable so thumbnails work
  if (result.id) {
    await fetch(`https://www.googleapis.com/drive/v3/files/${result.id}/permissions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'reader', type: 'anyone' }),
    });
  }

  return result;
}

export function isDriveAuthorized() {
  return !!(accessToken && tokenExpiry && Date.now() < tokenExpiry);
}
