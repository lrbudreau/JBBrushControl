import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { getSession, clearSession, getUser } from './api';
import { useToast, ToastContainer } from './components/Toast';
import MobileLogin  from './components/MobileLogin';
import MobileHome   from './components/MobileHome';
import AdminApp     from './admin/AdminApp';
import { MobileMileage, MobileJobs, MobileExpenses } from './pages/MobilePages';
import './index.css';

// ── Page wrapper with responsive sidebar nav on desktop ───────
function PageShell({ title, onBack, children }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', minHeight:'100vh', background:'#f0f4f0' }}>
      <div style={{ background:'#1a4a1a', padding:'12px 20px', display:'flex', alignItems:'center', gap:12 }}>
        {onBack && (
          <button onClick={onBack} style={{ background:'rgba(255,255,255,0.15)', border:'none', color:'white', width:36, height:36, borderRadius:8, fontSize:18, cursor:'pointer' }}>←</button>
        )}
        <span style={{ color:'white', fontWeight:700, fontSize:16 }}>{title}</span>
      </div>
      <div style={{ flex:1, maxWidth:960, margin:'0 auto', width:'100%', padding:16 }}>
        {children}
      </div>
    </div>
  );
}

// ── Mobile App ────────────────────────────────────────────────
function MobileApp() {
  const [user, setUser] = useState(null);
  const [page, setPage] = useState('home');
  const { toasts }      = useToast();

  useEffect(() => {
    const session = getSession();
    if (session) setUser(session.user);
  }, []);

  const logout = () => { clearSession(); setUser(null); setPage('home'); };

  if (!user) return <MobileLogin onLogin={u => { setUser(u); setPage('home'); }} />;

  const renderPage = () => {
    switch (page) {
      case 'home':
        return <MobileHome onNavigate={setPage} onLogout={logout} />;
      case 'mileage':
        return <PageShell title="Log Mileage" onBack={() => setPage('home')}><MobileMileage /></PageShell>;
      case 'jobs':
        return <PageShell title="My Jobs" onBack={() => setPage('home')}><MobileJobs /></PageShell>;
      case 'expenses':
        return <PageShell title="Log Expense" onBack={() => setPage('home')}><MobileExpenses /></PageShell>;
      default:
        return <MobileHome onNavigate={setPage} onLogout={logout} />;
    }
  };

  return (
    <>
      {renderPage()}
      <ToastContainer toasts={toasts} />
    </>
  );
}

// ── Root with routing ─────────────────────────────────────────
export default function App() {
  return (
    <BrowserRouter basename="/JBBrushControl">
      <Routes>
        <Route path="/admin" element={<AdminApp />} />
        <Route path="/*"     element={<MobileApp />} />
      </Routes>
    </BrowserRouter>
  );
}
