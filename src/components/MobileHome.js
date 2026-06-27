import React, { useState, useEffect } from 'react';
import { api, getUser } from '../api';
import { toast } from './Toast';
import NewJobFlow from './NewJobFlow';

export default function MobileHome({ onNavigate, onLogout }) {
  const user = getUser();
  const [clockedIn, setClockedIn]   = useState(false);
  const [clockEntry, setClockEntry] = useState(null);
  const [elapsed, setElapsed]       = useState('');
  const [working, setWorking]       = useState(false);
  const [showNewJob, setShowNewJob] = useState(false);
  const [todayJobs, setTodayJobs]   = useState([]);

  const load = () => {
    api('getHours').then(r => {
      if (r.status === 'ok') {
        const open = r.data.find(h => h.EmployeeID === user?.UserID && !h.ClockOut);
        setClockedIn(!!open);
        setClockEntry(open || null);
      }
    });
    api('getJobs', { status: 'Scheduled' }).then(r => {
      if (r.status === 'ok') {
        const t = new Date().toISOString().split('T')[0];
        setTodayJobs(r.data.filter(j => j.JobDate === t));
      }
    });
  };

  useEffect(() => { load(); }, []);

  // Live elapsed timer
  useEffect(() => {
    if (!clockEntry) { setElapsed(''); return; }
    const tick = () => {
      const diff = Date.now() - new Date(clockEntry.ClockIn).getTime();
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setElapsed(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [clockEntry]);

  const handleClock = async () => {
    setWorking(true);
    if (clockedIn) {
      const r = await api('clockOut', {}, {});
      if (r.status === 'ok') { toast(`Clocked out — ${r.data.TotalHours} hrs ✅`); load(); }
      else toast(r.message, 'error');
    } else {
      const r = await api('clockIn', {}, {});
      if (r.status === 'ok') { toast('Clocked in! ✅'); load(); }
      else toast(r.message, 'error');
    }
    setWorking(false);
  };

  if (showNewJob) {
    return (
      <NewJobFlow
        onComplete={() => { setShowNewJob(false); toast('Job created! ✅'); load(); }}
        onCancel={() => setShowNewJob(false)}
      />
    );
  }

  return (
    <div style={styles.wrap}>
      {/* Header */}
      <div style={styles.header}>
        <img src="images/logo.svg" alt="JB Brush Control" style={{ height: 36, filter: 'invert(1)' }} />
        <button style={styles.logoutBtn} onClick={onLogout}>Sign out</button>
      </div>

      {/* Clock status strip */}
      <div style={{ ...styles.clockStrip, background: clockedIn ? '#14532d' : '#374151' }}>
        <div>
          <div style={styles.clockLabel}>
            <span style={{ ...styles.dot, background: clockedIn ? '#4ade80' : '#9ca3af' }} />
            {clockedIn ? 'Clocked In' : 'Not Clocked In'}
          </div>
          {clockedIn && <div style={styles.clockTime}>{elapsed}</div>}
        </div>
        <button style={{ ...styles.clockBtn, background: clockedIn ? '#dc2626' : '#2d6a2d' }}
          onClick={handleClock} disabled={working}>
          {working ? '…' : clockedIn ? '⏹ Out' : '▶ In'}
        </button>
      </div>

      {/* Today's jobs */}
      {todayJobs.length > 0 && (
        <div style={styles.todaySection}>
          <div style={styles.sectionLabel}>Today's Jobs</div>
          {todayJobs.map(j => (
            <div key={j.JobID} style={styles.jobPill}>
              <span style={{ fontWeight: 600 }}>{j.CustomerName}</span>
              <span style={{ fontSize: 12, color: '#6b7280' }}>{j.Description?.slice(0,40)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Big action buttons */}
      <div style={styles.grid}>
        <button style={{ ...styles.bigBtn, background: '#1a4a1a' }} onClick={() => setShowNewJob(true)}>
          <span style={styles.btnIcon}>📋</span>
          <span style={styles.btnLabel}>New Job</span>
          <span style={styles.btnSub}>Create estimate & photos</span>
        </button>

        <button style={{ ...styles.bigBtn, background: '#2d6a2d' }} onClick={() => onNavigate('mileage')}>
          <span style={styles.btnIcon}>🚛</span>
          <span style={styles.btnLabel}>Log Mileage</span>
          <span style={styles.btnSub}>Record truck miles</span>
        </button>

        <button style={{ ...styles.bigBtn, background: '#1d6fa4' }} onClick={() => onNavigate('jobs')}>
          <span style={styles.btnIcon}>📅</span>
          <span style={styles.btnLabel}>My Jobs</span>
          <span style={styles.btnSub}>View schedule</span>
        </button>

        <button style={{ ...styles.bigBtn, background: '#d97706' }} onClick={() => onNavigate('expenses')}>
          <span style={styles.btnIcon}>💸</span>
          <span style={styles.btnLabel}>Log Expense</span>
          <span style={styles.btnSub}>Fuel, parts, supplies</span>
        </button>
      </div>

      <div style={styles.greeting}>
        👋 {getGreeting()}, <strong>{user?.Name}</strong>
      </div>
    </div>
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

const styles = {
  wrap: { display:'flex', flexDirection:'column', minHeight:'100vh', background:'#f0f4f0', maxWidth:480, margin:'0 auto' },
  header: { background:'#1a4a1a', padding:'12px 16px', display:'flex', alignItems:'center', justifyContent:'space-between' },
  logoutBtn: { background:'rgba(255,255,255,0.15)', border:'none', color:'white', padding:'6px 12px', borderRadius:6, fontSize:12, cursor:'pointer' },
  clockStrip: { padding:'14px 16px', display:'flex', alignItems:'center', justifyContent:'space-between', color:'white' },
  clockLabel: { fontSize:12, fontWeight:600, color:'rgba(255,255,255,0.8)', display:'flex', alignItems:'center', gap:6 },
  clockTime: { fontSize:28, fontWeight:800, fontVariantNumeric:'tabular-nums', letterSpacing:'-0.02em', marginTop:2 },
  dot: { display:'inline-block', width:8, height:8, borderRadius:'50%' },
  clockBtn: { border:'none', color:'white', padding:'10px 20px', borderRadius:10, fontSize:15, fontWeight:700, cursor:'pointer' },
  todaySection: { padding:'12px 16px 0' },
  sectionLabel: { fontSize:11, fontWeight:700, color:'#6b7280', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:6 },
  jobPill: { background:'white', borderRadius:8, padding:'10px 12px', marginBottom:6, display:'flex', flexDirection:'column', gap:2, boxShadow:'0 1px 3px rgba(0,0,0,0.08)' },
  grid: { display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, padding:16, flex:1 },
  bigBtn: { border:'none', borderRadius:14, padding:'20px 14px', cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'flex-start', gap:4, color:'white', WebkitTapHighlightColor:'transparent', transition:'transform 0.1s, filter 0.1s' },
  btnIcon: { fontSize:28 },
  btnLabel: { fontSize:16, fontWeight:800, lineHeight:1 },
  btnSub: { fontSize:11, opacity:0.75, lineHeight:1.3 },
  greeting: { textAlign:'center', padding:'12px 16px 24px', fontSize:14, color:'#6b7280' },
};
