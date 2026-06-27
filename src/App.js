import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { getSession, clearSession } from './api';
import { useToast, ToastContainer } from './components/Toast';
import MobileLogin from './components/MobileLogin';
import MobileHome  from './components/MobileHome';
import AdminApp    from './admin/AdminApp';
import { MobileMileage, MobileJobs, MobileExpenses } from './pages/MobilePages';
import './index.css';

// ── Mobile App ────────────────────────────────────────────────
function MobileApp() {
  const [user, setUser]   = useState(null);
  const [page, setPage]   = useState('home');
  const { toasts }        = useToast();

  useEffect(() => {
    const session = getSession();
    if (session) setUser(session.user);
  }, []);

  const logout = () => { clearSession(); setUser(null); };

  if (!user) return <MobileLogin onLogin={u => { setUser(u); setPage('home'); }} />;

  const renderPage = () => {
    switch (page) {
      case 'home':     return <MobileHome onNavigate={setPage} onLogout={logout} />;
      case 'mileage':  return <div className="mobile-page"><div style={{background:'#1a4a1a',padding:'12px 16px',display:'flex',alignItems:'center',gap:10}}><button onClick={()=>setPage('home')} style={{background:'rgba(255,255,255,0.15)',border:'none',color:'white',width:36,height:36,borderRadius:8,fontSize:18,cursor:'pointer'}}>←</button><span style={{color:'white',fontWeight:700,fontSize:16}}>Log Mileage</span></div><MobileMileage /></div>;
      case 'jobs':     return <div className="mobile-page"><div style={{background:'#1a4a1a',padding:'12px 16px',display:'flex',alignItems:'center',gap:10}}><button onClick={()=>setPage('home')} style={{background:'rgba(255,255,255,0.15)',border:'none',color:'white',width:36,height:36,borderRadius:8,fontSize:18,cursor:'pointer'}}>←</button><span style={{color:'white',fontWeight:700,fontSize:16}}>My Jobs</span></div><MobileJobs /></div>;
      case 'expenses': return <div className="mobile-page"><div style={{background:'#1a4a1a',padding:'12px 16px',display:'flex',alignItems:'center',gap:10}}><button onClick={()=>setPage('home')} style={{background:'rgba(255,255,255,0.15)',border:'none',color:'white',width:36,height:36,borderRadius:8,fontSize:18,cursor:'pointer'}}>←</button><span style={{color:'white',fontWeight:700,fontSize:16}}>Log Expense</span></div><MobileExpenses /></div>;
      default:         return <MobileHome onNavigate={setPage} onLogout={logout} />;
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
function AppRouter() {
  return (
    <Routes>
      <Route path="/admin" element={<AdminApp />} />
      <Route path="/*"     element={<MobileApp />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter basename="/JBBrushControl">
      <AppRouter />
    </BrowserRouter>
  );
}
