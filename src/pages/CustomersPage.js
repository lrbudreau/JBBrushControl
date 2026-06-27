import React, { useEffect, useState } from 'react';
import { api } from '../api';
import Modal from '../components/Modal';
import { toast } from '../components/Toast';

const blank = { Name:'', Phone:'', Email:'', Address:'', City:'', State:'IN', Zip:'', Division:'Spray', Notes:'' };

export default function CustomersPage() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [modal, setModal]         = useState(null);
  const [form, setForm]           = useState(blank);
  const [saving, setSaving]       = useState(false);
  const [search, setSearch]       = useState('');
  const [divFilter, setDiv]       = useState('All');

  const load = () => {
    setLoading(true);
    api('getCustomers').then(r => { if (r.status === 'ok') setCustomers(r.data); setLoading(false); });
  };
  useEffect(() => { load(); }, []);

  const f = e => setForm(p => ({ ...p, [e.target.name]: e.target.value }));

  const save = async () => {
    if (!form.Name) return toast('Name is required', 'error');
    setSaving(true);
    const r = await api(modal === 'add' ? 'addCustomer' : 'updateCustomer', {}, form);
    if (r.status === 'ok') { toast('Customer saved!'); load(); setModal(null); }
    else toast(r.message, 'error');
    setSaving(false);
  };

  const visible = customers
    .filter(c => divFilter === 'All' || c.Division === divFilter || c.Division === 'Both')
    .filter(c => !search || c.Name.toLowerCase().includes(search.toLowerCase()) || c.Phone?.includes(search));

  return (
    <div className="page">
      <input
        style={{ width:'100%', padding:'12px 14px', border:'2px solid var(--gray-300)', borderRadius:8, fontSize:16, marginBottom:10 }}
        placeholder="Search customers…" value={search} onChange={e => setSearch(e.target.value)} />

      <div className="row" style={{ marginBottom: 12, gap: 8 }}>
        {['All','Spray','Tree'].map(d => (
          <button key={d} className={`btn btn-sm ${divFilter===d?'btn-primary':'btn-outline'}`} onClick={() => setDiv(d)}>{d}</button>
        ))}
        <button className="btn btn-primary btn-sm" style={{ marginLeft:'auto' }}
          onClick={() => { setForm(blank); setModal('add'); }}>+ Add</button>
      </div>

      <div className="card">
        {loading ? <div className="card-body"><p className="text-muted">Loading…</p></div>
        : visible.length === 0 ? <div className="empty"><div className="empty-icon">👥</div><p>No customers found.</p></div>
        : visible.map(c => (
          <div key={c.CustomerID} className="list-item" onClick={() => { setForm(c); setModal('edit'); }} style={{ cursor:'pointer' }}>
            <div className="list-item-main">
              <div className="list-item-title">{c.Name}</div>
              <div className="list-item-sub">{c.Phone || c.Email || c.City || '—'}</div>
            </div>
            {c.Division === 'Spray' ? <span className="div-spray">Spray</span>
            : c.Division === 'Tree'  ? <span className="div-tree">Tree</span>
            : <><span className="div-spray">Spray</span> <span className="div-tree">Tree</span></>}
          </div>
        ))}
      </div>

      {modal && (
        <Modal title={modal==='add'?'Add Customer':'Edit Customer'} onClose={() => setModal(null)} onSave={save} saving={saving}>
          <div className="form-group"><label>Name *</label><input name="Name" value={form.Name} onChange={f} /></div>
          <div className="form-group"><label>Division</label>
            <select name="Division" value={form.Division} onChange={f}>
              <option>Spray</option><option>Tree</option><option>Both</option>
            </select>
          </div>
          <div className="form-row">
            <div className="form-group"><label>Phone</label><input name="Phone" value={form.Phone} onChange={f} inputMode="tel" /></div>
            <div className="form-group"><label>Email</label><input name="Email" value={form.Email} onChange={f} inputMode="email" /></div>
          </div>
          <div className="form-group"><label>Address</label><input name="Address" value={form.Address} onChange={f} /></div>
          <div className="form-row">
            <div className="form-group"><label>City</label><input name="City" value={form.City} onChange={f} /></div>
            <div className="form-group"><label>Zip</label><input name="Zip" value={form.Zip} onChange={f} inputMode="numeric" /></div>
          </div>
          <div className="form-group"><label>Notes</label><textarea name="Notes" value={form.Notes} onChange={f} /></div>
        </Modal>
      )}
    </div>
  );
}
