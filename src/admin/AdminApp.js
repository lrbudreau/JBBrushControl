import React, { useState, useEffect, useCallback } from 'react';
import { api, clearSession, getUser, formatDate } from '../api';
import AdminLogin from './AdminLogin';
import SheetGrid, { StatusBadge, DivisionBadge, CurrencyCell } from './SheetGrid';
import { toast, ToastContainer, useToast } from '../components/Toast';
import { downloadInvoicePDF } from '../components/InvoicePDF';
import './admin.css';

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
  { id: 'equipment',  label: 'Equipment',    icon: '🚜' },
  { id: 'vendors',    label: 'Vendors',      icon: '🏪' },
  { id: 'licenses',   label: 'Licenses',     icon: '📄' },
  { section: 'Reports' },
  { id: 'tax',        label: 'Tax Summary',  icon: '📅' },
  { section: 'Settings' },
  { id: 'users',      label: 'Users',        icon: '👤' },
];

const TITLES = {
  dashboard:'Dashboard', invoices:'Invoices', estimates:'Estimates',
  customers:'Customers', jobs:'Jobs', expenses:'Expenses', mileage:'Mileage',
  hours:'Employee Hours', equipment:'Equipment', vendors:'Vendors',
  licenses:'Licenses', tax:'Tax Summary', users:'Users',
};

export default function AdminApp() {
  const [user, setUser]   = useState(null);
  const [page, setPage]   = useState('dashboard');
  const { toasts }        = useToast();

  useEffect(() => {
    const stored = localStorage.getItem('jb_user');
    const token  = localStorage.getItem('jb_token');
    if (stored && token) {
      const u = JSON.parse(stored);
      if (['admin','owner'].includes(u.Role)) setUser(u);
    }
  }, []);

  const logout = () => { clearSession(); setUser(null); };

  if (!user) return <AdminLogin onLogin={u => setUser(u)} />;

  return (
    <div className="admin-wrap">
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

      <div className="admin-main">
        <div className="admin-topbar">
          <h2>{TITLES[page] || page}</h2>
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
          {page === 'equipment'  && <AdminEquipment />}
          {page === 'vendors'    && <AdminVendors />}
          {page === 'licenses'   && <AdminLicenses />}
          {page === 'tax'        && <AdminTax />}
          {page === 'users'      && <AdminUsers />}
        </div>
      </div>
      <ToastContainer toasts={toasts} />
    </div>
  );
}

