// ── Expenses ────────────────────────────────────────────────
import React, { useEffect, useState } from 'react';
import { api } from '../api';
import Modal from '../components/Modal';
import { toast } from '../components/Toast';

const CATS = ['Fuel Expense','Parts and Repairs','Supplies','Assets','Taxes and Licenses','Insurance','Utilities','Legal and Professional','Office Expense','Other'];

export function ExpensesPage() {
  const [expenses, setExpenses] = useState([]);
  const [jobs, setJobs]         = useState([]);
  const [loading, setLoading]   = useState(true);
  const [modal, setModal]       = useState(false);
  const [saving, setSaving]     = useState(false);
  const [catFilter, setCat]     = useState('All');
  const [form, setForm] = useState({ Date: today(), Category:'Fuel Expense', Description:'', Amount:'', Vendor:'', JobID:'', Division:'Spray', Notes:'' });

  const load = () => {
    setLoading(true);
    Promise.all([api('getExpenses'), api('getJobs')]).then(([e, j]) => {
      if (e.status === 'ok') setExpenses(e.data.slice().reverse());
      if (j.status === 'ok') setJobs(j.data);
      setLoading(false);
    });
  };
  useEffect(() => { load(); }, []);

  const f = e => setForm(p => ({ ...p, [e.target.name]: e.target.value }));

  const save = async () => {
    if (!form.Amount) return toast('Enter an amount', 'error');
    setSaving(true);
    const r = await api('addExpense', {}, form);
    if (r.status === 'ok') { toast('Expense logged!'); load(); setModal(false); setForm({ Date: today(), Category:'Fuel Expense', Description:'', Amount:'', Vendor:'', JobID:'', Division:'Spray', Notes:'' }); }
    else toast(r.message, 'error');
    setSaving(false);
  };

  const totalAll = expenses.reduce((s,e) => s+(parseFloat(e.Amount)||0), 0);
  const visible  = expenses.filter(e => catFilter === 'All' || e.Category === catFilter);

  return (
    <div className="page">
      <div className="stats-row">
        <div className="stat red"><div className="stat-label">Total expenses</div><div className="stat-value">${totalAll.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</div></div>
        <div className="stat"><div className="stat-label">Entries</div><div className="stat-value">{expenses.length}</div></div>
      </div>

      <button className="big-btn big-btn-amber" onClick={() => setModal(true)} style={{ marginBottom:12 }}>
        <span className="btn-icon">💸</span>
        <div className="btn-text"><span className="btn-label">Log Expense</span><span className="btn-sub">Fuel, parts, supplies…</span></div>
      </button>

      <div className="row" style={{ gap:6, marginBottom:10, flexWrap:'wrap' }}>
        <button className={`btn btn-sm ${catFilter==='All'?'btn-primary':'btn-outline'}`} onClick={() => setCat('All')}>All</button>
        {CATS.slice(0,5).map(c => (
          <button key={c} className={`btn btn-sm ${catFilter===c?'btn-primary':'btn-outline'}`} onClick={() => setCat(c)}>{c.split(' ')[0]}</button>
        ))}
      </div>

      <div className="card">
        {loading ? <div className="card-body"><p className="text-muted">Loading…</p></div>
        : visible.length === 0 ? <div className="empty"><div className="empty-icon">💸</div><p>No expenses logged.</p></div>
        : visible.slice(0,30).map(e => (
          <div key={e.ExpenseID} className="list-item">
            <div className="list-item-main">
              <div className="list-item-title">{e.Category}</div>
              <div className="list-item-sub">{e.Date} {e.Vendor ? `· ${e.Vendor}` : ''} {e.Description ? `· ${e.Description.slice(0,30)}` : ''}</div>
            </div>
            <span style={{ fontWeight:800, color:'var(--red)' }}>${parseFloat(e.Amount||0).toFixed(2)}</span>
          </div>
        ))}
      </div>

      {modal && (
        <Modal title="Log Expense" onClose={() => setModal(false)} onSave={save} saving={saving}>
          <div className="form-row">
            <div className="form-group"><label>Date</label><input type="date" name="Date" value={form.Date} onChange={f} /></div>
            <div className="form-group"><label>Division</label>
              <select name="Division" value={form.Division} onChange={f}><option>Spray</option><option>Tree</option></select>
            </div>
          </div>
          <div className="form-group"><label>Category</label>
            <select name="Category" value={form.Category} onChange={f}>
              {CATS.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="form-group"><label>Amount ($) *</label><input type="number" name="Amount" value={form.Amount} onChange={f} inputMode="decimal" step="0.01" placeholder="0.00" /></div>
          <div className="form-group"><label>Vendor</label><input name="Vendor" value={form.Vendor} onChange={f} /></div>
          <div className="form-group"><label>Description</label><input name="Description" value={form.Description} onChange={f} /></div>
          <div className="form-group"><label>Job (optional)</label>
            <select name="JobID" value={form.JobID} onChange={f}>
              <option value="">—</option>
              {jobs.map(j => <option key={j.JobID} value={j.JobID}>{j.CustomerName} — {j.Description?.slice(0,30)}</option>)}
            </select>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Hours Admin ──────────────────────────────────────────────
export function HoursPage() {
  const [hours, setHours]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [start, setStart]     = useState(monthStart());
  const [end, setEnd]         = useState(today());

  const load = (s, e) => {
    setLoading(true);
    api('getHours', { startDate: s, endDate: e }).then(r => {
      if (r.status === 'ok') setHours(r.data);
      setLoading(false);
    });
  };
  useEffect(() => { load(start, end); }, []);

  const byEmployee = hours.reduce((acc, h) => {
    const key = h.EmployeeName || h.EmployeeID;
    if (!acc[key]) acc[key] = { hours: [], total: 0 };
    acc[key].hours.push(h);
    acc[key].total += parseFloat(h.TotalHours)||0;
    return acc;
  }, {});

  const totalHours = hours.reduce((s,h) => s+(parseFloat(h.TotalHours)||0), 0);

  const exportCSV = () => {
    const rows = [['Employee','Date','Clock In','Clock Out','Hours','Notes']];
    hours.forEach(h => rows.push([h.EmployeeName, h.Date,
      h.ClockIn ? new Date(h.ClockIn).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) : '',
      h.ClockOut ? new Date(h.ClockOut).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) : '',
      h.TotalHours, h.Notes
    ]));
    const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = `hours_${start}_${end}.csv`;
    a.click();
  };

  return (
    <div className="page">
      <div className="card" style={{ marginBottom:14 }}>
        <div className="card-body">
          <div className="form-row">
            <div className="form-group"><label>From</label><input type="date" value={start} onChange={e => setStart(e.target.value)} /></div>
            <div className="form-group"><label>To</label><input type="date" value={end} onChange={e => setEnd(e.target.value)} /></div>
          </div>
          <div className="row" style={{ gap:8 }}>
            <button className="btn btn-primary btn-sm" onClick={() => load(start, end)}>Search</button>
            <button className="btn btn-outline btn-sm" onClick={exportCSV} style={{ marginLeft:'auto' }}>⬇ CSV</button>
          </div>
        </div>
      </div>

      <div className="stats-row">
        <div className="stat"><div className="stat-label">Total hours</div><div className="stat-value">{totalHours.toFixed(1)}</div></div>
        <div className="stat"><div className="stat-label">Employees</div><div className="stat-value">{Object.keys(byEmployee).length}</div></div>
      </div>

      {loading ? <div className="empty"><p>Loading…</p></div>
      : Object.entries(byEmployee).map(([name, data]) => (
        <div className="card" key={name} style={{ marginBottom:12 }}>
          <div className="card-header">
            <h3>{name}</h3>
            <span style={{ fontWeight:800, color:'var(--green-dark)' }}>{data.total.toFixed(1)} hrs</span>
          </div>
          {data.hours.map(h => (
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
                ? <span style={{ fontWeight:700 }}>{h.TotalHours}h</span>
                : <span className="badge badge-green">Active</span>
              }
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ── Licenses ─────────────────────────────────────────────────
const LIC_TYPES = ['CDL-A','CDL-B','Pesticide Applicator','Business License','Other'];

export function LicensesPage() {
  const [licenses, setLicenses] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [modal, setModal]       = useState(null);
  const [form, setForm]         = useState({ HolderName:'', EmployeeID:'', LicenseType:'CDL-A', LicenseNumber:'', IssueDate:'', ExpirationDate:'', State:'IN', Notes:'' });
  const [saving, setSaving]     = useState(false);

  const load = () => {
    setLoading(true);
    api('getLicenses').then(r => { if (r.status === 'ok') setLicenses(r.data); setLoading(false); });
  };
  useEffect(() => { load(); }, []);

  const f = e => setForm(p => ({ ...p, [e.target.name]: e.target.value }));

  const save = async () => {
    if (!form.HolderName || !form.ExpirationDate) return toast('Name and expiration required', 'error');
    setSaving(true);
    const r = await api(modal==='add' ? 'addLicense' : 'updateLicense', {}, form);
    if (r.status === 'ok') { toast('License saved!'); load(); setModal(null); }
    else toast(r.message, 'error');
    setSaving(false);
  };

  const expired  = licenses.filter(l => l.DaysUntilExpiry < 0);
  const expiring = licenses.filter(l => l.ExpiryWarning && l.DaysUntilExpiry >= 0);
  const current  = licenses.filter(l => !l.ExpiryWarning && l.DaysUntilExpiry >= 0);

  const LicRow = ({ lic }) => (
    <div className="list-item" onClick={() => { setForm(lic); setModal('edit'); }} style={{ cursor:'pointer' }}>
      <div className="list-item-main">
        <div className="list-item-title">{lic.HolderName}</div>
        <div className="list-item-sub">{lic.LicenseType} · {lic.LicenseNumber} · expires {lic.ExpirationDate}</div>
      </div>
      <span className={`badge ${lic.DaysUntilExpiry < 0 ? 'badge-red' : lic.DaysUntilExpiry <= 14 ? 'badge-red' : lic.DaysUntilExpiry <= 30 ? 'badge-amber' : 'badge-green'}`}>
        {lic.DaysUntilExpiry < 0 ? 'Expired' : `${lic.DaysUntilExpiry}d`}
      </span>
    </div>
  );

  return (
    <div className="page">
      <button className="btn btn-primary btn-sm" style={{ marginBottom:12 }}
        onClick={() => { setForm({ HolderName:'', EmployeeID:'', LicenseType:'CDL-A', LicenseNumber:'', IssueDate:'', ExpirationDate:'', State:'IN', Notes:'' }); setModal('add'); }}>
        + Add License
      </button>

      {loading ? <div className="empty"><p>Loading…</p></div> : (
        <>
          {expired.length > 0 && (
            <div className="card" style={{ borderLeft:'4px solid var(--red)', marginBottom:12 }}>
              <div className="card-header"><h3>🔴 Expired</h3></div>
              {expired.map(l => <LicRow key={l.LicenseID} lic={l} />)}
            </div>
          )}
          {expiring.length > 0 && (
            <div className="card" style={{ borderLeft:'4px solid var(--amber)', marginBottom:12 }}>
              <div className="card-header"><h3>⚠️ Expiring soon</h3></div>
              {expiring.map(l => <LicRow key={l.LicenseID} lic={l} />)}
            </div>
          )}
          <div className="card">
            <div className="card-header"><h3>✅ Current</h3></div>
            {current.length === 0 ? <div className="card-body"><p className="text-muted">No current licenses.</p></div>
            : current.map(l => <LicRow key={l.LicenseID} lic={l} />)}
          </div>
        </>
      )}

      {modal && (
        <Modal title={modal==='add'?'Add License':'Edit License'} onClose={() => setModal(null)} onSave={save} saving={saving}>
          <div className="form-group"><label>Holder Name *</label><input name="HolderName" value={form.HolderName} onChange={f} /></div>
          <div className="form-group"><label>License Type</label>
            <select name="LicenseType" value={form.LicenseType} onChange={f}>
              {LIC_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div className="form-group"><label>License Number</label><input name="LicenseNumber" value={form.LicenseNumber} onChange={f} /></div>
          <div className="form-row">
            <div className="form-group"><label>Issued</label><input type="date" name="IssueDate" value={form.IssueDate} onChange={f} /></div>
            <div className="form-group"><label>Expires *</label><input type="date" name="ExpirationDate" value={form.ExpirationDate} onChange={f} /></div>
          </div>
          <div className="form-group"><label>State</label><input name="State" value={form.State} onChange={f} /></div>
          <div className="form-group"><label>Notes</label><textarea name="Notes" value={form.Notes} onChange={f} /></div>
        </Modal>
      )}
    </div>
  );
}

// ── Reports (Tax Summary) ─────────────────────────────────────
export function ReportsPage() {
  const [summary, setSummary]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefresh] = useState(false);
  const year = new Date().getFullYear().toString();

  const load = () => {
    setLoading(true);
    api('getTaxSummary').then(r => { if (r.status === 'ok') setSummary(r.data); setLoading(false); });
  };
  useEffect(() => { load(); }, []);

  const refresh = async () => {
    setRefresh(true);
    const r = await api('refreshTaxSummary', { year }, {});
    if (r.status === 'ok') { toast('Tax summary refreshed ✅'); load(); }
    else toast(r.message, 'error');
    setRefresh(false);
  };

  const exportCSV = async () => {
    const r = await api('exportCSV', { sheet: 'Tax_Summary' });
    if (r.status === 'ok') {
      const a = document.createElement('a');
      a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(r.data.csv);
      a.download = 'JBBrushControl_TaxSummary.csv';
      a.click();
    }
  };

  const periods = [...new Set(summary.map(r => r.Period))];

  return (
    <div className="page">
      <div className="row" style={{ marginBottom:14, gap:8, flexWrap:'wrap' }}>
        <div>
          <div style={{ fontWeight:700 }}>Indiana Tax Summary {year}</div>
          <div className="text-muted">Quarterly breakdown by division</div>
        </div>
        <div className="row" style={{ gap:8, marginLeft:'auto' }}>
          <button className="btn btn-outline btn-sm" onClick={exportCSV}>⬇ CSV</button>
          <button className="btn btn-primary btn-sm" onClick={refresh} disabled={refreshing}>
            {refreshing ? '…' : '↻ Refresh'}
          </button>
        </div>
      </div>

      {loading ? <div className="empty"><p>Loading…</p></div>
      : periods.length === 0 ? (
        <div className="card"><div className="card-body">
          <p className="text-muted" style={{ marginBottom:12 }}>No data yet. Tap Refresh to generate.</p>
          <button className="btn btn-primary btn-sm" onClick={refresh} disabled={refreshing}>{refreshing ? '…' : '↻ Refresh Now'}</button>
        </div></div>
      ) : periods.map(period => {
        const rows = summary.filter(r => r.Period === period);
        const allRow = rows.find(r => r.Division === 'All');
        return (
          <div className="card" key={period} style={{ marginBottom:12 }}>
            <div className="card-header"><h3>📅 {period}</h3></div>
            <div className="card-body">
              {rows.filter(r => r.Division !== 'All').map(r => (
                <div key={r.Division} style={{ marginBottom:10 }}>
                  {r.Division === 'Spray' ? <span className="div-spray">Spray</span> : <span className="div-tree">Tree</span>}
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:4, marginTop:6, fontSize:13 }}>
                    <div className="text-muted">Revenue</div><div className="fw-bold text-green">${parseFloat(r.TotalRevenue||0).toFixed(2)}</div>
                    <div className="text-muted">Expenses</div><div className="fw-bold text-red">${parseFloat(r.TotalExpenses||0).toFixed(2)}</div>
                    <div className="text-muted">Mileage deduction</div><div className="fw-bold text-amber">${parseFloat(r.MileageDeduction||0).toFixed(2)}</div>
                    <div className="text-muted">Net income</div><div className={`fw-bold ${parseFloat(r.NetIncome||0)>=0?'text-green':'text-red'}`}>${parseFloat(r.NetIncome||0).toFixed(2)}</div>
                  </div>
                </div>
              ))}
              {allRow && (
                <div style={{ borderTop:'2px solid var(--gray-300)', paddingTop:10, marginTop:4 }}>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:4, fontSize:14 }}>
                    <div style={{ fontWeight:700 }}>Total Revenue</div><div style={{ fontWeight:800, color:'var(--green-dark)' }}>${parseFloat(allRow.TotalRevenue||0).toFixed(2)}</div>
                    <div style={{ fontWeight:700 }}>Total Expenses</div><div style={{ fontWeight:800, color:'var(--red)' }}>${parseFloat(allRow.TotalExpenses||0).toFixed(2)}</div>
                    <div style={{ fontWeight:700 }}>Net Income</div><div style={{ fontWeight:800, color: parseFloat(allRow.NetIncome||0)>=0?'var(--green-dark)':'var(--red)' }}>${parseFloat(allRow.NetIncome||0).toFixed(2)}</div>
                  </div>
                </div>
              )}
            </div>
            <div style={{ padding:'10px 16px', background:'var(--amber-pale)', fontSize:12, color:'#92400e' }}>
              💡 Export to CSV to share with your accountant. Mileage deduction uses IRS standard rate ($0.67/mi).
            </div>
          </div>
        );
      })}
    </div>
  );
}

function today() { return new Date().toISOString().split('T')[0]; }
function monthStart() {
  const d = new Date(); d.setDate(1);
  return d.toISOString().split('T')[0];
}
