import React, { useEffect, useState, useRef } from 'react';
import { api, formatDate } from '../api';
import { getJobFolder, uploadPhoto, requestDriveAccess } from '../hooks/useDrive';
import { toast } from './Toast';

export default function PhotoViewer({ jobID, folderUrl, onClose }) {
  const [photos, setPhotos]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [selected, setSelected] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef();

  const load = () => {
    api('getPhotos', { jobID }).then(r => {
      if (r.status === 'ok') setPhotos(r.data);
      setLoading(false);
    });
  };

  useEffect(() => { load(); }, [jobID]);

  const handleFileSelect = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setUploading(true);
    try {
      await requestDriveAccess();
      const { folderId, folderUrl: fUrl } = await getJobFolder(jobID, '');
      for (const file of files) {
        const result = await uploadPhoto(file, folderId);
        if (result.id) {
          await api('addPhoto', {}, {
            JobID:        jobID,
            ExpenseID:    '',
            FileName:     result.name || file.name,
            DriveFileID:  result.id,
            DriveUrl:     result.webViewLink || `https://drive.google.com/file/d/${result.id}/view`,
            ThumbnailUrl: result.thumbnailLink || '',
          });
        }
      }
      toast(`${files.length} photo(s) uploaded ✅`);
      load(); // Reload photos
    } catch (e) {
      console.error('Upload error:', e);
      toast('Upload failed: ' + e.message, 'error');
    }
    setUploading(false);
    e.target.value = ''; // Reset input
  };

  return (
    <div style={S.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={S.sheet}>
        <div style={S.handle} />
        <div style={S.header}>
          <h3 style={{ fontSize:17, fontWeight:700 }}>📸 Job Photos</h3>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            {/* Hidden file input */}
            <input ref={fileRef} type="file" accept="image/*" multiple
              style={{ display:'none' }} onChange={handleFileSelect} />
            <button
              style={S.uploadBtn}
              onClick={() => fileRef.current.click()}
              disabled={uploading}>
              {uploading ? '⏳ Uploading…' : '+ Add Photos'}
            </button>
            <button style={S.closeBtn} onClick={onClose}>✕</button>
          </div>
        </div>

        <div style={S.body}>
          {loading ? (
            <p style={{ color:'#6b7280', textAlign:'center', padding:24 }}>Loading…</p>
          ) : photos.length === 0 ? (
            <div style={{ textAlign:'center', padding:'32px 16px', color:'#9ca3af' }}>
              <div style={{ fontSize:40, marginBottom:10 }}>📷</div>
              <p>No photos yet.</p>
              <button style={{ ...S.uploadBtn, marginTop:14, padding:'10px 20px' }}
                onClick={() => fileRef.current.click()} disabled={uploading}>
                {uploading ? '⏳ Uploading…' : '+ Add First Photo'}
              </button>
            </div>
          ) : (
            <>
              <div style={S.grid}>
                {photos.map(photo => (
                  <div key={photo.PhotoID} style={S.thumb} onClick={() => setSelected(photo)}>
                    {photo.DriveFileID ? (
                      <img
                        src={`https://lh3.googleusercontent.com/d/${photo.DriveFileID}`}
                        alt={photo.FileName}
                        style={{ width:'100%', height:'100%', objectFit:'cover', borderRadius:8 }}
                        onError={e => {
                          e.target.style.display = 'none';
                          e.target.nextSibling.style.display = 'flex';
                        }}
                      />
                    ) : null}
                    <div style={{ ...S.thumbPlaceholder, display: photo.DriveFileID ? 'none' : 'flex' }}>
                      <span style={{ fontSize:28 }}>🖼</span>
                      <span style={{ fontSize:10, color:'#6b7280', marginTop:4 }}>
                        {photo.FileName?.slice(0,12) || 'Photo'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              {folderUrl && (
                <a href={folderUrl} target="_blank" rel="noopener noreferrer" style={S.driveLink}>
                  📁 Open all photos in Google Drive →
                </a>
              )}
            </>
          )}
        </div>
      </div>

      {/* Full screen view */}
      {selected && (
        <div style={S.fullOverlay} onClick={() => setSelected(null)}>
          <div style={S.fullCard} onClick={e => e.stopPropagation()}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
              <span style={{ fontWeight:600, fontSize:14 }}>{selected.FileName}</span>
              <button style={S.closeBtn} onClick={() => setSelected(null)}>✕</button>
            </div>
            {selected.DriveFileID ? (
              <img
                src={`https://lh3.googleusercontent.com/d/${selected.DriveFileID}`}
                alt={selected.FileName}
                style={{ width:'100%', borderRadius:8, maxHeight:'60vh', objectFit:'contain' }}
                onError={e => { e.target.style.display='none'; }}
              />
            ) : (
              <div style={{ ...S.thumbPlaceholder, height:200 }}>
                <span style={{ fontSize:48 }}>🖼</span>
              </div>
            )}
            <div style={{ marginTop:12, fontSize:12, color:'#6b7280' }}>
              Uploaded {formatDate(selected.UploadDate)}
            </div>
            <a href={selected.DriveUrl} target="_blank" rel="noopener noreferrer"
              style={{ display:'block', marginTop:10, textAlign:'center', color:'#1d6fa4', fontWeight:600, fontSize:14 }}>
              Open in Google Drive ↗
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

const S = {
  overlay:          { position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:400, display:'flex', alignItems:'flex-end' },
  sheet:            { background:'white', borderRadius:'20px 20px 0 0', width:'100%', maxWidth:480, margin:'0 auto', maxHeight:'85vh', display:'flex', flexDirection:'column', animation:'slideUp 0.25s ease' },
  handle:           { width:40, height:4, background:'#d1d5db', borderRadius:99, margin:'10px auto 0' },
  header:           { padding:'12px 18px', display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:'1px solid #f3f4f6' },
  uploadBtn:        { background:'#1a4a1a', color:'white', border:'none', padding:'7px 14px', borderRadius:8, fontSize:13, fontWeight:600, cursor:'pointer' },
  closeBtn:         { background:'none', border:'none', fontSize:18, cursor:'pointer', color:'#6b7280', padding:'4px 8px' },
  body:             { padding:16, overflowY:'auto', flex:1 },
  grid:             { display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:8, marginBottom:16 },
  thumb:            { aspectRatio:'1', borderRadius:8, overflow:'hidden', background:'#f3f4f6', cursor:'pointer' },
  thumbPlaceholder: { width:'100%', height:'100%', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', background:'#f3f4f6' },
  driveLink:        { display:'block', textAlign:'center', color:'#1d6fa4', fontWeight:600, fontSize:14, padding:12, background:'#dbeafe', borderRadius:8, textDecoration:'none' },
  fullOverlay:      { position:'fixed', inset:0, background:'rgba(0,0,0,0.8)', zIndex:500, display:'flex', alignItems:'center', justifyContent:'center', padding:20 },
  fullCard:         { background:'white', borderRadius:12, padding:16, width:'100%', maxWidth:400 },
};
