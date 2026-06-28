import React, { useState, useEffect } from 'react';
import { api, getUser, isOwnerOrAdmin } from '../api';
import { toast } from './Toast';
import NewJobFlow from './NewJobFlow';
import NewEstimate from './NewEstimate';
import LogHours from './LogHours';
import LogMileage from './LogMileage';

export default function MobileHome({ onNavigate, onLogout }) {
  const user    = getUser();
  const isAdmin = isOwnerOrAdmin();
  const [todayJobs, setTodayJobs]   = useState([]);
  const [showNewJob, setShowNewJob]  = useState(false);
  const [showEstimate, setShowEst]   = useState(false);
  const [showHours, setShowHours]    = useState(false);
  const [showMileage, setShowMileage] = useState(false);

  useEffect(() => {
    const t = new Date().toISOString().split('T')[0];
    api('getJobs', { status: 'Scheduled' }).then(r => {
      if (r.status === 'ok') setTodayJobs(r.data.filter(j => j.JobDate === t));
    });
  }, []);

  if (showNewJob)   return <NewJobFlow onComplete={() => { setShowNewJob(false); toast('Job created! ✅'); }} onCancel={() => setShowNewJob(false)} />;
  if (showEstimate) return <NewEstimate onComplete={() => { setShowEst(false); toast('Estimate created! ✅'); }} onCancel={() => setShowEst(false)} />;

  return (
    <div style={S.wrap}>
      {/* Header */}
      <div style={S.header}>
        <img src="images/logo.svg" alt="JB Brush Control" style={{ height: 36, filter: 'invert(1)' }} />
        <button style={S.logoutBtn} onClick={onLogout}>Sign out</button>
      </div>

      {/* Greeting */}
      <div style={S.greeting}>
        {getGreeting()}, <strong>{user?.Name}</strong>
        <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </div>
      </div>

      {/* Today's jobs strip */}
      {todayJobs.length > 0 && (
        <div style={S.todayStrip}>
          <div style={S.todayLabel}>Today's jobs</div>
          {todayJobs.map(j => (
            <div key={j.JobID} style={S.jobPill}>
              <span style={{ fontWeight: 700 }}>{j.CustomerName}</span>
              <span style={{ fontSize: 12, color: '#6b7280' }}> · {j.Description?.slice(0, 35)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Big action buttons */}
      <div style={S.grid}>
        <button style={{ ...S.bigBtn, background: '#1a4a1a' }} onClick={() => setShowNewJob(true)}>
          <span style={S.icon}>📋</span>
          <span style={S.btnLabel}>New Job</span>
          <span style={S.btnSub}>Create job + estimate</span>
        </button>

        <button style={{ ...S.bigBtn, background: '#2d6a2d' }} onClick={() => setShowMileage(true)}>
          <span style={S.icon}>🚛</span>
          <span style={S.btnLabel}>Log Mileage</span>
          <span style={S.btnSub}>Point A → B + rounds</span>
        </button>

        <button style={{ ...S.bigBtn, background: '#1d6fa4' }} onClick={() => setShowHours(true)}>
          <span style={S.icon}>⏱</span>
          <span style={S.btnLabel}>Log Hours</span>
          <span style={S.btnSub}>Track time by job</span>
        </button>

        <button style={{ ...S.bigBtn, background: '#d97706' }} onClick={() => onNavigate('jobs')}>
          <span style={S.icon}>📅</span>
          <span style={S.btnLabel}>My Jobs</span>
          <span style={S.btnSub}>View & manage jobs</span>
        </button>
      </div>

      {/* Admin quick actions */}
      {isAdmin && (
        <div style={S.adminRow}>
          <button style={S.adminBtn} onClick={() => setShowEst(true)}>📋 New Estimate</button>
          <button style={S.adminBtn} onClick={() => onNavigate('expenses')}>💸 Log Expense</button>
        </div>
      )}

      {/* Modals */}
      {showHours   && <LogHours   onClose={() => setShowHours(false)} />}
      {showMileage && <LogMileage onClose={() => setShowMileage(false)} />}
    </div>
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return '☀️ Good morning';
  if (h < 17) return '🌤 Good afternoon';
  return '🌙 Good evening';
}

const S = {
  wrap:       { display: 'flex', flexDirection: 'column', minHeight: '100vh', background: '#f0f4f0', maxWidth: 480, margin: '0 auto' },
  header:     { background: '#1a4a1a', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  logoutBtn:  { background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white', padding: '6px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer' },
  greeting:   { padding: '14px 16px 8px', fontSize: 17, fontWeight: 700, color: '#1a4a1a' },
  todayStrip: { margin: '0 16px 8px', background: 'white', borderRadius: 10, padding: '10px 14px', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' },
  todayLabel: { fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 },
  jobPill:    { padding: '4px 0', fontSize: 13, borderBottom: '1px solid #f3f4f6' },
  grid:       { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, padding: '8px 16px 12px', flex: 1 },
  bigBtn:     { border: 'none', borderRadius: 14, padding: '20px 14px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4, color: 'white', WebkitTapHighlightColor: 'transparent' },
  icon:       { fontSize: 28 },
  btnLabel:   { fontSize: 15, fontWeight: 800, lineHeight: 1 },
  btnSub:     { fontSize: 11, opacity: 0.75, lineHeight: 1.3 },
  adminRow:   { display: 'flex', gap: 10, padding: '0 16px 20px' },
  adminBtn:   { flex: 1, padding: '12px 8px', borderRadius: 10, border: '2px solid #d1d5db', background: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#374151' },
};
