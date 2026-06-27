import React, { useEffect, useState } from 'react';
import { api, getUser } from '../api';
import { toast } from '../components/Toast';

export default function ClockPage() {
  const user = getUser();
  const [hours, setHours]     = useState([]);
  const [jobs, setJobs]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [openEntry, setOpen]  = useState(null);
  const [elapsed, setElapsed] = useState('');
  const [jobID, setJobID]     = useState('');
  const [notes, setNotes]     = useState('');

  const load = () => {
    setLoading(true);
    Promise.all([api('getHours'), api('getJobs', { status: 'Scheduled' })]).then(([h, j]) => {
      if (h.status === 'ok') {
        setHours(h.data);
        setOpen(h.data.find(x => x.EmployeeID === user?.UserID && !x.ClockOut) || null);
      }
      if (j.status === 'ok') setJobs(j.data);
      setLoading(false);
    });
  };

  useEffect(() => { load(); }, []);

  // Live timer
  useEffect(() => {
    if (!openEntry) { setElapsed(''); return; }
    const tick = () => {
      const diff = Date.now() - new Date(openEntry.ClockIn).getTime();
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setElapsed(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [openEntry]);

  const clockIn = async () => {
    setWorking(true);
    const r = await api('clockIn', {}, { JobID: jobID, Notes: notes });
    if (r.status === 'ok') { toast('Clocked in! ✅'); load(); setNotes(''); setJobID(''); }
    else toast(r.message, 'error');
    setWorking(false);
  };

  const clockOut = async () => {
    setWorking(true);
    const r = await api('clockOut', {}, { JobID: jobID, Notes: notes });
    if (r.status === 'ok') { toast(`Clocked out — ${r.data.TotalHours} hrs ✅`); load(); setNotes(''); setJobID(''); }
    else toast(r.message, 'error');
    setWorking(false);
  };

  const myHours = hours.filter(h => h.EmployeeID === user?.UserID).slice().reverse().slice(0, 10);

  return (
    <div className="page">
      {/* Clock widget */}
      <div className="clock-widget">
        <div style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.6)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {openEntry ? (
            <><span className="clock-dot active" />Clocked In</>
          ) : (
            <><span className="clock-dot idle" />Not Clocked In</>
          )}
        </div>
        <div className="clock-time">
          {openEntry ? elapsed || '00:00:00' : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
        <div className="clock-label">
          {openEntry
            ? `Since ${new Date(openEntry.ClockIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
            : new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
          }
        </div>
      </div>

      {/* Job selector */}
      <div className="form-group">
        <label>Job (optional)</label>
        <select value={jobID} onChange={e => setJobID(e.target.value)}>
          <option value="">— Select a job —</option>
          {jobs.map(j => (
            <option key={j.JobID} value={j.JobID}>
              {j.CustomerName} — {j.Description?.slice(0,40)}
            </option>
          ))}
        </select>
      </div>
      <div className="form-group">
        <label>Notes</label>
        <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any notes for this shift…" />
      </div>

      {/* Big clock button */}
      {openEntry ? (
        <button className="big-btn big-btn-red" onClick={clockOut} disabled={working}
          style={{ justifyContent: 'center', fontSize: 20, minHeight: 80 }}>
          <span className="btn-icon">⏹</span>
          <span>{working ? 'Clocking out…' : 'Clock Out'}</span>
        </button>
      ) : (
        <button className="big-btn big-btn-green" onClick={clockIn} disabled={working}
          style={{ justifyContent: 'center', fontSize: 20, minHeight: 80 }}>
          <span className="btn-icon">▶</span>
          <span>{working ? 'Clocking in…' : 'Clock In'}</span>
        </button>
      )}

      {/* Recent hours */}
      <div className="section-heading" style={{ marginTop: 20 }}>My recent hours</div>
      <div className="card">
        {loading ? <div className="card-body"><p className="text-muted">Loading…</p></div>
        : myHours.length === 0 ? <div className="empty"><p>No hours logged yet.</p></div>
        : myHours.map(h => (
          <div key={h.HoursID} className="list-item">
            <div className="list-item-main">
              <div className="list-item-title">{h.Date}</div>
              <div className="list-item-sub">
                {h.ClockIn ? new Date(h.ClockIn).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) : '—'}
                {' → '}
                {h.ClockOut ? new Date(h.ClockOut).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) : 'Active'}
              </div>
            </div>
            {h.ClockOut
              ? <span style={{ fontWeight: 700, color: 'var(--green-dark)' }}>{h.TotalHours}h</span>
              : <span className="badge badge-green">Active</span>
            }
          </div>
        ))}
      </div>
    </div>
  );
}
