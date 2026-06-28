import React, { useEffect, useState } from 'react';
import PhotoViewer from '../components/PhotoViewer';
import JobDetail from '../components/JobDetail';
import { api } from '../api';
import { toast } from '../components/Toast';

// ── Mileage Page ─────────────────────────────────────────────
export function MobileMileage() {
  const [equipment, setEquip]   = useState([]);
  const [jobs, setJobs]         = useState([]);
  const [mileage, setMileage]   = useState([]);
  const [modal, setModal]       = useState(false);
  const [saving, setSaving]     = useState(false);
  const [form, setForm] = useState({ Date: today(), EquipmentID:'', TruckName:'', JobID:'', StartMiles:'', EndMiles:'', Purpose:'', Division:'Spray' });

  useEffect(() => {
    Promise.all([api('getEquipment'), api('getJobs'), api('getMileage')]).then(([e,j,m]) => {
      if (e.status==='ok') setEquip(e.data.filter(x=>['Truck','Trailer'].includes(x.Type)));
      if (j.status==='ok') setJobs(j.data);
      if (m.status==='ok') setMileage(m.data.slice().reverse());
    });
  }, []);

  const f = e => {
    const { name, value } = e.target;
    setForm(p => {
      const next = { ...p, [name]: value };
      if (name === 'EquipmentID') {
        const eq = equipment.find(x => x.EquipmentID === value);
        if (eq) next.TruckName = eq.Name;
      }
      return next;
    });
  };

  const total = Math.max(0, (parseFloat(form.EndMiles)||0) - (parseFloat(form.StartMiles)||0));

  const save = async () => {
    if (!form.EquipmentID) return toast('Select a truck', 'error');
    setSaving(true);
    const r = await api('addMileage', {}, form);
    if (r.status === 'ok') {
      toast(`${r.data.TotalMiles} miles logged ✅`);
      setModal(false);
      api('getMileage').then(m => { if (m.status==='ok') setMileage(m.data.slice().reverse()); });
    } else toast(r.message, 'error');
    setSaving(false);
  };

  const totalMiles = mileage.reduce((s,m) => s+(parseFloat(m.TotalMiles)||0), 0);

  return (
    <div className="page-pad">
      <div className="stats-row">
        <div className="stat"><div className="stat-label">Total miles</div><div className="stat-value">{totalMiles.toLocaleString()}</div></div>
        <div className="stat blue"><div className="stat-label">IRS deduction</div><div className="stat-value">${(totalMiles*0.67).toFixed(0)}</div></div>
      </div>

      <button style={bigBtnStyle('#1a4a1a')} onClick={() => setModal(true)}>
        <span style={{ fontSize:28 }}>🚛</span>
        <div><div style={{ fontSize:17, fontWeight:800 }}>Log Mileage</div><div style={{ fontSize:12, opacity:0.75 }}>Record today's truck miles</div></div>
      </button>

      <div className="section-heading mt-4">Recent entries</div>
      <div className="card">
        {mileage.length === 0
          ? <div className="empty"><div className="empty-icon">🚛</div><p>No mileage logged yet.</p></div>
          : mileage.slice(0,20).map(m => (
            <div key={m.MileageID} className="list-item">
              <div className="list-item-main">
                <div className="list-item-title">{m.TruckName || m.EquipmentID}</div>
                <div className="list-item-sub">{m.Date} · {m.Purpose || '—'}</div>
              </div>
              <div style={{ textAlign:'right' }}>
                <div style={{ fontWeight:700, color:'#1a4a1a' }}>{m.TotalMiles} mi</div>
                {m.Division==='Spray' ? <span className="div-spray">Spray</span> : <span className="div-tree">Tree</span>}
              </div>
            </div>
          ))
        }
      </div>

      {modal && (
        <div className="modal-overlay" onClick={e => e.target===e.currentTarget && setModal(false)}>
          <div className="modal-sheet">
            <div className="modal-handle" />
            <div className="modal-header"><h3>Log Mileage</h3><button className="btn btn-ghost btn-sm" onClick={() => setModal(false)}>✕</button></div>
            <div className="modal-body">
              <div className="form-group"><label>Date</label><input type="date" name="Date" value={form.Date} onChange={f} /></div>
              <div className="form-group"><label>Truck *</label>
                <select name="EquipmentID" value={form.EquipmentID} onChange={f}>
                  <option value="">— Select truck —</option>
                  {equipment.map(e => <option key={e.EquipmentID} value={e.EquipmentID}>{e.Name}</option>)}
                </select>
              </div>
              <div className="form-group"><label>Division</label>
                <select name="Division" value={form.Division} onChange={f}><option>Spray</option><option>Tree</option></select>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Start Miles</label><input type="number" name="StartMiles" value={form.StartMiles} onChange={f} inputMode="numeric" /></div>
                <div className="form-group"><label>End Miles</label><input type="number" name="EndMiles" value={form.EndMiles} onChange={f} inputMode="numeric" /></div>
              </div>
              <div style={{ background:'#e8f5e8', borderRadius:8, padding:'12px', marginBottom:14, textAlign:'center' }}>
                <div style={{ fontSize:11, fontWeight:700, color:'#1a4a1a', textTransform:'uppercase' }}>Total Miles</div>
                <div style={{ fontSize:32, fontWeight:800, color:'#1a4a1a' }}>{total.toFixed(1)}</div>
              </div>
              <div className="form-group"><label>Job (optional)</label>
                <select name="JobID" value={form.JobID} onChange={f}>
                  <option value="">—</option>
                  {jobs.map(j => <option key={j.JobID} value={j.JobID}>{j.CustomerName} — {j.Description?.slice(0,30)}</option>)}
                </select>
              </div>
              <div className="form-group"><label>Purpose</label><input name="Purpose" value={form.Purpose} onChange={f} placeholder="e.g. Job site, supply run" /></div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline btn-full" style={{ flex:1 }} onClick={() => setModal(false)}>Cancel</button>
              <button className="btn btn-primary btn-full" style={{ flex:2 }} onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Log Mileage'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Jobs Page (mobile) ────────────────────────────────────────
export function MobileJobs() {
  const [jobs, setJobs]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]   = useState('All');
  const [viewPhotos, setViewPhotos] = useState(null);
  const [selectedJobID, setSelectedJobID] = useState(null);

  useEffect(() => {
    api('getJobs').then(r => {
      if (r.status==='ok') {
        // Filter out Canceled and Finished for My Jobs view
        const active = r.data.filter(j => !['Canceled','Finished'].includes(j.Status));
        // Sort: Urgent first, then by CustomerName
        active.sort((a,b) => {
          if (a.Priority==='Urgent' && b.Priority!=='Urgent') return -1;
          if (b.Priority==='Urgent' && a.Priority!=='Urgent') return  1;
          return (a.CustomerName||'').localeCompare(b.CustomerName||'');
        });
        setJobs(active);
      }
      setLoading(false);
    });
  }, []);

  const STATUS_COLOR = { Scheduled:'#d97706', 'In Progress':'#2d6a2d', Complete:'#6b7280', Quoted:'#1d6fa4', Invoiced:'#6b7280' };
  const visible = jobs.filter(j => filter==='All' || j.Division===filter);

  // Extract Drive folder URL from job notes
  const getFolderUrl = (notes) => {
    if (!notes) return null;
    const match = notes.match(/Photos: (https:\/\/drive\.google\.com\/[^\n]+)/);
    return match ? match[1] : null;
  };

  return (
    <div className="page-pad">
      <div style={{ display:'flex', gap:8, marginBottom:12 }}>
        {['All','Spray','Tree'].map(d => (
          <button key={d} className={`btn btn-sm ${filter===d?'btn-primary':'btn-outline'}`} onClick={() => setFilter(d)}>{d}</button>
        ))}
      </div>
      <div className="card">
        {loading ? <div className="card-body"><p className="text-muted">Loading…</p></div>
        : visible.length === 0 ? <div className="empty"><div className="empty-icon">🔧</div><p>No jobs found.</p></div>
        : visible.map(j => (
          <div key={j.JobID}
            onClick={() => setSelectedJobID(j.JobID)}
            style={{
              display:'flex', alignItems:'center', justifyContent:'space-between',
              padding:'14px 16px', borderBottom:'1px solid #f3f4f6', cursor:'pointer', gap:10,
              background: j.Priority==='Urgent' ? '#fff5f5' : 'white',
              borderLeft: j.Priority==='Urgent' ? '4px solid #dc2626' : '4px solid transparent',
            }}>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                {j.Priority==='Urgent' && <span style={{ fontSize:12 }}>🔴</span>}
                <span style={{ fontSize:15, fontWeight:700, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {j.CustomerName || '—'}
                </span>
              </div>
              <div style={{ fontSize:12, color:'#6b7280', marginTop:2 }}>{j.Description?.slice(0,45)}</div>
            </div>
            <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:4, flexShrink:0 }}>
              {j.Division==='Spray' ? <span className="div-spray">Spray</span> : <span className="div-tree">Tree</span>}
              <span style={{ fontSize:11, fontWeight:700, color: STATUS_COLOR[j.Status]||'#6b7280' }}>{j.Status}</span>
            </div>
          </div>
        ))}
      </div>

      {selectedJobID && (
        <JobDetail
          jobID={selectedJobID}
          onBack={() => setSelectedJobID(null)}
        />
      )}
    </div>
  );
}

// ── Expenses Page (mobile) ────────────────────────────────────
const CATS = ['Fuel','Chemical','Parts and Repairs','Supplies','Assets','Taxes and Licenses','Insurance','Utilities','Legal and Professional','Office Expense','Other'];

export function MobileExpenses() {
  const [jobs, setJobs]       = useState([]);
  const [vendors, setVendors] = useState([]);
  const [modal, setModal]     = useState(false);
  const [saving, setSaving]   = useState(false);
  const [receipt, setReceipt] = useState(null);
  const fileRef = React.useRef();
  const [form, setForm] = useState({ Date: today(), Category:'Fuel', Description:'', Amount:'', Vendor:'', JobID:'', Division:'Spray' });

  useEffect(() => {
    Promise.all([api('getJobs'), api('getVendors')]).then(([j, v]) => {
      if (j.status==='ok') setJobs(j.data);
      if (v.status==='ok') setVendors(v.data.filter(x => x.Active===true || String(x.Active).toUpperCase()==='TRUE'));
    });
  }, []);

  const f = e => setForm(p => ({ ...p, [e.target.name]: e.target.value }));

  const handleReceipt = (e) => {
    const file = e.target.files[0];
    if (file) setReceipt(file);
  };

  const save = async () => {
    if (!form.Amount) return toast('Enter an amount', 'error');
    setSaving(true);
    let receiptFileID = '', receiptUrl = '';
    // Upload receipt photo if selected
    if (receipt) {
      try {
        const { getJobFolder, uploadPhoto, requestDriveAccess } = await import('../hooks/useDrive');
        await requestDriveAccess();
        const rootFolder = await import('../hooks/useDrive').then(m => m.getJobFolder('Receipts', 'Expenses'));
        const result = await uploadPhoto(receipt, rootFolder.folderId);
        if (result.id) {
          receiptFileID = result.id;
          receiptUrl    = result.webViewLink || '';
        }
      } catch(e) { toast('Receipt upload failed — saving expense without it', 'info'); }
    }
    const r = await api('addExpense', {}, { ...form, ReceiptFileID: receiptFileID, ReceiptUrl: receiptUrl });
    if (r.status === 'ok') {
      toast('Expense logged!');
      setModal(false);
      setReceipt(null);
      setForm({ Date: today(), Category:'Fuel', Description:'', Amount:'', Vendor:'', JobID:'', Division:'Spray' });
    } else toast(r.message, 'error');
    setSaving(false);
  };

  return (
    <div className="page-pad">
      <button style={bigBtnStyle('#d97706')} onClick={() => setModal(true)}>
        <span style={{ fontSize:28 }}>💸</span>
        <div><div style={{ fontSize:17, fontWeight:800 }}>Log Expense</div><div style={{ fontSize:12, opacity:0.75 }}>Fuel, chemicals, parts…</div></div>
      </button>

      {modal && (
        <div className="modal-overlay" onClick={e => e.target===e.currentTarget && setModal(false)}>
          <div className="modal-sheet">
            <div className="modal-handle" />
            <div className="modal-header"><h3>Log Expense</h3><button className="btn btn-ghost btn-sm" onClick={() => setModal(false)}>✕</button></div>
            <div className="modal-body">
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
              <div className="form-group"><label>Vendor</label>
                <select name="Vendor" value={form.Vendor} onChange={f}>
                  <option value="">— Select or type —</option>
                  {vendors.map(v => <option key={v.VendorID} value={v.Name}>{v.Name}</option>)}
                </select>
                {!vendors.find(v => v.Name === form.Vendor) && form.Vendor && (
                  <input name="Vendor" value={form.Vendor} onChange={f} placeholder="Or type vendor name" style={{ marginTop:6, width:'100%', minHeight:46, padding:'10px 12px', border:'2px solid #d1d5db', borderRadius:8, fontSize:15 }} />
                )}
              </div>
              <div className="form-group"><label>Description</label><input name="Description" value={form.Description} onChange={f} /></div>
              <div className="form-group"><label>Job (optional)</label>
                <select name="JobID" value={form.JobID} onChange={f}>
                  <option value="">—</option>
                  {jobs.map(j => <option key={j.JobID} value={j.JobID}>{j.CustomerName} — {j.Description?.slice(0,30)}</option>)}
                </select>
              </div>
              {/* Receipt photo */}
              <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display:'none' }} onChange={handleReceipt} />
              <button onClick={() => fileRef.current.click()}
                style={{ display:'block', width:'100%', padding:10, border:'2px dashed #d1d5db', borderRadius:8, background: receipt?'#e8f5e8':'transparent', color: receipt?'#1a4a1a':'#6b7280', fontSize:13, cursor:'pointer', marginBottom:8 }}>
                {receipt ? `📎 ${receipt.name}` : '📎 Attach receipt photo (optional)'}
              </button>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline btn-full" style={{ flex:1 }} onClick={() => setModal(false)}>Cancel</button>
              <button className="btn btn-primary btn-full" style={{ flex:2 }} onClick={save} disabled={saving}>{saving?'Saving…':'Log Expense'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function today() { return new Date().toISOString().split('T')[0]; }
function bigBtnStyle(bg) {
  return { display:'flex', alignItems:'center', gap:14, width:'100%', minHeight:72, padding:'16px 20px', borderRadius:14, border:'none', background:bg, color:'white', cursor:'pointer', marginBottom:14, WebkitTapHighlightColor:'transparent' };
}
