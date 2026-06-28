import React, { useEffect, useState } from 'react';
import { api, getUser, isOwnerOrAdmin } from '../api';
import { toast } from './Toast';

export default function LogHours({ onClose }) {
  const user     = getUser();
  const isAdmin  = isOwnerOrAdmin();
  const [jobs, setJobs]       = useState([]);
  const [users, setUsers]     = useState([]);
  const [saving, setSaving]   = useState(false);
  const [date, setDate]       = useState(today());

  // Hours entries: each is { jobID, employeeID, hours, notes }
  const [entries, setEntries] = useState([
    { jobID: '', employeeID: user?.UserID || '', hours: '', notes: '' }
  ]);

  useEffect(() => {
    api('getJobs').then(r => { if (r.status === 'ok') setJobs(r.data); });
    if (isAdmin) {
      api('getUsers').then(r => { if (r.status === 'ok') setUsers(r.data.filter(u => u.Active === true || String(u.Active).toUpperCase() === 'TRUE')); });
    }
  }, []);

  const updateEntry = (i, field, val) => {
    setEntries(entries => entries.map((e, idx) => idx !== i ? e : { ...e, [field]: val }));
  };

  const save = async () => {
    const valid = entries.filter(e => e.hours && parseFloat(e.hours) > 0);
    if (valid.length === 0) return toast('Enter hours for at least one entry', 'error');

    setSaving(true);
    let successCount = 0;
    for (const entry of valid) {
      // Convert hours to clock in/out times based on the date
      const clockIn  = new Date(`${date}T08:00:00`).toISOString();
      const clockOut = new Date(`${date}T08:00:00`);
      clockOut.setHours(clockOut.getHours() + Math.floor(parseFloat(entry.hours)));
      clockOut.setMinutes(clockOut.getMinutes() + Math.round((parseFloat(entry.hours) % 1) * 60));

      const r = await api('addHoursEntry', {}, {
        EmployeeID:  entry.employeeID || user.UserID,
        ClockIn:     clockIn,
        ClockOut:    clockOut.toISOString(),
        TotalHours:  parseFloat(entry.hours),
        JobID:       entry.jobID || '',
        Date:        date,
        Notes:       entry.notes || '',
      });
      if (r.status === 'ok') successCount++;
    }

    if (successCount > 0) {
      toast(`${successCount} hour entr${successCount > 1 ? 'ies' : 'y'} logged ✅`);
      onClose();
    } else {
      toast('Failed to save hours', 'error');
    }
    setSaving(false);
  };

  return (
    <div style={S.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={S.sheet}>
        <div style={S.handle} />
        <div style={S.header}>
          <h3 style={{ fontSize: 17, fontWeight: 700 }}>Log Hours</h3>
          <button style={S.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={S.body}>
          <div style={S.label}>Date</div>
          <input type="date" style={S.input} value={date} onChange={e => setDate(e.target.value)} />

          <div style={{ fontWeight: 700, fontSize: 14, color: '#1a4a1a', margin: '14px 0 8px' }}>
            Hours by job
          </div>

          {entries.map((entry, i) => (
            <div key={i} style={S.entryCard}>
              {/* Employee selector (admin/owner only) */}
              {isAdmin && (
                <>
                  <div style={S.label}>Employee</div>
                  <select style={S.input} value={entry.employeeID} onChange={e => updateEntry(i, 'employeeID', e.target.value)}>
                    <option value={user.UserID}>{user.Name} (me)</option>
                    {users.filter(u => u.UserID !== user.UserID).map(u => (
                      <option key={u.UserID} value={u.UserID}>{u.Name}</option>
                    ))}
                  </select>
                </>
              )}

              <div style={S.label}>Job (optional)</div>
              <select style={S.input} value={entry.jobID} onChange={e => updateEntry(i, 'jobID', e.target.value)}>
                <option value="">— No specific job —</option>
                {jobs.map(j => (
                  <option key={j.JobID} value={j.JobID}>
                    {j.CustomerName} — {j.Description?.slice(0, 35)}
                  </option>
                ))}
              </select>

              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <div style={{ flex: 1 }}>
                  <div style={S.label}>Hours worked</div>
                  <input style={S.input} type="number" inputMode="decimal" step="0.25"
                    placeholder="e.g. 8 or 7.5"
                    value={entry.hours} onChange={e => updateEntry(i, 'hours', e.target.value)} />
                </div>
                <div style={{ flex: 2 }}>
                  <div style={S.label}>Notes</div>
                  <input style={S.input} placeholder="What was done…"
                    value={entry.notes} onChange={e => updateEntry(i, 'notes', e.target.value)} />
                </div>
                {entries.length > 1 && (
                  <button onClick={() => setEntries(e => e.filter((_, idx) => idx !== i))}
                    style={{ ...S.closeBtn, alignSelf: 'flex-end', marginBottom: 2 }}>×</button>
                )}
              </div>
            </div>
          ))}

          <button style={S.addBtn} onClick={() => setEntries(e => [...e, { jobID: '', employeeID: user?.UserID || '', hours: '', notes: '' }])}>
            + Add another job entry
          </button>

          {/* Total */}
          {entries.some(e => e.hours) && (
            <div style={S.total}>
              Total: <strong>{entries.reduce((s, e) => s + (parseFloat(e.hours) || 0), 0).toFixed(1)} hrs</strong>
            </div>
          )}
        </div>

        <div style={S.footer}>
          <button style={S.cancelBtn} onClick={onClose}>Cancel</button>
          <button style={S.saveBtn} onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save Hours'}
          </button>
        </div>
      </div>
    </div>
  );
}

function today() { return new Date().toISOString().split('T')[0]; }

const S = {
  overlay:    { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 300, display: 'flex', alignItems: 'flex-end' },
  sheet:      { background: 'white', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 480, margin: '0 auto', maxHeight: '92vh', display: 'flex', flexDirection: 'column', animation: 'slideUp 0.25s ease' },
  handle:     { width: 40, height: 4, background: '#d1d5db', borderRadius: 99, margin: '10px auto 0', flexShrink: 0 },
  header:     { padding: '12px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #f3f4f6', flexShrink: 0 },
  closeBtn:   { background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#6b7280' },
  body:       { padding: '14px 18px', overflowY: 'auto', flex: 1 },
  footer:     { padding: '12px 18px 24px', display: 'flex', gap: 10, borderTop: '1px solid #f3f4f6', flexShrink: 0 },
  label:      { fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4, marginTop: 8 },
  input:      { width: '100%', minHeight: 46, padding: '10px 12px', border: '2px solid #d1d5db', borderRadius: 8, fontSize: 15, fontFamily: 'inherit', background: 'white' },
  entryCard:  { background: '#f9fafb', borderRadius: 10, padding: '12px 14px', marginBottom: 10, border: '1px solid #e5e7eb' },
  addBtn:     { display: 'block', width: '100%', padding: 11, border: '2px dashed #2d6a2d', borderRadius: 8, background: 'transparent', color: '#2d6a2d', fontSize: 14, fontWeight: 600, cursor: 'pointer', marginTop: 4 },
  total:      { background: '#e8f5e8', borderRadius: 8, padding: '10px 14px', marginTop: 12, fontSize: 14, color: '#1a4a1a', textAlign: 'center' },
  cancelBtn:  { flex: 1, padding: 12, borderRadius: 8, border: '2px solid #d1d5db', background: 'white', color: '#374151', fontWeight: 600, cursor: 'pointer', fontSize: 14 },
  saveBtn:    { flex: 2, padding: 12, borderRadius: 8, border: 'none', background: '#1a4a1a', color: 'white', fontWeight: 700, cursor: 'pointer', fontSize: 14 },
};