// ── Reusable CRUD modal ───────────────────────────────────────
function CrudModal({ title, fields, values, onChange, onSave, onClose, saving, danger, saveLabel }) {
  return (
    <div className="admin-modal-overlay" onClick={e => e.target===e.currentTarget && onClose()}>
      <div className="admin-modal">
        <div className="admin-modal-header">
          <h3>{title}</h3>
          <button className="admin-btn admin-btn-outline admin-btn-sm" onClick={onClose}>✕</button>
        </div>
        <div className="admin-modal-body">
          <div className="admin-form-grid">
            {fields.map(field => (
              <div key={field.key} className={`admin-field ${field.full ? 'admin-form-full' : ''}`}>
                <label>{field.label}{field.required ? ' *' : ''}</label>
                {field.type === 'select' ? (
                  <select value={values[field.key] ?? ''} onChange={e => onChange(field.key, e.target.value)}>
                    {field.options.map(o => typeof o === 'string'
                      ? <option key={o} value={o}>{o}</option>
                      : <option key={o.value} value={o.value}>{o.label}</option>
                    )}
                  </select>
                ) : field.type === 'textarea' ? (
                  <textarea value={values[field.key] ?? ''} onChange={e => onChange(field.key, e.target.value)} rows={3} />
                ) : (
                  <input type={field.type || 'text'} value={values[field.key] ?? ''}
                    onChange={e => onChange(field.key, e.target.value)}
                    placeholder={field.placeholder || ''} />
                )}
              </div>
            ))}
          </div>
        </div>
        <div className="admin-modal-footer">
          <button className="admin-btn admin-btn-outline" onClick={onClose}>Cancel</button>
          <button className={`admin-btn ${danger ? 'admin-btn-danger' : 'admin-btn-primary'}`}
            onClick={onSave} disabled={saving}>
            {saving ? 'Saving…' : saveLabel || 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

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

function useCrud({ getAction, addAction, updateAction, deleteAction, idField, enrichRow }) {
  const { data, loading, reload } = useSheetData(getAction);
  const [modal, setModal]   = useState(null);
  const [form, setForm]     = useState({});
  const [saving, setSaving] = useState(false);

  const openAdd  = (defaults={}) => { setForm(defaults); setModal('add'); };
  const openEdit = (row) => { setForm({ ...row }); setModal('edit'); };

  const setField = (key, val) => setForm(p => ({ ...p, [key]: val }));

  const save = async () => {
    setSaving(true);
    const action = modal === 'add' ? addAction : updateAction;
    const r = await api(action, {}, form);
    if (r.status === 'ok') { toast('Saved! ✅'); reload(); setModal(null); }
    else toast(r.message, 'error');
    setSaving(false);
  };

  const remove = async (row) => {
    if (!deleteAction) return;
    if (!window.confirm('Are you sure?')) return;
    const r = await api(deleteAction, {}, { [idField]: row[idField] });
    if (r.status === 'ok') { toast('Deleted'); reload(); }
    else toast(r.message, 'error');
  };

  return { data, loading, reload, modal, setModal, form, setField, saving, openAdd, openEdit, save, remove };
}

// ── Dashboard ─────────────────────────────────────────────────
function AdminDashboard() {
  const [data, setData] = useState(null);
  useEffect(() => { api('getDashboard').then(r => { if(r.status==='ok') setData(r.data); }); }, []);
  const month = new Date().toLocaleString('default',{month:'long'});
  if (!data) return <p style={{color:'#6b7280'}}>Loading…</p>;
  return (
    <div>
      <div className="admin-stats">
        <div className="admin-stat"><div className="admin-stat-label">Revenue · {month}</div><div className="admin-stat-value" style={{color:'#1a4a1a'}}>${(data.revenueThisMonth||0).toLocaleString()}</div></div>
        <div className="admin-stat amber"><div className="admin-stat-label">Outstanding</div><div className="admin-stat-value" style={{color:'#d97706'}}>${(data.outstandingTotal||0).toLocaleString()}</div><div className="admin-stat-sub">{data.outstandingInvoices||0} invoice(s)</div></div>
        <div className="admin-stat"><div className="admin-stat-label">Jobs · {month}</div><div className="admin-stat-value">{data.jobsThisMonth||0}</div></div>
        <div className="admin-stat blue"><div className="admin-stat-label">Expenses · {month}</div><div className="admin-stat-value" style={{color:'#dc2626'}}>${(data.expensesThisMonth||0).toLocaleString()}</div></div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
        <div style={{background:'white',borderRadius:10,padding:16,boxShadow:'0 1px 3px rgba(0,0,0,0.08)'}}>
          <div style={{fontWeight:700,marginBottom:10}}>🕐 Currently clocked in</div>
          {data.clockedIn?.length > 0
            ? data.clockedIn.map(n => <div key={n} style={{padding:'4px 0',display:'flex',alignItems:'center',gap:8}}><span style={{width:8,height:8,borderRadius:'50%',background:'#4ade80',display:'inline-block'}}></span>{n}</div>)
            : <p style={{color:'#9ca3af',fontSize:13}}>No one clocked in.</p>
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

// ── Invoices ──────────────────────────────────────────────────
function AdminInvoices() {
  const { data, loading, reload } = useSheetData('getInvoices');
  const [settings, setSettings]   = useState({});
  const [paidModal, setPaidModal] = useState(null);
  const [payForm, setPayForm]     = useState({ PaidDate: today(), PaymentMethod: '', Notes: '' });
  const [saving, setSaving]       = useState(false);

  useEffect(() => { api('getSettings').then(r => { if(r.status==='ok') setSettings(r.data); }); }, []);

  const markPaid = async () => {
    const r = await api('markPaid', {}, { InvoiceID: paidModal.InvoiceID, ...payForm });
    if (r.status==='ok') { toast('Marked as paid ✅'); reload(); setPaidModal(null); }
    else toast(r.message, 'error');
  };

  const emailInvoice = async (inv) => {
    const r = await api('getMailtoLink', {}, { InvoiceID: inv.InvoiceID });
    if (r.status==='ok') {
      window.open(r.data.mailtoLink, '_blank');
      setTimeout(async () => {
        if (window.confirm('Did you send the email? Click OK to mark as sent.')) {
          await api('markSent', {}, { InvoiceID: inv.InvoiceID });
          toast('Marked as sent ✅'); reload();
        }
      }, 1000);
    } else toast(r.message, 'error');
  };

  const cols = [
    { key:'InvoiceID',    label:'Invoice #',   width:110 },
    { key:'CustomerName', label:'Customer',    width:150 },
    { key:'Division',     label:'Division',    width:80,  render: DivisionBadge },
    { key:'IssueDate',    label:'Issued',      width:110, render: v => formatDate(v) },
    { key:'DueDate',      label:'Due',         width:100 },
    { key:'Total',        label:'Total',       width:100, render: CurrencyCell },
    { key:'Status',       label:'Status',      width:130, render: StatusBadge },
    { key:'PaidDate',     label:'Paid',        width:110, render: v => formatDate(v) },
    { key:'PaymentMethod',label:'Payment',     width:100 },
    { key:'_actions',     label:'Actions',     width:220, render: (_, row) => (
      <div style={{display:'flex',gap:4}}>
        <button className="admin-btn admin-btn-outline admin-btn-sm" onClick={e=>{e.stopPropagation();downloadInvoicePDF(row, settings);}}>🖨 PDF</button>
        {row.Status !== 'Paid' && <button className="admin-btn admin-btn-blue admin-btn-sm" style={{background:'var(--blue,#1d6fa4)',color:'white'}} onClick={e=>{e.stopPropagation();emailInvoice(row);}}>✉️</button>}
        {row.Status === 'Awaiting Payment' && <button className="admin-btn admin-btn-primary admin-btn-sm" onClick={e=>{e.stopPropagation();setPaidModal(row);setPayForm({PaidDate:today(),PaymentMethod:'',Notes:''});}}>💵 Paid</button>}
      </div>
    )},
  ];

  if (loading) return <p style={{color:'#6b7280'}}>Loading…</p>;
  return (
    <div>
      <SheetGrid data={data} columns={cols} emptyMessage="No invoices yet." />
      {paidModal && (
        <div className="admin-modal-overlay" onClick={e=>e.target===e.currentTarget&&setPaidModal(null)}>
          <div className="admin-modal">
            <div className="admin-modal-header"><h3>Mark Invoice as Paid</h3><button className="admin-btn admin-btn-outline admin-btn-sm" onClick={()=>setPaidModal(null)}>✕</button></div>
            <div className="admin-modal-body">
              <p style={{marginBottom:12}}><strong>{paidModal.InvoiceID}</strong> · ${parseFloat(paidModal.Total||0).toFixed(2)} · {paidModal.CustomerName}</p>
              <div className="admin-form-grid">
                <div className="admin-field"><label>Payment Method</label>
                  <select value={payForm.PaymentMethod} onChange={e=>setPayForm(p=>({...p,PaymentMethod:e.target.value}))}>
                    <option value="">— Select —</option>
                    {['Cash','Check','Venmo','Zelle','Credit Card','Other'].map(m=><option key={m}>{m}</option>)}
                  </select>
                </div>
                <div className="admin-field"><label>Date Paid</label>
                  <input type="date" value={payForm.PaidDate} onChange={e=>setPayForm(p=>({...p,PaidDate:e.target.value}))} />
                </div>
                <div className="admin-field admin-form-full"><label>Notes</label>
                  <input value={payForm.Notes} onChange={e=>setPayForm(p=>({...p,Notes:e.target.value}))} placeholder="e.g. Check #1234" />
                </div>
              </div>
            </div>
            <div className="admin-modal-footer">
              <button className="admin-btn admin-btn-outline" onClick={()=>setPaidModal(null)}>Cancel</button>
              <button className="admin-btn admin-btn-primary" onClick={markPaid} disabled={saving}>{saving?'Saving…':'✅ Confirm Payment'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Estimates ─────────────────────────────────────────────────
function AdminEstimates() {
  const { data, loading, reload } = useSheetData('getEstimates');
  const [modal, setModal]   = useState(null);
  const [selected, setSel]  = useState(null);
  const [jobDate, setJobDate] = useState(today());
  const [saving, setSaving] = useState(false);

  const accept = async () => {
    setSaving(true);
    const r = await api('acceptEstimate', {}, { EstimateID: selected.EstimateID, JobDate: jobDate });
    if (r.status==='ok') { toast('Accepted ✅'); reload(); setModal(null); }
    else toast(r.message, 'error');
    setSaving(false);
  };

  const reject = async (est) => {
    if (!window.confirm('Reject this estimate?')) return;
    const r = await api('rejectEstimate', {}, { EstimateID: est.EstimateID });
    if (r.status==='ok') { toast('Rejected'); reload(); }
    else toast(r.message, 'error');
  };

  const convert = async (est) => {
    if (!window.confirm(`Convert ${est.EstimateID} to invoice?`)) return;
    const r = await api('convertToInvoice', {}, { EstimateID: est.EstimateID });
    if (r.status==='ok') { toast(`Invoice ${r.data.InvoiceID} created ✅`); reload(); }
    else toast(r.message, 'error');
  };

  const cols = [
    { key:'EstimateID',   label:'Estimate #',  width:120 },
    { key:'CustomerName', label:'Customer',    width:150 },
    { key:'Division',     label:'Division',    width:80,  render: DivisionBadge },
    { key:'EstimateDate', label:'Date',        width:100 },
    { key:'Total',        label:'Total',       width:100, render: CurrencyCell },
    { key:'Status',       label:'Status',      width:120, render: StatusBadge },
    { key:'_actions',     label:'Actions',     width:200, render: (_, row) => (
      <div style={{display:'flex',gap:4}}>
        {row.Status === 'Pending' && <>
          <button className="admin-btn admin-btn-primary admin-btn-sm" onClick={e=>{e.stopPropagation();setSel(row);setModal('accept');}}>✅ Accept</button>
          <button className="admin-btn admin-btn-danger admin-btn-sm" onClick={e=>{e.stopPropagation();reject(row);}}>✕</button>
        </>}
        {row.Status === 'Accepted' && <button className="admin-btn admin-btn-primary admin-btn-sm" onClick={e=>{e.stopPropagation();convert(row);}}>→ Invoice</button>}
      </div>
    )},
  ];

  if (loading) return <p style={{color:'#6b7280'}}>Loading…</p>;
  return (
    <div>
      <SheetGrid data={data} columns={cols} emptyMessage="No estimates yet." />
      {modal === 'accept' && selected && (
        <div className="admin-modal-overlay" onClick={e=>e.target===e.currentTarget&&setModal(null)}>
          <div className="admin-modal">
            <div className="admin-modal-header"><h3>Accept Estimate</h3><button className="admin-btn admin-btn-outline admin-btn-sm" onClick={()=>setModal(null)}>✕</button></div>
            <div className="admin-modal-body">
              <p style={{marginBottom:12}}>{selected.EstimateID} · ${parseFloat(selected.Total||0).toFixed(2)}</p>
              <div className="admin-field"><label>Schedule Job Date *</label><input type="date" value={jobDate} onChange={e=>setJobDate(e.target.value)} /></div>
            </div>
            <div className="admin-modal-footer">
              <button className="admin-btn admin-btn-outline" onClick={()=>setModal(null)}>Cancel</button>
              <button className="admin-btn admin-btn-primary" onClick={accept} disabled={saving||!jobDate}>{saving?'…':'✅ Accept & Schedule'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Customers ─────────────────────────────────────────────────
function AdminCustomers() {
  const crud = useCrud({ getAction:'getCustomers', addAction:'addCustomer', updateAction:'updateCustomer', deleteAction:'deleteCustomer', idField:'CustomerID' });
  const fields = [
    { key:'Name',     label:'Name',     required:true },
    { key:'Division', label:'Division', type:'select', options:['Spray','Tree','Both'] },
    { key:'Phone',    label:'Phone' },
    { key:'Email',    label:'Email' },
    { key:'Address',  label:'Address',  full:true },
    { key:'City',     label:'City' },
    { key:'State',    label:'State',    placeholder:'IN' },
    { key:'Zip',      label:'Zip' },
    { key:'Notes',    label:'Notes',    type:'textarea', full:true },
  ];
  const cols = [
    { key:'Name',    label:'Name',     width:150 },
    { key:'Division',label:'Division', width:80, render: DivisionBadge },
    { key:'Phone',   label:'Phone',    width:130 },
    { key:'Email',   label:'Email',    width:200 },
    { key:'City',    label:'City',     width:110 },
    { key:'Active',  label:'Active',   width:70, render: v => StatusBadge(String(v).toUpperCase()==='TRUE'?'Active':'Inactive') },
  ];
  if (crud.loading) return <p style={{color:'#6b7280'}}>Loading…</p>;
  return (
    <div>
      <div style={{marginBottom:12}}>
        <button className="admin-btn admin-btn-primary" onClick={() => crud.openAdd({ Division:'Spray', State:'IN', Active:true })}>+ Add Customer</button>
      </div>
      <SheetGrid data={crud.data} columns={cols} onRowClick={crud.openEdit} emptyMessage="No customers yet." />
      {crud.modal && <CrudModal title={crud.modal==='add'?'Add Customer':'Edit Customer'} fields={fields} values={crud.form} onChange={crud.setField} onSave={crud.save} onClose={()=>crud.setModal(null)} saving={crud.saving} />}
    </div>
  );
}

// ── Jobs ──────────────────────────────────────────────────────
function AdminJobs() {
  const crud = useCrud({ getAction:'getJobs', addAction:'addJob', updateAction:'updateJob', deleteAction:'deleteJob', idField:'JobID' });
  const { data: customers } = useSheetData('getCustomers');
  const fields = [
    { key:'CustomerID',  label:'Customer',    type:'select', options: [{value:'',label:'— Select —'}, ...customers.map(c=>({value:c.CustomerID,label:c.Name}))] },
    { key:'Division',    label:'Division',    type:'select', options:['Spray','Tree'] },
    { key:'Status',      label:'Status',      type:'select', options:['Estimate','Scheduled','Finished','Canceled'] },
    { key:'Priority',    label:'Priority',    type:'select', options:['Normal','Urgent'] },
    { key:'JobDate',     label:'Job Date',    type:'date' },
    { key:'Description', label:'Description', type:'textarea', full:true },
    { key:'Notes',       label:'Notes',       type:'textarea', full:true },
  ];
  const cols = [
    { key:'CustomerName', label:'Customer',   width:150 },
    { key:'Division',     label:'Division',   width:80, render: DivisionBadge },
    { key:'Description',  label:'Description',width:200 },
    { key:'JobDate',      label:'Date',       width:100 },
    { key:'Priority',     label:'Priority',   width:80, render: v => v==='Urgent' ? <span style={{background:'#fee2e2',color:'#991b1b',padding:'2px 8px',borderRadius:99,fontSize:11,fontWeight:700}}>🔴 Urgent</span> : <span style={{background:'#f3f4f6',color:'#6b7280',padding:'2px 8px',borderRadius:99,fontSize:11,fontWeight:700}}>Normal</span> },
    { key:'Status',       label:'Status',     width:110, render: StatusBadge },
  ];
  if (crud.loading) return <p style={{color:'#6b7280'}}>Loading…</p>;
  return (
    <div>
      <div style={{marginBottom:12}}>
        <button className="admin-btn admin-btn-primary" onClick={()=>crud.openAdd({Division:'Spray',Status:'Estimate',Priority:'Normal'})}>+ Add Job</button>
      </div>
      <SheetGrid data={crud.data} columns={cols} onRowClick={crud.openEdit} emptyMessage="No jobs yet." />
      {crud.modal && <CrudModal title={crud.modal==='add'?'Add Job':'Edit Job'} fields={fields} values={crud.form} onChange={crud.setField} onSave={crud.save} onClose={()=>crud.setModal(null)} saving={crud.saving} />}
    </div>
  );
}

// ── Equipment ─────────────────────────────────────────────────
function AdminEquipment() {
  const crud = useCrud({ getAction:'getEquipment', addAction:'addEquipment', updateAction:'updateEquipment', deleteAction:'deleteEquipment', idField:'EquipmentID' });
  const fields = [
    { key:'Name',         label:'Name *',       required:true },
    { key:'Type',         label:'Type',          type:'select', options:['Truck','Trailer','Tool','Other'] },
    { key:'Year',         label:'Year' },
    { key:'Make',         label:'Make' },
    { key:'Model',        label:'Model' },
    { key:'LicensePlate', label:'License Plate' },
    { key:'Notes',        label:'Notes',         type:'textarea', full:true },
  ];
  const cols = [
    { key:'Name',         label:'Name',          width:150 },
    { key:'Type',         label:'Type',          width:90 },
    { key:'Year',         label:'Year',          width:70 },
    { key:'Make',         label:'Make',          width:100 },
    { key:'Model',        label:'Model',         width:120 },
    { key:'LicensePlate', label:'Plate',         width:100 },
    { key:'Active',       label:'Active',        width:70, render: v => StatusBadge(String(v).toUpperCase()==='TRUE'?'Active':'Inactive') },
  ];
  if (crud.loading) return <p style={{color:'#6b7280'}}>Loading…</p>;
  return (
    <div>
      <div style={{marginBottom:12}}>
        <button className="admin-btn admin-btn-primary" onClick={()=>crud.openAdd({Type:'Truck',Active:true})}>+ Add Equipment</button>
      </div>
      <SheetGrid data={crud.data} columns={cols} onRowClick={crud.openEdit} emptyMessage="No equipment added yet." />
      {crud.modal && <CrudModal title={crud.modal==='add'?'Add Equipment':'Edit Equipment'} fields={fields} values={crud.form} onChange={crud.setField} onSave={crud.save} onClose={()=>crud.setModal(null)} saving={crud.saving} />}
    </div>
  );
}

// ── Vendors ───────────────────────────────────────────────────
function AdminVendors() {
  const crud = useCrud({ getAction:'getVendors', addAction:'addVendor', updateAction:'updateVendor', deleteAction:'deleteVendor', idField:'VendorID' });
  const fields = [
    { key:'Name',     label:'Name *',    required:true },
    { key:'Category', label:'Category',  type:'select', options:['Fuel','Chemical Supplier','Parts','Equipment','Other'] },
    { key:'Phone',    label:'Phone' },
    { key:'Address',  label:'Address',   full:true },
    { key:'Notes',    label:'Notes',     type:'textarea', full:true },
  ];
  const cols = [
    { key:'Name',     label:'Name',     width:160 },
    { key:'Category', label:'Category', width:140 },
    { key:'Phone',    label:'Phone',    width:130 },
    { key:'Address',  label:'Address',  width:200 },
    { key:'Active',   label:'Active',   width:70, render: v => StatusBadge(String(v).toUpperCase()==='TRUE'?'Active':'Inactive') },
  ];
  if (crud.loading) return <p style={{color:'#6b7280'}}>Loading…</p>;
  return (
    <div>
      <div style={{marginBottom:12}}>
        <button className="admin-btn admin-btn-primary" onClick={()=>crud.openAdd({Category:'Fuel',Active:true})}>+ Add Vendor</button>
      </div>
      <SheetGrid data={crud.data} columns={cols} onRowClick={crud.openEdit} emptyMessage="No vendors added yet." />
      {crud.modal && <CrudModal title={crud.modal==='add'?'Add Vendor':'Edit Vendor'} fields={fields} values={crud.form} onChange={crud.setField} onSave={crud.save} onClose={()=>crud.setModal(null)} saving={crud.saving} />}
    </div>
  );
}

// ── Expenses ──────────────────────────────────────────────────
function AdminExpenses() {
  const { data, loading } = useSheetData('getExpenses');
  const total = data.reduce((s,e) => s+(parseFloat(e.Amount)||0), 0);
  const cols = [
    { key:'Date',        label:'Date',       width:100 },
    { key:'Category',    label:'Category',   width:130 },
    { key:'Division',    label:'Division',   width:80, render: DivisionBadge },
    { key:'Description', label:'Description',width:180 },
    { key:'Amount',      label:'Amount',     width:100, render: CurrencyCell },
    { key:'Vendor',      label:'Vendor',     width:130 },
    { key:'ReceiptUrl',  label:'Receipt',    width:80,  render: v => v ? <a href={v} target="_blank" rel="noopener noreferrer" style={{color:'#1d6fa4'}}>View</a> : '' },
  ];
  const exportCSV = async () => {
    const r = await api('exportCSV', { sheet:'Expenses' });
    if (r.status==='ok') { const a=document.createElement('a'); a.href='data:text/csv;charset=utf-8,'+encodeURIComponent(r.data.csv); a.download='JB_Expenses.csv'; a.click(); }
  };
  if (loading) return <p style={{color:'#6b7280'}}>Loading…</p>;
  return (
    <div>
      <div style={{display:'flex',gap:12,marginBottom:16,alignItems:'center'}}>
        <div style={{fontWeight:700}}>Total: <span style={{color:'#dc2626'}}>${total.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</span></div>
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
  const cols = [
    { key:'Date',       label:'Date',     width:100 },
    { key:'DriverName', label:'Driver',   width:120 },
    { key:'TruckName',  label:'Truck',    width:140 },
    { key:'Division',   label:'Division', width:80, render: DivisionBadge },
    { key:'PointA',     label:'From',     width:160 },
    { key:'PointB',     label:'To',       width:160 },
    { key:'Rounds',     label:'Rounds',   width:70 },
    { key:'TotalMiles', label:'Miles',    width:80, render: v => <strong>{v}</strong> },
    { key:'Purpose',    label:'Notes',    width:160 },
  ];
  const exportCSV = async () => {
    const r = await api('exportCSV', { sheet:'Mileage' });
    if (r.status==='ok') { const a=document.createElement('a'); a.href='data:text/csv;charset=utf-8,'+encodeURIComponent(r.data.csv); a.download='JB_Mileage.csv'; a.click(); }
  };
  if (loading) return <p style={{color:'#6b7280'}}>Loading…</p>;
  return (
    <div>
      <div style={{display:'flex',gap:16,marginBottom:16,alignItems:'center',flexWrap:'wrap'}}>
        <div style={{fontWeight:700}}>Total: <span style={{color:'#1a4a1a'}}>{totalMiles.toLocaleString()} miles</span></div>
        <div style={{fontWeight:700}}>IRS deduction: <span style={{color:'#1d6fa4'}}>${(totalMiles*0.67).toFixed(2)}</span></div>
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
  const load = () => { setLoading(true); api('getHours', {startDate:start,endDate:end}).then(r=>{if(r.status==='ok')setData(r.data);setLoading(false);}); };
  useEffect(()=>{load();},[]);
  const totalHours = data.reduce((s,h) => s+(parseFloat(h.TotalHours)||0), 0);
  const cols = [
    { key:'EmployeeName', label:'Employee',  width:130 },
    { key:'Date',         label:'Date',      width:100 },
    { key:'ClockIn',      label:'Clock In',  width:150, render: v => v ? formatDate(v) + ' ' + new Date(v).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) : '—' },
    { key:'ClockOut',     label:'Clock Out', width:150, render: v => v ? new Date(v).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) : <span className="admin-badge admin-badge-green">Active</span> },
    { key:'TotalHours',   label:'Hours',     width:80,  render: v => <strong>{v||'—'}</strong> },
    { key:'Notes',        label:'Notes',     width:200 },
  ];
  const exportCSV = async () => {
    const r = await api('exportCSV', { sheet:'Hours' });
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

// ── Licenses ──────────────────────────────────────────────────
function AdminLicenses() {
  const crud = useCrud({ getAction:'getLicenses', addAction:'addLicense', updateAction:'updateLicense', deleteAction:'deleteLicense', idField:'LicenseID' });
  const fields = [
    { key:'HolderName',     label:'Holder Name *',  required:true },
    { key:'LicenseType',    label:'License Type',   type:'select', options:['CDL-A','CDL-B','Pesticide Applicator','Business License','Other'] },
    { key:'LicenseNumber',  label:'License #' },
    { key:'IssueDate',      label:'Issue Date',     type:'date' },
    { key:'ExpirationDate', label:'Expiration *',   type:'date', required:true },
    { key:'State',          label:'State',          placeholder:'IN' },
    { key:'Notes',          label:'Notes',          type:'textarea', full:true },
  ];
  const cols = [
    { key:'HolderName',     label:'Holder',      width:140 },
    { key:'LicenseType',    label:'Type',        width:160 },
    { key:'LicenseNumber',  label:'Number',      width:130 },
    { key:'ExpirationDate', label:'Expires',     width:100 },
    { key:'DaysUntilExpiry',label:'Days Left',   width:90, render: v => {
      const n = parseInt(v);
      return <span className={`admin-badge ${n<0?'admin-badge-red':n<=30?'admin-badge-amber':'admin-badge-green'}`}>{n<0?'Expired':`${n}d`}</span>;
    }},
  ];
  if (crud.loading) return <p style={{color:'#6b7280'}}>Loading…</p>;
  return (
    <div>
      <div style={{marginBottom:12}}>
        <button className="admin-btn admin-btn-primary" onClick={()=>crud.openAdd({State:'IN'})}>+ Add License</button>
      </div>
      <SheetGrid data={crud.data} columns={cols} onRowClick={crud.openEdit} emptyMessage="No licenses added." />
      {crud.modal && <CrudModal title={crud.modal==='add'?'Add License':'Edit License'} fields={fields} values={crud.form} onChange={crud.setField} onSave={crud.save} onClose={()=>crud.setModal(null)} saving={crud.saving} />}
    </div>
  );
}

// ── Tax Summary ───────────────────────────────────────────────
function AdminTax() {
  const [summary, setSummary]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefresh] = useState(false);
  const year = new Date().getFullYear().toString();
  const load = () => { setLoading(true); api('getTaxSummary').then(r=>{if(r.status==='ok')setSummary(r.data);setLoading(false);}); };
  useEffect(()=>{load();},[]);
  const refresh = async () => { setRefresh(true); const r=await api('refreshTaxSummary',{year},{}); if(r.status==='ok'){toast('Refreshed ✅');load();}else toast(r.message,'error'); setRefresh(false); };
  const exportCSV = async () => {
    const r = await api('exportCSV',{sheet:'Tax_Summary'});
    if(r.status==='ok'){const a=document.createElement('a');a.href='data:text/csv;charset=utf-8,'+encodeURIComponent(r.data.csv);a.download='JB_TaxSummary.csv';a.click();}
  };
  const periods = [...new Set(summary.map(r=>r.Period))];
  return (
    <div>
      <div style={{display:'flex',gap:8,marginBottom:16,alignItems:'center'}}>
        <div><div style={{fontWeight:700}}>Tax Summary — {year}</div><div style={{fontSize:12,color:'#6b7280'}}>Quarterly by division</div></div>
        <button className="admin-btn admin-btn-outline" onClick={exportCSV} style={{marginLeft:'auto'}}>⬇ Export CSV</button>
        <button className="admin-btn admin-btn-primary" onClick={refresh} disabled={refreshing}>{refreshing?'…':'↻ Refresh'}</button>
      </div>
      {loading ? <p style={{color:'#6b7280'}}>Loading…</p>
      : periods.length === 0 ? (
        <div style={{background:'white',borderRadius:10,padding:32,textAlign:'center',color:'#6b7280'}}>
          <div style={{fontSize:32,marginBottom:8}}>📊</div>
          <p>No data yet.</p>
          <button className="admin-btn admin-btn-primary" onClick={refresh} style={{marginTop:12}} disabled={refreshing}>{refreshing?'…':'↻ Refresh Now'}</button>
        </div>
      ) : periods.map(period => {
        const rows   = summary.filter(r=>r.Period===period);
        const allRow = rows.find(r=>r.Division==='All');
        return (
          <div key={period} style={{background:'white',borderRadius:10,marginBottom:16,overflow:'hidden',boxShadow:'0 1px 3px rgba(0,0,0,0.08)'}}>
            <div style={{background:'#1a4a1a',color:'white',padding:'10px 16px',fontWeight:700}}>📅 {period}</div>
            <div style={{overflowX:'auto'}}>
              <table className="tax-table">
                <thead><tr><th style={{textAlign:'left'}}>Division</th><th>Revenue</th><th>Expenses</th><th>Fuel</th><th>Chemicals</th><th>Miles Ded.</th><th>Net Income</th></tr></thead>
                <tbody>
                  {rows.filter(r=>r.Division!=='All').map(r=>(
                    <tr key={r.Division}>
                      <td>{r.Division==='Spray'?<span style={{background:'#dcfce7',color:'#166534',padding:'2px 8px',borderRadius:99,fontSize:11,fontWeight:700}}>Spray</span>:<span style={{background:'#fef9c3',color:'#854d0e',padding:'2px 8px',borderRadius:99,fontSize:11,fontWeight:700}}>Tree</span>}</td>
                      <td style={{color:'#1a4a1a',fontWeight:600}}>${parseFloat(r.TotalRevenue||0).toFixed(2)}</td>
                      <td style={{color:'#dc2626'}}>${parseFloat(r.TotalExpenses||0).toFixed(2)}</td>
                      <td>${parseFloat(r.FuelCosts||0).toFixed(2)}</td>
                      <td>${parseFloat(r.ChemicalCosts||0).toFixed(2)}</td>
                      <td style={{color:'#1d6fa4'}}>${parseFloat(r.MileageDeduction||0).toFixed(2)}</td>
                      <td style={{color:parseFloat(r.NetIncome||0)>=0?'#1a4a1a':'#dc2626',fontWeight:700}}>${parseFloat(r.NetIncome||0).toFixed(2)}</td>
                    </tr>
                  ))}
                  {allRow && (
                    <tr className="total-row">
                      <td>📊 Total</td>
                      <td>${parseFloat(allRow.TotalRevenue||0).toFixed(2)}</td>
                      <td>${parseFloat(allRow.TotalExpenses||0).toFixed(2)}</td>
                      <td>—</td><td>—</td>
                      <td>${parseFloat(allRow.MileageDeduction||0).toFixed(2)}</td>
                      <td style={{color:parseFloat(allRow.NetIncome||0)>=0?'#1a4a1a':'#dc2626'}}>${parseFloat(allRow.NetIncome||0).toFixed(2)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
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
  const f = (k, v) => setForm(p => ({...p, [k]: v}));

  const save = async () => {
    if (!form.Name) return toast('Name is required', 'error');
    setSaving(true);
    const r = await api(modal==='add'?'addUser':'updateUser', {}, form);
    if (r.status==='ok') { toast('User saved!'); reload(); setModal(null); }
    else toast(r.message, 'error');
    setSaving(false);
  };

  const cols = [
    { key:'Name',  label:'Name',  width:140 },
    { key:'Email', label:'Email', width:200 },
    { key:'Role',  label:'Role',  width:100, render: v => <span className={`admin-badge ${v==='owner'?'admin-badge-green':v==='admin'?'admin-badge-blue':'admin-badge-gray'}`}>{v}</span> },
    { key:'Active',label:'Active',width:70,  render: v => StatusBadge(String(v).toUpperCase()==='TRUE'?'Active':'Inactive') },
  ];

  if (loading) return <p style={{color:'#6b7280'}}>Loading…</p>;
  return (
    <div>
      <div style={{marginBottom:12,display:'flex',gap:8,alignItems:'center'}}>
        <button className="admin-btn admin-btn-primary" onClick={()=>{setForm({Name:'',Email:'',PIN:'',Role:'employee'});setModal('add');}}>+ Add User</button>
        <span style={{fontSize:12,color:'#6b7280'}}>PINs are hashed for security. Enter a new PIN to change it.</span>
      </div>
      <SheetGrid data={data} columns={cols} onRowClick={row=>{setForm({...row,PIN:''});setModal('edit');}} />

      {modal && (
        <div className="admin-modal-overlay" onClick={e=>e.target===e.currentTarget&&setModal(null)}>
          <div className="admin-modal">
            <div className="admin-modal-header"><h3>{modal==='add'?'Add User':'Edit User'}</h3><button className="admin-btn admin-btn-outline admin-btn-sm" onClick={()=>setModal(null)}>✕</button></div>
            <div className="admin-modal-body">
              <div className="admin-form-grid">
                <div className="admin-field"><label>Name *</label><input value={form.Name||''} onChange={e=>f('Name',e.target.value)} /></div>
                <div className="admin-field"><label>Role</label>
                  <select value={form.Role||'employee'} onChange={e=>f('Role',e.target.value)}>
                    <option value="owner">Owner</option>
                    <option value="admin">Admin</option>
                    <option value="employee">Employee</option>
                  </select>
                </div>
                <div className="admin-field admin-form-full"><label>Email</label><input value={form.Email||''} onChange={e=>f('Email',e.target.value)} /></div>
                <div className="admin-field admin-form-full">
                  <label>PIN {modal==='edit'?'(enter new PIN to change)':'*'}</label>
                  <input type="password" value={form.PIN||''} onChange={e=>f('PIN',e.target.value)} placeholder={modal==='edit'?'Leave blank to keep current':'4-8 digit PIN'} />
                </div>
              </div>
              <div style={{marginTop:12,padding:'10px 12px',background:'#dbeafe',borderRadius:8,fontSize:12,color:'#1e40af'}}>
                💡 PINs are hashed (encrypted) before saving. Each user must have a unique PIN. If two users try to use the same PIN, the app will warn them to pick a different one.
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
