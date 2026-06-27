import React, { useState, useEffect, useCallback } from 'react';
import { api, clearSession, getUser } from '../api';
import AdminLogin from './AdminLogin';
import SheetGrid, { StatusBadge, DivisionBadge, CurrencyCell } from './SheetGrid';
import { toast, ToastContainer, useToast } from '../components/Toast';
import './admin.css';

// ── Nav config ────────────────────────────────────────────────
const NAV = [
  { section: 'Overview' },
  { id: 'dashboard',  label: 'Dashboard',    icon: '📊' },

  { section: 'Business' },
  { id: 'invoices',   label: 'Invoices',     icon: '🧾' },
  { id: 'estimates',  label: 'Estimates',    icon: '📋' },
  { id: 'customers',  label: 'Customers',    icon: '👥' },
  { id: 'jobs',       label: 'Jobs',         icon: '🔧' },

  { section: 'Operations' },
  { id: 'expenses',   label: 'Expenses',     icon: '💸' },
  { id: 'mileage',    label: 'Mileage',      icon: '🚛' },
  { id: 'hours',      label: 'Hours',        icon: '⏱' },
  { id: 'chemicals',  label: 'Chemicals',    icon: '🧪' },
  { id: 'licenses',   label: 'Licenses',     icon: '📄' },

  { section: 'Reports' },
  { id: 'tax',        label: 'Tax Summary',  icon: '📅' },

  { section: 'Settings' },
  { id: 'users',      label: 'Users',        icon: '👤' },
];

const TITLES = {
  dashboard:'Dashboard', invoices:'Invoices', estimates:'Estimates',
  customers:'Customers', jobs:'Jobs', expenses:'Expenses', mileage:'Mileage',
  hours:'Employee Hours', chemicals:'Chemicals', licenses:'Licenses',
  tax:'Tax Summary', users:'Users',
};

