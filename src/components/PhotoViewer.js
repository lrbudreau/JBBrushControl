import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { requestDriveAccess, listPhotosInFolder, isDriveAuthorized } from '../hooks/useDrive';

export default function PhotoViewer({ jobID, folderUrl, onClose }) {
  const [photos, setPhotos]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [selected, setSelected] = useState(null);
  const [driveAuth, setDriveAuth] = useState(true);

  useEffect(() => {
    // Load photos from the Photos sheet
    api('getPhotos', { jobID }).then(r => {
      if (r.status === 'ok') setPhotos(r.data);
      setLoading(false);
    });
  }, [jobID]);



  return (
    <div style={S.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={S.sheet}>
        <div style={S.handle} />
        <div style={S.header}>
          <h3 style={{ fontSize: 17, fontWeight: 700 }}>📸 Job Photos</h3>
          <button style={S.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div style={S.body}>
          {loading ? (
            <p style={{ color: '#6b7280', textAlign: 'center', padding: 24 }}>Loading…</p>
          ) : photos.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 16px', color: '#9ca3af' }}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>📷</div>
              <p>No photos for this job yet.</p>
              <p style={{ fontSize: 12, marginTop: 6 }}>Photos are added during the New Job flow.</p>
            </div>
          ) : (
            <>
    

              <div style={S.grid}>
                {photos.map((photo, i) => (
                  <div key={photo.PhotoID} style={S.thumb} onClick={() => setSelected(photo)}>
                    {photo.DriveFileID ? (
                      <img
                        src={`https://drive.google.com/thumbnail?id=${photo.DriveFileID}&sz=w400`}
                        alt={photo.FileName}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8 }}
                        onError={e => {
                          e.target.style.display = 'none';
                          e.target.nextSibling.style.display = 'flex';
                        }}
                      />
                    ) : null}
                    <div style={{ ...S.thumbPlaceholder, display: photo.DriveFileID ? 'none' : 'flex' }}>
                      <span style={{ fontSize: 28 }}>🖼</span>
                      <span style={{ fontSize: 10, color: '#6b7280', marginTop: 4 }}>
                        {photo.FileName?.slice(0, 12) || 'Photo'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {folderUrl && (

              )}
            </>
          )}
        </div>
      </div>

      {/* Full screen photo view */}
      {selected && (
        <div style={S.fullOverlay} onClick={() => setSelected(null)}>
          <div style={S.fullCard} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>{selected.FileName}</span>
              <button style={S.closeBtn} onClick={() => setSelected(null)}>✕</button>
            </div>
            {selected.DriveFileID ? (
              <img
                src={`https://drive.google.com/thumbnail?id=${selected.DriveFileID}&sz=w800`}
                alt={selected.FileName}
                style={{ width: '100%', borderRadius: 8, maxHeight: '60vh', objectFit: 'contain' }}
                onError={e => { e.target.style.display='none'; }}
              />
            ) : (
              <div style={{ ...S.thumbPlaceholder, height: 200 }}>
                <span style={{ fontSize: 48 }}>🖼</span>
              </div>
            )}
            <div style={{ marginTop: 12, fontSize: 12, color: '#6b7280' }}>
              Uploaded {selected.UploadDate}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const S = {
  overlay:       { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 400, display: 'flex', alignItems: 'flex-end' },
  sheet:         { background: 'white', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 480, margin: '0 auto', maxHeight: '85vh', display: 'flex', flexDirection: 'column', animation: 'slideUp 0.25s ease' },
  handle:        { width: 40, height: 4, background: '#d1d5db', borderRadius: 99, margin: '10px auto 0' },
  header:        { padding: '12px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #f3f4f6' },
  closeBtn:      { background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#6b7280', padding: '4px 8px' },
  body:          { padding: 16, overflowY: 'auto', flex: 1 },
  authBanner:    { background: '#dbeafe', borderRadius: 8, padding: '12px 14px', marginBottom: 16, textAlign: 'center' },
  authBtn:       { background: '#1d6fa4', color: 'white', border: 'none', padding: '8px 16px', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: 13 },
  grid:          { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 },
  thumb:         { aspectRatio: '1', borderRadius: 8, overflow: 'hidden', background: '#f3f4f6', cursor: 'pointer', border: '2px solid transparent', transition: 'border-color 0.15s' },
  thumbPlaceholder: { width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#f3f4f6' },
  driveLink:     { display: 'block', textAlign: 'center', color: '#1d6fa4', fontWeight: 600, fontSize: 14, padding: '12px', background: '#dbeafe', borderRadius: 8, textDecoration: 'none' },
  fullOverlay:   { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 },
  fullCard:      { background: 'white', borderRadius: 12, padding: 16, width: '100%', maxWidth: 400 },
};
