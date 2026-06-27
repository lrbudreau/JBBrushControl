import React, { useState, useEffect } from 'react';
import { getSession, clearSession, isOwnerOrAdmin } from './api';
import { useToast, ToastContainer } from './components/Toast';
import LoginScreen from './components/LoginScreen';

import Dashboard    from './pages/Dashboard';
import ClockPage    from './pages/ClockPage';
import MileagePage  from './pages/MileagePage';
import JobsPage     from './pages/JobsPage';
import CustomersPage from './pages/CustomersPage';
import EstimatesPage from './pages/EstimatesPage';
import InvoicesPage from './pages/InvoicesPage';
import { ExpensesPage, HoursPage, LicensesPage, ReportsPage } from './pages/OtherPages.js';

// ── Nav config ────────────────────────────────────────────────
// Employee nav: simple, phone-focused
const EMPLOYEE_NAV = [
  { id: 'dashboard', label: 'Home',    icon: '🏠' },
  { id: 'clock',     label: 'Clock',   icon: '⏱' },
  { id: 'mileage',   label: 'Mileage', icon: '🚛' },
  { id: 'jobs',      label: 'Jobs',    icon: '🔧' },
];

// Owner/Admin nav: full access
const ADMIN_NAV = [
  { id: 'dashboard',  label: 'Home',      icon: '🏠' },
  { id: 'clock',      label: 'Clock',     icon: '⏱' },
  { id: 'mileage',    label: 'Mileage',   icon: '🚛' },
  { id: 'more',       label: 'More',      icon: '⋯' },
];

// "More" menu items for owner/admin
const MORE_ITEMS = [
  { id: 'jobs',       label: 'Jobs',        icon: '🔧' },
  { id: 'customers',  label: 'Customers',   icon: '👥' },
  { id: 'estimates',  label: 'Estimates',   icon: '📋' },
  { id: 'invoices',   label: 'Invoices',    icon: '🧾' },
  { id: 'expenses',   label: 'Expenses',    icon: '💸' },
  { id: 'hours',      label: 'All Hours',   icon: '⏱' },
  { id: 'licenses',   label: 'Licenses',    icon: '📄' },
  { id: 'reports',    label: 'Tax Reports', icon: '📊' },
];

const PAGE_TITLES = {
  dashboard: 'JB Brush Control', clock: 'Clock In / Out', mileage: 'Mileage',
  jobs: 'Jobs', customers: 'Customers', estimates: 'Estimates',
  invoices: 'Invoices', expenses: 'Expenses', hours: 'Employee Hours',
  licenses: 'Licenses', reports: 'Tax Summary',
};

export default function App() {
  const [user, setUser]       = useState(null);
  const [page, setPage]       = useState('dashboard');
  const [showMore, setShowMore] = useState(false);
  const { toasts, toast }     = useToast();

  useEffect(() => {
    const session = getSession();
    if (session) setUser(session.user);
  }, []);

  const logout = () => { clearSession(); setUser(null); setPage('dashboard'); };

  const navigate = (id) => {
    if (id === 'more') { setShowMore(true); return; }
    setPage(id);
    setShowMore(false);
  };

  if (!user) return <LoginScreen onLogin={u => { setUser(u); setPage('dashboard'); }} />;

  const isAdmin = isOwnerOrAdmin();
  const nav     = isAdmin ? ADMIN_NAV : EMPLOYEE_NAV;

  const pages = {
    dashboard: <Dashboard navigate={navigate} />,
    clock:     <ClockPage />,
    mileage:   <MileagePage />,
    jobs:      <JobsPage />,
    customers: <CustomersPage />,
    estimates: <EstimatesPage navigate={navigate} />,
    invoices:  <InvoicesPage />,
    expenses:  <ExpensesPage />,
    hours:     <HoursPage />,
    licenses:  <LicensesPage />,
    reports:   <ReportsPage />,
  };

  return (
    <div className="app">
      {/* Top bar */}
      <div className="topbar">
        <div>
          <div className="topbar-title">
            {page === 'dashboard' ? (
              <img src="images/logo.svg" alt="JB Brush Control" style={{ height: 32, filter: 'invert(1)' }} />
            ) : PAGE_TITLES[page] || 'JB Brush Control'}
          </div>
          {page === 'dashboard' && <div className="topbar-sub">Ditch Spraying & Tree Services</div>}
        </div>
        <div className="topbar-right">
          <span style={{ fontSize:12, color:'rgba(255,255,255,0.6)' }}>{user.Name}</span>
          <button
            onClick={logout}
            style={{ background:'rgba(255,255,255,0.15)', border:'none', color:'white', borderRadius:6, padding:'5px 10px', fontSize:12, cursor:'pointer' }}>
            Sign out
          </button>
        </div>
      </div>

      {/* Page content */}
      {pages[page] || <div className="page"><div className="empty"><p>Page not found.</p></div></div>}

      {/* Bottom nav */}
      <nav className="bottom-nav">
        {nav.map(item => (
          <button
            key={item.id}
            className={`nav-btn ${(item.id === 'more' ? showMore : page === item.id && !showMore) ? 'active' : ''}`}
            onClick={() => navigate(item.id)}
          >
            <span className="nav-icon">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>

      {/* "More" slide-up menu for admin */}
      {showMore && (
        <div className="modal-overlay" onClick={() => setShowMore(false)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()}>
            <div className="modal-handle" />
            <div className="modal-header">
              <h3>More</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowMore(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                {MORE_ITEMS.map(item => (
                  <button
                    key={item.id}
                    onClick={() => navigate(item.id)}
                    style={{
                      display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
                      gap:6, padding:'16px 12px', borderRadius:12, border:'2px solid var(--gray-200)',
                      background: page === item.id ? 'var(--green-pale)' : 'var(--white)',
                      borderColor: page === item.id ? 'var(--green-mid)' : 'var(--gray-200)',
                      cursor:'pointer', fontSize:13, fontWeight:600, color:'var(--gray-900)',
                    }}
                  >
                    <span style={{ fontSize:26 }}>{item.icon}</span>
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <ToastContainer toasts={toasts} />
    </div>
  );
}
