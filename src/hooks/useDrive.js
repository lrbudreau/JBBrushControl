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
// IMPORTANT for iPhone/Safari: the Google sign-in popup is only allowed
// right after a tap. Call this at the very START of a tap handler,
// before any other `await`, or Safari blocks the popup and it never
// finishes (that was the "photos timed out" problem).
let pending = null;

export async function requestDriveAccess(forcePrompt = false) {
  // Return cached token if still valid
  if (!forcePrompt && accessToken && tokenExpiry && Date.now() < tokenExpiry) {
    return accessToken;
  }
  // If a request is already in flight, share it instead of starting another
  if (pending) return pending;

  pending = (async () => {
    await loadGSI();
    return new Promise((resolve, reject) => {
      const onToken = (response) => {
        if (response.error) {
          console.error('Drive auth error:', response.error);
          reject(new Error(response.error_description || response.error));
          return;
        }
        accessToken = response.access_token;
        tokenExpiry = Date.now() + ((response.expires_in || 3600) * 1000) - 60000;
        resolve(accessToken);
      };
      // Fires if the popup is blocked or the user closes it — without this
      // the promise would hang forever.
      const onError = (err) => {
        const type = err?.type || 'unknown';
        reject(new Error(
          type === 'popup_failed_to_open' ? 'Google sign-in popup was blocked. Allow popups and try again.' :
          type === 'popup_closed'         ? 'Google sign-in was closed before finishing.' :
          'Google sign-in failed (' + type + ')'
        ));
      };
      if (!tokenClient) {
        tokenClient = window.google.accounts.oauth2.initTokenClient({
          client_id: CONFIG.GOOGLE_CLIENT_ID,
          scope: CONFIG.DRIVE_SCOPE,
          callback: onToken,
          error_callback: onError,
        });
      } else {
        tokenClient.callback = onToken;
        tokenClient.error_callback = onError;
      }
      // '' = silent if already authorized, 'consent' = force prompt
      tokenClient.requestAccessToken({ prompt: forcePrompt ? 'consent' : '' });
    });
  })();

  try { return await pending; }
  finally { pending = null; }
}

// ── Drive API helpers ─────────────────────────────────────────
async function driveGet(url) {
  const token = await requestDriveAccess();
  const res   = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const json  = await res.json();
  if (json.error) throw new Error(json.error.message || 'Google Drive error');
  return json;
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
  const json = await res.json();
  if (json.error) throw new Error(json.error.message || 'Google Drive error');
  return json;
}

// Drive search queries break on names with an apostrophe (e.g. O'Brien)
function q(str) { return String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }

// ── Find or create folder ─────────────────────────────────────
async function findOrCreateFolder(name, parentId = null) {
  const q = parentId
    ? `name='${q(name)}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`
    : `name='${q(name)}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;

  const search = await driveGet(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)`
  );

  if (search.files && search.files.length > 0) return search.files[0].id;

  const folder = await drivePost('https://www.googleapis.com/drive/v3/files', {
    name,
    mimeType: 'application/vnd.google-apps.folder',
    ...(parentId ? { parents: [parentId] } : {}),
  });
  if (!folder.id) throw new Error('Could not create Drive folder "' + name + '"');
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
