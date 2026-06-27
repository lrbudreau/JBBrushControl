import { CONFIG } from '../config';

let gapiReady = false;
let tokenClient = null;
let accessToken = null;

// Initialize Google API
export async function initGoogleDrive() {
  return new Promise((resolve) => {
    if (gapiReady) { resolve(true); return; }
    window.gapi.load('client', async () => {
      await window.gapi.client.init({
        apiKey: CONFIG.GOOGLE_API_KEY,
        discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
      });
      gapiReady = true;
      resolve(true);
    });
  });
}

// Request Drive access token
export async function requestDriveAccess() {
  return new Promise((resolve, reject) => {
    if (accessToken) { resolve(accessToken); return; }
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: CONFIG.GOOGLE_CLIENT_ID,
      scope: CONFIG.DRIVE_SCOPE,
      callback: (response) => {
        if (response.error) { reject(response.error); return; }
        accessToken = response.access_token;
        resolve(accessToken);
      },
    });
    tokenClient.requestAccessToken({ prompt: 'consent' });
  });
}

// Find or create a folder in Drive
async function findOrCreateFolder(name, parentId = null) {
  const token = accessToken;
  const query = parentId
    ? `name='${name}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`
    : `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;

  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const searchData = await searchRes.json();

  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0].id;
  }

  // Create folder
  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.folder',
      ...(parentId ? { parents: [parentId] } : {}),
    }),
  });
  const folder = await createRes.json();
  return folder.id;
}

// Get or create the job photos folder path: JB Brush Control / Jobs / {jobID}
export async function getJobFolder(jobID, customerName) {
  await initGoogleDrive();
  if (!accessToken) await requestDriveAccess();

  const rootId    = await findOrCreateFolder(CONFIG.DRIVE_ROOT_FOLDER);
  const jobsId    = await findOrCreateFolder('Jobs', rootId);
  const folderName = `${jobID} — ${customerName || 'Job'}`;
  const folderId  = await findOrCreateFolder(folderName, jobsId);

  return {
    folderId,
    folderUrl: `https://drive.google.com/drive/folders/${folderId}`,
  };
}

// Upload a photo file to a Drive folder
export async function uploadPhoto(file, folderId) {
  if (!accessToken) await requestDriveAccess();

  const metadata = {
    name: file.name || `photo_${Date.now()}.jpg`,
    parents: [folderId],
  };

  const formData = new FormData();
  formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  formData.append('file', file);

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,thumbnailLink',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: formData,
    }
  );
  return await res.json();
}

// List photos in a folder
export async function listPhotos(folderId) {
  if (!accessToken) await requestDriveAccess();

  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents+and+trashed=false&fields=files(id,name,webViewLink,thumbnailLink,mimeType)`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const data = await res.json();
  return data.files || [];
}
