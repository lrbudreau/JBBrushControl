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
  const [showNewJob, setShowNewJob]   = useState(false);
  const [showEstimate, setShowEst]    = useState(false);
  const [showHours, setShowHours]     = useState(false);
  const [showMileage, setShowMileage] = useState(false);

  if (showNewJob)   return <NewJobFlow onComplete={() => { setShowNewJob(false); toast('Job created! ✅'); }} onCancel={() => setShowNewJob(false)} />;
  if (showEstimate) return <NewEstimate onComplete={() => { setShowEst(false); toast('Estimate created! ✅'); }} onCancel={() => setShowEst(false)} />;

  return (
    <div style={S.wrap}>
      {/* Header */}
      <div style={S.header}>
        <img src="images/logo.svg" alt="JB Brush Control" style={{ height:36, filter:'invert(1)' }} />
        <div style={{ flex:1 }} />
        <span style={{ color:'rgba(255,255,255,0.7)', fontSize:13, marginRight:10 }}>{user?.Name}</span>
        <button style={S.logoutBtn} onClick={onLogout}>Sign out</button>
      </div>

      {/* Main content — responsive grid */}
      <div style={S.content}>
        <div style={S.greeting}>
          {getGreeting()}, <strong>{user?.Name}</strong>
        </div>

        {/* Big action buttons */}
        <div style={S.grid}>
          <ActionBtn icon="📋" label="New Job" sub="Create job + estimate" color="#1a4a1a" onClick={() => setShowNewJob(true)} />
          <ActionBtn icon="🚛" label="Log Mileage" sub="Point A → B + rounds" color="#2d6a2d" onClick={() => setShowMileage(true)} />
          <ActionBtn icon="⏱" label="Log Hours" sub="Track time by job" color="#1d6fa4" onClick={() => setShowHours(true)} />
          <ActionBtn icon="📅" label="My Jobs" sub="View & manage jobs" color="#d97706" onClick={() => onNavigate('jobs')} />
          {isAdmin && <ActionBtn icon="📋" label="New Estimate" sub="Standalone estimate" color="#374151" onClick={() => setShowEst(true)} />}
          {isAdmin && <ActionBtn icon="💸" label="Log Expense" sub="Fuel, chemicals, parts" color="#7c3aed" onClick={() => onNavigate('expenses')} />}
        </div>
      </div>

      {showHours   && <LogHours   onClose={() => setShowHours(false)} />}
      {showMileage && <LogMileage onClose={() => setShowMileage(false)} />}
    </div>
  );
}

function ActionBtn({ icon, label, sub, color, onClick }) {
  return (
    <button style={{ ...S.btn, background: color }} onClick={onClick}>
      <span style={{ fontSize:32 }}>{icon}</span>
      <span style={{ fontWeight:800, fontSize:16, lineHeight:1 }}>{label}</span>
      <span style={{ fontSize:12, opacity:0.8, lineHeight:1.3 }}>{sub}</span>
    </button>
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return '☀️ Good morning';
  if (h < 17) return '🌤 Good afternoon';
  return '🌙 Good evening';
}

const S = {
  wrap:      { display:'flex', flexDirection:'column', minHeight:'100vh', background:'#f0f4f0' },
  header:    { background:'#1a4a1a', padding:'12px 20px', display:'flex', alignItems:'center', gap:10 },
  logoutBtn: { background:'rgba(255,255,255,0.15)', border:'none', color:'white', padding:'6px 12px', borderRadius:6, fontSize:12, cursor:'pointer' },
  content:   { flex:1, padding:'20px', maxWidth:960, margin:'0 auto', width:'100%' },
  greeting:  { fontSize:20, fontWeight:700, color:'#1a4a1a', marginBottom:20 },
  grid:      {
    display:'grid',
    gridTemplateColumns:'repeat(auto-fill, minmax(200px, 1fr))',
    gap:14,
  },
  btn: {
    border:'none', borderRadius:14, padding:'24px 20px',
    cursor:'pointer', display:'flex', flexDirection:'column',
    alignItems:'flex-start', gap:8, color:'white',
    WebkitTapHighlightColor:'transparent',
    transition:'transform 0.1s, filter 0.1s',
    minHeight:130,
  },
};
