import React from 'react';

export default function Modal({ title, onClose, onSave, saveLabel = 'Save', saving, children, danger }) {
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-sheet">
        <div className="modal-handle" />
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">{children}</div>
        {onSave && (
          <div className="modal-footer">
            <button className="btn btn-outline btn-full" onClick={onClose} style={{ flex: 1 }}>Cancel</button>
            <button
              className={`btn ${danger ? 'btn-danger' : 'btn-primary'} btn-full`}
              onClick={onSave} disabled={saving}
              style={{ flex: 2 }}
            >
              {saving ? 'Saving…' : saveLabel}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
