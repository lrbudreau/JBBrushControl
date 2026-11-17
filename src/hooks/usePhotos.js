import { api } from '../api';

// Shrink a phone photo (often 3–8 MB) to a JPEG about 1600px on the long side
// (~200–500 KB). Uploads are much faster on a weak cell signal, and it also
// converts iPhone HEIC photos to JPEG.
export function shrinkImage(file, maxDim = 1600, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const scale  = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width  = Math.round(img.naturalWidth * scale);
        canvas.height = Math.round(img.naturalHeight * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        URL.revokeObjectURL(url);
        resolve(dataUrl.split(',')[1]); // base64 only
      } catch (e) { URL.revokeObjectURL(url); reject(e); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read photo ' + (file.name || ''))); };
    img.src = url;
  });
}

function photoName(file, i) {
  const base = (file.name || '').replace(/\.[^.]+$/, '');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `${base && base !== 'image' ? base : 'photo'}_${stamp}${i ? '_' + i : ''}.jpg`;
}

// Upload one photo through the backend. It's saved in the business Google
// Drive (JB Brush Control / Jobs / "JOB-ID — Customer") and logged to Photos.
// folder: 'Job' (default) or 'Receipts'
export async function uploadPhoto(file, { jobID = '', folder = 'Job', index = 0 } = {}) {
  const data = await shrinkImage(file);
  // Retry once — a dropped cell signal shouldn't lose the photo
  for (let attempt = 1; attempt <= 2; attempt++) {
    const r = await api('uploadPhoto', {}, {
      JobID: jobID, Folder: folder, FileName: photoName(file, index),
      MimeType: 'image/jpeg', Data: data,
    });
    if (r.status === 'ok') return r.data;
    if (attempt === 2 || r.code === 401 || r.code === 403) throw new Error(r.message || 'Upload failed');
  }
}

// Upload several photos one at a time. onProgress(done, total)
export async function uploadPhotos(files, jobID, onProgress) {
  let done = 0, failed = 0, error = '';
  for (let i = 0; i < files.length; i++) {
    try { await uploadPhoto(files[i], { jobID, index: i }); done++; }
    catch (e) { console.error('Photo upload failed:', e); failed++; error = error || friendlyError(e.message); }
    onProgress && onProgress(done + failed, files.length);
  }
  return { done, failed, error };
}

// Turn backend errors into something that says what to do
function friendlyError(msg = '') {
  if (/Unknown action/i.test(msg)) return 'The backend is out of date — deploy a New version in Apps Script.';
  if (/DriveApp|permission|authoriz/i.test(msg)) return 'Google Drive access not approved — run authorizeDrive in Apps Script.';
  if (/Unauthorized/i.test(msg)) return 'Your login expired — sign out and back in.';
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return 'No connection — check signal and try again.';
  return msg;
}

// Image addresses for a Drive file shared "anyone with the link".
export function thumbUrl(id, size = 400) { return `https://drive.google.com/thumbnail?id=${id}&sz=w${size}`; }
export function altThumbUrl(id, size = 400) { return `https://lh3.googleusercontent.com/d/${id}=w${size}`; }
