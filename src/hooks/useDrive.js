import { CONFIG } from '../config';

let accessToken = null;
let tokenExpiry  = null;
let tokenClient  = null;

function loadGsiScript() {
  return new Promise(resolve => {
    if (window.google?.accounts?.oauth2) { resolve(); return; }
    const existing = document.querySelector('script[src*="accounts.google.com/gsi/client"]');
    if (existing) { existing.onload = resolve; return; }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.onload = resolve;
    document.head.appendChild(script);
  });
}

export async function requestDriveAccess(forcePrompt = false) {
  // Return cached token if still valid
  if (!forcePrompt && accessToken && tokenExpiry && Date.now() < tokenExpiry) {
    return accessToken;
  }

  await loadGsiScript();

  return new Promise((resolve, reject) => {
    if (!tokenClient) {
      tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: CONFIG.GOOGLE_CLIENT_ID,
        scope: CONFIG.DRIVE_SCOPE,
        // No prompt after first auth — reuses existing consent
        callback: (response) => {
          if (response.error) { reject(new Error(response.error)); return; }
          accessToken = response.access_token;
          tokenExpiry = Date.now() + ((response.expires_in || 3600) * 1000) - 60000;
          resolve(accessToken);
        },
      });
    } else {
      // Update callback for this request
      tokenClient.callback = (response) => {
        if (response.error) { reject(new Error(response.error)); return; }
        accessToken = response.access_token;
        tokenExpiry = Date.now() + ((response.expires_in || 3600) * 1000) - 60000;
        resolve(accessToken);
      };
    }
    // Empty prompt string = silent refresh if already authorized, only asks once per session
    tokenClient.requestAccessToken({ prompt: forcePrompt ? 'select_account' : '' });
  });
}

async function driveGet(url) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
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

export async function getJobFolder(jobID, customerName) {
  const rootId   = await findOrCreateFolder(CONFIG.DRIVE_ROOT_FOLDER);
  const jobsId   = await findOrCreateFolder('Jobs', rootId);
  const folderId = await findOrCreateFolder(`${jobID} — ${customerName || 'Job'}`, jobsId);
  return { folderId, folderUrl: `https://drive.google.com/drive/folders/${folderId}` };
}

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
    form, true
  );

  // Make publicly viewable
  if (result.id) {
    await fetch(`https://www.googleapis.com/drive/v3/files/${result.id}/permissions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'reader', type: 'anyone' }),
    });
    // Get a fresh thumbnail after making public
    const meta = await driveGet(
      `https://www.googleapis.com/drive/v3/files/${result.id}?fields=id,name,webViewLink,thumbnailLink`
    );
    return meta;
  }
  return result;
}

export async function listPhotosInFolder(folderId) {
  if (!accessToken) await requestDriveAccess();
  const data = await driveGet(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`'${folderId}' in parents and trashed=false`)}&fields=files(id,name,webViewLink,thumbnailLink,mimeType,createdTime)&orderBy=createdTime`
  );
  return data.files || [];
}

export function isDriveAuthorized() {
  return !!(accessToken && tokenExpiry && Date.now() < tokenExpiry);
}