export default function AdminApp() {
  const [user, setUser]   = useState(null);
  const [page, setPage]   = useState('dashboard');
  const { toasts }        = useToast();

  useEffect(() => {
    const stored = sessionStorage.getItem('jb_user');
    const token  = sessionStorage.getItem('jb_token');
    if (stored && token) {
      const u = JSON.parse(stored);
      if (['admin','owner'].includes(u.Role)) setUser(u);
    }
  }, []);

  const logout = () => { clearSession(); setUser(null); };

  if (!user) return <AdminLogin onLogin={u => setUser(u)} />;

  return (
    <div className="admin-wrap">
      {/* Sidebar */}
      <nav className="admin-sidebar">
        <div className="admin-sidebar-logo">
          <img src="images/logo.svg" alt="JB Brush Control" />
        </div>
        <div className="admin-sidebar-nav">
          {NAV.map((item, i) =>
            item.section
              ? <div key={i} className="admin-nav-section">{item.section}</div>
              : <button key={item.id} className={`admin-nav-item ${page===item.id?'active':''}`} onClick={() => setPage(item.id)}>
                  {item.icon} {item.label}
                </button>
          )}
        </div>
        <div className="admin-sidebar-footer">
          <strong>{user.Name}</strong>
          <button onClick={logout} style={{ background:'rgba(255,255,255,0.1)', border:'none', color:'rgba(255,255,255,0.7)', padding:'4px 10px', borderRadius:6, fontSize:11, cursor:'pointer', marginTop:4 }}>
            Sign out
          </button>
        </div>
      </nav>

      {/* Main */}
      <div className="admin-main">
        <div className="admin-topbar">
          <h2>{TITLES[page] || page}</h2>
          <div className="admin-topbar-actions">
            <span style={{ fontSize:12, color:'#6b7280' }}>JB Brush Control Admin</span>
          </div>
        </div>
        <div className="admin-body">
          {page === 'dashboard'  && <AdminDashboard />}
          {page === 'invoices'   && <AdminInvoices />}
          {page === 'estimates'  && <AdminEstimates />}
          {page === 'customers'  && <AdminCustomers />}
          {page === 'jobs'       && <AdminJobs />}
          {page === 'expenses'   && <AdminExpenses />}
          {page === 'mileage'    && <AdminMileage />}
          {page === 'hours'      && <AdminHours />}
          {page === 'chemicals'  && <AdminChemicals />}
          {page === 'licenses'   && <AdminLicenses />}
          {page === 'tax'        && <AdminTax />}
          {page === 'users'      && <AdminUsers />}
        </div>
      </div>
      <ToastContainer toasts={toasts} />
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────
function AdminDashboard() {
  const [data, setData] = useState(null);
  useEffect(() => { api('getDashboard').then(r => { if (r.status==='ok') setData(r.data); }); }, []);
  const month = new Date().toLocaleString('default',{month:'long'});
  if (!data) return <p style={{color:'#6b7280'}}>Loading…</p>;
  return (
    <div>
      <div className="admin-stats">
        <div className="admin-stat"><div className="admin-stat-label">Revenue · {month}</div><div className="admin-stat-value" style={{color:'#1a4a1a'}}>${(data.revenueThisMonth||0).toLocaleString()}</div><div className="admin-stat-sub">paid invoices</div></div>
        <div className="admin-stat amber"><div className="admin-stat-label">Outstanding</div><div className="admin-stat-value" style={{color:'#d97706'}}>${(data.outstandingTotal||0).toLocaleString()}</div><div className="admin-stat-sub">{data.outstandingInvoices||0} invoice(s)</div></div>
        <div className="admin-stat"><div className="admin-stat-label">Jobs · {month}</div><div className="admin-stat-value">{data.jobsThisMonth||0}</div><div className="admin-stat-sub">Spray {data.sprayJobs||0} · Tree {data.treeJobs||0}</div></div>
        <div className="admin-stat blue"><div className="admin-stat-label">Expenses · {month}</div><div className="admin-stat-value" style={{color:'#dc2626'}}>${(data.expensesThisMonth||0).toLocaleString()}</div><div className="admin-stat-sub">{data.milesThisMonth||0} miles logged</div></div>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
        <div style={{background:'white',borderRadius:10,padding:16,boxShadow:'0 1px 3px rgba(0,0,0,0.08)'}}>
          <div style={{fontWeight:700,marginBottom:10}}>🕐 Currently clocked in</div>
          {data.clockedIn?.length > 0
            ? data.clockedIn.map(n => <div key={n} style={{padding:'4px 0',display:'flex',alignItems:'center',gap:8}}><span style={{width:8,height:8,borderRadius:'50%',background:'#4ade80',display:'inline-block'}}></span>{n}</div>)
            : <p style={{color:'#9ca3af',fontSize:13}}>No one clocked in right now.</p>
          }
        </div>
        <div style={{background:'white',borderRadius:10,padding:16,boxShadow:'0 1px 3px rgba(0,0,0,0.08)'}}>
          <div style={{fontWeight:700,marginBottom:10}}>⚠️ License alerts</div>
          {data.expiringLicenses?.length > 0
            ? data.expiringLicenses.map((l,i) => (
              <div key={i} style={{display:'flex',justifyContent:'space-between',padding:'4px 0',borderBottom:'1px solid #f3f4f6'}}>
                <div><div style={{fontWeight:600,fontSize:13}}>{l.name}</div><div style={{fontSize:11,color:'#6b7280'}}>{l.type}</div></div>
                <span className={`admin-badge ${l.days<=14?'admin-badge-red':'admin-badge-amber'}`}>{l.days}d</span>
              </div>
            ))
            : <p style={{color:'#9ca3af',fontSize:13}}>✅ All licenses current.</p>
          }
        </div>
      </div>
    </div>
  );
}

// ── Generic sheet view factory ────────────────────────────────
function useSheetData(action, params={}) {
  const [data, setData]     = useState([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(() => {
    setLoading(true);
    api(action, params).then(r => { if (r.status==='ok') setData(r.data); setLoading(false); });
  }, [action]);
  useEffect(() => { load(); }, [load]);
  return { data, loading, reload: load };
}

// ── Invoices ──────────────────────────────────────────────────
function AdminInvoices() {
  const { data, loading, reload } = useSheetData('getInvoices');
  const [working, setWorking] = useState(null);

  const handleEmail = async (inv) => {
    setWorking(inv.InvoiceID);
    const r = await api('getMailtoLink', {}, { InvoiceID: inv.InvoiceID });
    if (r.status === 'ok') {
      window.open(r.data.mailtoLink, '_blank');
      setTimeout(async () => {
        if (window.confirm(`Did you send the email for invoice ${inv.InvoiceID}? Click OK to mark as sent.`)) {
          await api('markSent', {}, { InvoiceID: inv.InvoiceID });
          toast('Invoice marked as sent ✅');
          reload();
        }
      }, 1000);
    } else toast(r.message, 'error');
    setWorking(null);
  };

  const markPaid = async (inv) => {
    const r = await api('markPaid', {}, { InvoiceID: inv.InvoiceID });
    if (r.status === 'ok') { toast('Invoice marked as paid ✅'); reload(); }
    else toast(r.message, 'error');
  };

  const cols = [
    { key:'InvoiceID',    label:'Invoice #',   width:110 },
    { key:'CustomerName', label:'Customer',     width:160 },
    { key:'Division',     label:'Division',     width:80,  render: DivisionBadge },
    { key:'IssueDate',    label:'Date',         width:100 },
    { key:'DueDate',      label:'Due',          width:100 },
    { key:'Total',        label:'Total',        width:100, render: CurrencyCell },
    { key:'Status',       label:'Status',       width:90,  render: StatusBadge },
    { key:'PaidDate',     label:'Paid Date',    width:100 },
    { key:'actions',      label:'Actions',      width:180, render: (_, row) => (
      <div style={{display:'flex',gap:4}}>
        {row.Status !== 'Paid' && <button className="admin-btn admin-btn-blue admin-btn-sm" onClick={e=>{e.stopPropagation();handleEmail(row);}} disabled={working===row.InvoiceID}>✉️ Email</button>}
        {['Sent','Overdue'].includes(row.Status) && <button className="admin-btn admin-btn-primary admin-btn-sm" onClick={e=>{e.stopPropagation();markPaid(row);}}>✅ Paid</button>}
      </div>
    )},
  ];

  if (loading) return <p style={{color:'#6b7280'}}>Loading…</p>;
  return <SheetGrid data={data} columns={cols} emptyMessage="No invoices yet." />;
}

// ── Estimates ─────────────────────────────────────────────────
function AdminEstimates() {
  const { data, loading, reload } = useSheetData('getEstimates');

  const convert = async (est) => {
    if (!window.confirm(`Convert estimate ${est.EstimateID} to an invoice?`)) return;
    const r = await api('convertToInvoice', {}, { EstimateID: est.EstimateID });
    if (r.status==='ok') { toast(`Invoice ${r.data.InvoiceID} created ✅`); reload(); }
    else toast(r.message, 'error');
  };

  const cols = [
    { key:'EstimateID',   label:'Estimate #',  width:120 },
    { key:'CustomerName', label:'Customer',     width:160 },
    { key:'Division',     label:'Division',     width:80,  render: DivisionBadge },
    { key:'Version',      label:'Version',      width:80,  render: v => <span className={`admin-badge ${v==='Revised'?'admin-badge-amber':'admin-badge-blue'}`}>{v}</span> },
    { key:'EstimateDate', label:'Date',         width:100 },
    { key:'Total',        label:'Total',        width:100, render: CurrencyCell },
    { key:'Status',       label:'Status',       width:100, render: StatusBadge },
    { key:'actions',      label:'',             width:120, render: (_, row) => (
      ['Draft','Sent','Approved'].includes(row.Status)
        ? <button className="admin-btn admin-btn-primary admin-btn-sm" onClick={e=>{e.stopPropagation();convert(row);}}>→ Invoice</button>
        : null
    )},
  ];

  if (loading) return <p style={{color:'#6b7280'}}>Loading…</p>;
  return <SheetGrid data={data} columns={cols} emptyMessage="No estimates yet." />;
}

// ── Customers ─────────────────────────────────────────────────
function AdminCustomers() {
  const { data, loading } = useSheetData('getCustomers');
  const cols = [
    { key:'CustomerID', label:'ID',       width:130 },
    { key:'Name',       label:'Name',     width:160 },
    { key:'Division',   label:'Division', width:80,  render: DivisionBadge },
    { key:'Phone',      label:'Phone',    width:130 },
    { key:'Email',      label:'Email',    width:200 },
    { key:'City',       label:'City',     width:120 },
    { key:'State',      label:'State',    width:60 },
    { key:'Active',     label:'Active',   width:70,  render: v => StatusBadge(String(v).toUpperCase()==='TRUE'?'Active':'Inactive') },
  ];
  if (loading) return <p style={{color:'#6b7280'}}>Loading…</p>;
  return <SheetGrid data={data} columns={cols} emptyMessage="No customers yet." />;
}

// ── Jobs ──────────────────────────────────────────────────────
function AdminJobs() {
  const { data, loading } = useSheetData('getJobs');
  const cols = [
    { key:'JobID',        label:'Job ID',      width:130 },
    { key:'CustomerName', label:'Customer',    width:160 },
    { key:'Division',     label:'Division',    width:80,  render: DivisionBadge },
    { key:'Description',  label:'Description', width:220 },
    { key:'JobDate',      label:'Date',        width:100 },
    { key:'Status',       label:'Status',      width:110, render: StatusBadge },
    { key:'AssignedTo',   label:'Assigned To', width:130 },
  ];
  if (loading) return <p style={{color:'#6b7280'}}>Loading…</p>;
  return <SheetGrid data={data} columns={cols} emptyMessage="No jobs yet." />;
}

// ── Expenses ──────────────────────────────────────────────────
function AdminExpenses() {
  const { data, loading } = useSheetData('getExpenses');
  const total = data.reduce((s,e) => s+(parseFloat(e.Amount)||0), 0);

  const cols = [
    { key:'Date',        label:'Date',        width:100 },
    { key:'Category',    label:'Category',    width:160 },
    { key:'Division',    label:'Division',    width:80,  render: DivisionBadge },
    { key:'Description', label:'Description', width:200 },
    { key:'Amount',      label:'Amount',      width:100, render: CurrencyCell },
    { key:'Vendor',      label:'Vendor',      width:140 },
  ];

  const exportCSV = async () => {
    const r = await api('exportCSV', { sheet: 'Expenses' });
    if (r.status==='ok') {
      const a = document.createElement('a');
      a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(r.data.csv);
      a.download = 'JB_Expenses.csv'; a.click();
    }
  };

  if (loading) return <p style={{color:'#6b7280'}}>Loading…</p>;
  return (
    <div>
      <div style={{display:'flex',gap:12,marginBottom:16,alignItems:'center'}}>
        <div style={{fontWeight:700,fontSize:15}}>Total: <span style={{color:'#dc2626'}}>${total.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</span></div>
        <button className="admin-btn admin-btn-outline" onClick={exportCSV} style={{marginLeft:'auto'}}>⬇ Export CSV</button>
      </div>
      <SheetGrid data={data} columns={cols} emptyMessage="No expenses logged." />
    </div>
  );
}

// ── Mileage ───────────────────────────────────────────────────
function AdminMileage() {
  const { data, loading } = useSheetData('getMileage');
  const totalMiles = data.reduce((s,m) => s+(parseFloat(m.TotalMiles)||0), 0);
  const deduction  = (totalMiles * 0.67).toFixed(2);

  const cols = [
    { key:'Date',       label:'Date',      width:100 },
    { key:'DriverName', label:'Driver',    width:130 },
    { key:'TruckName',  label:'Truck',     width:150 },
    { key:'Division',   label:'Division',  width:80,  render: DivisionBadge },
    { key:'StartMiles', label:'Start',     width:80 },
    { key:'EndMiles',   label:'End',       width:80 },
    { key:'TotalMiles', label:'Miles',     width:80,  render: v => <strong>{v}</strong> },
    { key:'Purpose',    label:'Purpose',   width:180 },
  ];

  const exportCSV = async () => {
    const r = await api('exportCSV', { sheet: 'Mileage' });
    if (r.status==='ok') { const a=document.createElement('a'); a.href='data:text/csv;charset=utf-8,'+encodeURIComponent(r.data.csv); a.download='JB_Mileage.csv'; a.click(); }
  };

  if (loading) return <p style={{color:'#6b7280'}}>Loading…</p>;
  return (
    <div>
      <div style={{display:'flex',gap:16,marginBottom:16,alignItems:'center',flexWrap:'wrap'}}>
        <div style={{fontWeight:700}}>Total miles: <span style={{color:'#1a4a1a'}}>{totalMiles.toLocaleString()}</span></div>
        <div style={{fontWeight:700}}>IRS deduction (@$0.67/mi): <span style={{color:'#1d6fa4'}}>${parseFloat(deduction).toLocaleString()}</span></div>
        <button className="admin-btn admin-btn-outline" onClick={exportCSV} style={{marginLeft:'auto'}}>⬇ Export CSV</button>
      </div>
      <SheetGrid data={data} columns={cols} emptyMessage="No mileage logged." />
    </div>
  );
}

// ── Hours ─────────────────────────────────────────────────────
function AdminHours() {
  const [start, setStart] = useState(monthStart());
  const [end, setEnd]     = useState(today());
  const [data, setData]   = useState([]);
  const [loading, setLoading] = useState(false);

  const load = () => {
    setLoading(true);
    api('getHours', { startDate:start, endDate:end }).then(r => { if(r.status==='ok') setData(r.data); setLoading(false); });
  };
  useEffect(() => { load(); }, []);

  const totalHours = data.reduce((s,h) => s+(parseFloat(h.TotalHours)||0), 0);

  const cols = [
    { key:'EmployeeName', label:'Employee',  width:130 },
    { key:'Date',         label:'Date',      width:100 },
    { key:'ClockIn',      label:'Clock In',  width:150, render: v => v ? new Date(v).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) : '—' },
    { key:'ClockOut',     label:'Clock Out', width:150, render: v => v ? new Date(v).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) : <span className="admin-badge admin-badge-green">Active</span> },
    { key:'TotalHours',   label:'Hours',     width:80,  render: v => <strong>{v || '—'}</strong> },
    { key:'Notes',        label:'Notes',     width:200 },
  ];

  const exportCSV = async () => {
    const r = await api('exportCSV', { sheet: 'Hours' });
    if (r.status==='ok') { const a=document.createElement('a'); a.href='data:text/csv;charset=utf-8,'+encodeURIComponent(r.data.csv); a.download='JB_Hours.csv'; a.click(); }
  };

  return (
    <div>
      <div style={{display:'flex',gap:8,marginBottom:16,alignItems:'flex-end',flexWrap:'wrap'}}>
        <div><label style={{fontSize:12,fontWeight:600,display:'block',marginBottom:4}}>From</label><input type="date" value={start} onChange={e=>setStart(e.target.value)} style={{padding:'6px 10px',border:'1.5px solid #d1d5db',borderRadius:6,fontSize:13}} /></div>
        <div><label style={{fontSize:12,fontWeight:600,display:'block',marginBottom:4}}>To</label><input type="date" value={end} onChange={e=>setEnd(e.target.value)} style={{padding:'6px 10px',border:'1.5px solid #d1d5db',borderRadius:6,fontSize:13}} /></div>
        <button className="admin-btn admin-btn-primary" onClick={load}>Search</button>
        <div style={{fontWeight:700,marginLeft:8}}>Total: <span style={{color:'#1a4a1a'}}>{totalHours.toFixed(1)} hrs</span></div>
        <button className="admin-btn admin-btn-outline" onClick={exportCSV} style={{marginLeft:'auto'}}>⬇ Export CSV</button>
      </div>
      {loading ? <p style={{color:'#6b7280'}}>Loading…</p> : <SheetGrid data={data} columns={cols} emptyMessage="No hours for this period." />}
    </div>
  );
}

// ── Chemicals ─────────────────────────────────────────────────
function AdminChemicals() {
  const { data, loading } = useSheetData('getChemicals');
  const total = data.reduce((s,c) => s+(parseFloat(c.TotalCost)||0), 0);
  const cols = [
    { key:'PurchaseDate', label:'Date',          width:100 },
    { key:'Name',         label:'Chemical',      width:160 },
    { key:'Manufacturer', label:'Manufacturer',  width:140 },
    { key:'Quantity',     label:'Qty',           width:70 },
    { key:'Unit',         label:'Unit',          width:80 },
    { key:'CostPerUnit',  label:'$/Unit',        width:80,  render: CurrencyCell },
    { key:'TotalCost',    label:'Total',         width:90,  render: CurrencyCell },
    { key:'Vendor',       label:'Vendor',        width:130 },
  ];
  if (loading) return <p style={{color:'#6b7280'}}>Loading…</p>;
  return (
    <div>
      <div style={{fontWeight:700,marginBottom:12}}>Total spent: <span style={{color:'#dc2626'}}>${total.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</span></div>
      <SheetGrid data={data} columns={cols} emptyMessage="No chemical purchases logged." />
    </div>
  );
}

// ── Licenses ──────────────────────────────────────────────────
function AdminLicenses() {
  const { data, loading } = useSheetData('getLicenses');
  const cols = [
    { key:'HolderName',     label:'Holder',       width:140 },
    { key:'LicenseType',    label:'Type',         width:160 },
    { key:'LicenseNumber',  label:'Number',       width:130 },
    { key:'IssuedDate',     label:'Issued',       width:100 },
    { key:'ExpirationDate', label:'Expires',      width:100 },
    { key:'State',          label:'State',        width:60 },
    { key:'DaysUntilExpiry', label:'Days Left',   width:90,  render: v => {
      const n = parseInt(v);
      return <span className={`admin-badge ${n<0?'admin-badge-red':n<=30?'admin-badge-amber':'admin-badge-green'}`}>{n<0?'Expired':`${n}d`}</span>;
    }},
  ];
  if (loading) return <p style={{color:'#6b7280'}}>Loading…</p>;
  return <SheetGrid data={data} columns={cols} emptyMessage="No licenses added." />;
}

// ── Tax Summary ───────────────────────────────────────────────
function AdminTax() {
  const [summary, setSummary]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefresh]  = useState(false);
  const year = new Date().getFullYear().toString();

  const load = () => { setLoading(true); api('getTaxSummary').then(r => { if(r.status==='ok') setSummary(r.data); setLoading(false); }); };
  useEffect(() => { load(); }, []);

  const refresh = async () => { setRefresh(true); const r = await api('refreshTaxSummary', { year }, {}); if(r.status==='ok'){toast('Refreshed ✅');load();}else toast(r.message,'error'); setRefresh(false); };

  const exportCSV = async () => {
    const r = await api('exportCSV', { sheet: 'Tax_Summary' });
    if (r.status==='ok') { const a=document.createElement('a'); a.href='data:text/csv;charset=utf-8,'+encodeURIComponent(r.data.csv); a.download='JB_TaxSummary.csv'; a.click(); }
  };

  const periods = [...new Set(summary.map(r => r.Period))];

  return (
    <div>
      <div style={{display:'flex',gap:8,marginBottom:16,alignItems:'center'}}>
        <div><div style={{fontWeight:700}}>Indiana Tax Summary — {year}</div><div style={{fontSize:12,color:'#6b7280'}}>Quarterly breakdown by division. Refresh to recalculate.</div></div>
        <button className="admin-btn admin-btn-outline" onClick={exportCSV} style={{marginLeft:'auto'}}>⬇ Export CSV</button>
        <button className="admin-btn admin-btn-primary" onClick={refresh} disabled={refreshing}>{refreshing?'…':'↻ Refresh'}</button>
      </div>

      {loading ? <p style={{color:'#6b7280'}}>Loading…</p>
      : periods.length === 0 ? (
        <div style={{background:'white',borderRadius:10,padding:32,textAlign:'center',color:'#6b7280'}}>
          <div style={{fontSize:32,marginBottom:8}}>📊</div>
          <p>No data yet. Click Refresh to generate.</p>
          <button className="admin-btn admin-btn-primary" onClick={refresh} style={{marginTop:12}} disabled={refreshing}>{refreshing?'…':'↻ Refresh Now'}</button>
        </div>
      ) : periods.map(period => {
        const rows = summary.filter(r => r.Period === period);
        const allRow = rows.find(r => r.Division === 'All');
        return (
          <div key={period} style={{background:'white',borderRadius:10,marginBottom:16,overflow:'hidden',boxShadow:'0 1px 3px rgba(0,0,0,0.08)'}}>
            <div style={{background:'#1a4a1a',color:'white',padding:'10px 16px',fontWeight:700}}>📅 {period}</div>
            <div style={{overflowX:'auto'}}>
              <table className="tax-table">
                <thead><tr>
                  <th style={{textAlign:'left'}}>Division</th>
                  <th>Revenue</th><th>Expenses</th><th>Fuel</th>
                  <th>Chemicals</th><th>Labor Hrs</th><th>Mileage Ded.</th><th>Net Income</th>
                </tr></thead>
                <tbody>
                  {rows.filter(r=>r.Division!=='All').map(r => (
                    <tr key={r.Division}>
                      <td>{r.Division==='Spray'?<span style={{background:'#dcfce7',color:'#166534',padding:'2px 8px',borderRadius:99,fontSize:11,fontWeight:700}}>Spray</span>:<span style={{background:'#fef9c3',color:'#854d0e',padding:'2px 8px',borderRadius:99,fontSize:11,fontWeight:700}}>Tree</span>}</td>
                      <td style={{color:'#1a4a1a',fontWeight:600}}>${parseFloat(r.TotalRevenue||0).toFixed(2)}</td>
                      <td style={{color:'#dc2626'}}>${parseFloat(r.TotalExpenses||0).toFixed(2)}</td>
                      <td>${parseFloat(r.FuelCosts||0).toFixed(2)}</td>
                      <td>${parseFloat(r.ChemicalCosts||0).toFixed(2)}</td>
                      <td>{parseFloat(r.LaborCosts||0).toFixed(1)}</td>
                      <td style={{color:'#1d6fa4'}}>${parseFloat(r.MileageDeduction||0).toFixed(2)}</td>
                      <td style={{color:parseFloat(r.NetIncome||0)>=0?'#1a4a1a':'#dc2626',fontWeight:700}}>${parseFloat(r.NetIncome||0).toFixed(2)}</td>
                    </tr>
                  ))}
                  {allRow && (
                    <tr className="total-row">
                      <td>📊 Total</td>
                      <td>${parseFloat(allRow.TotalRevenue||0).toFixed(2)}</td>
                      <td>${parseFloat(allRow.TotalExpenses||0).toFixed(2)}</td>
                      <td>—</td><td>—</td><td>—</td>
                      <td>${parseFloat(allRow.MileageDeduction||0).toFixed(2)}</td>
                      <td style={{color:parseFloat(allRow.NetIncome||0)>=0?'#1a4a1a':'#dc2626'}}>${parseFloat(allRow.NetIncome||0).toFixed(2)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div style={{padding:'10px 16px',background:'#fef3c7',fontSize:12,color:'#92400e'}}>
              💡 Mileage deduction uses IRS standard rate ($0.67/mile). Export to CSV for your accountant.
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Users ─────────────────────────────────────────────────────
function AdminUsers() {
  const { data, loading, reload } = useSheetData('getUsers');
  const [modal, setModal]   = useState(null);
  const [form, setForm]     = useState({});
  const [saving, setSaving] = useState(false);

  const f = e => setForm(p => ({...p, [e.target.name]: e.target.value}));

  const save = async () => {
    setSaving(true);
    const r = await api(modal==='add'?'addUser':'updateUser', {}, form);
    if (r.status==='ok') { toast('User saved!'); reload(); setModal(null); }
    else toast(r.message,'error');
    setSaving(false);
  };

  const cols = [
    { key:'UserID', label:'User ID',  width:150 },
    { key:'Name',   label:'Name',     width:130 },
    { key:'Email',  label:'Email',    width:200 },
    { key:'Role',   label:'Role',     width:90,  render: v => <span className={`admin-badge ${v==='owner'?'admin-badge-green':v==='admin'?'admin-badge-blue':'admin-badge-gray'}`}>{v}</span> },
    { key:'Active', label:'Active',   width:70,  render: v => StatusBadge(String(v).toUpperCase()==='TRUE'?'Active':'Inactive') },
  ];

  if (loading) return <p style={{color:'#6b7280'}}>Loading…</p>;
  return (
    <div>
      <div style={{marginBottom:12}}>
        <button className="admin-btn admin-btn-primary" onClick={()=>{setForm({Name:'',Email:'',PIN:'',Role:'employee'});setModal('add');}}>+ Add User</button>
      </div>
      <SheetGrid data={data} columns={cols} onRowClick={row=>{setForm({...row,PIN:''});setModal('edit');}} />

      {modal && (
        <div className="admin-modal-overlay" onClick={e=>e.target===e.currentTarget&&setModal(null)}>
          <div className="admin-modal">
            <div className="admin-modal-header"><h3>{modal==='add'?'Add User':'Edit User'}</h3><button className="admin-btn admin-btn-outline admin-btn-sm" onClick={()=>setModal(null)}>✕</button></div>
            <div className="admin-modal-body">
              <div className="admin-form-grid">
                <div className="admin-field"><label>Name *</label><input name="Name" value={form.Name||''} onChange={f} /></div>
                <div className="admin-field"><label>Role</label>
                  <select name="Role" value={form.Role||'employee'} onChange={f}>
                    <option value="owner">Owner</option>
                    <option value="admin">Admin</option>
                    <option value="employee">Employee</option>
                  </select>
                </div>
                <div className="admin-field admin-form-full"><label>Email</label><input name="Email" value={form.Email||''} onChange={f} /></div>
                <div className="admin-field admin-form-full">
                  <label>PIN {modal==='edit'?'(leave blank to keep current)':'*'}</label>
                  <input type="password" name="PIN" value={form.PIN||''} onChange={f} placeholder="4-8 digit PIN" />
                </div>
              </div>
              <div style={{marginTop:12,padding:'10px 12px',background:'#dbeafe',borderRadius:8,fontSize:12,color:'#1e40af'}}>
                💡 Employees log in on the mobile app with their PIN. Owner and Admin can also access this admin panel.
              </div>
            </div>
            <div className="admin-modal-footer">
              <button className="admin-btn admin-btn-outline" onClick={()=>setModal(null)}>Cancel</button>
              <button className="admin-btn admin-btn-primary" onClick={save} disabled={saving}>{saving?'Saving…':'Save User'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function today() { return new Date().toISOString().split('T')[0]; }
function monthStart() { const d=new Date(); d.setDate(1); return d.toISOString().split('T')[0]; }
