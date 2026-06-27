import React, { useEffect, useState } from 'react';
import { api } from '../api';
import Modal from '../components/Modal';
import { toast } from '../components/Toast';

const STATUS_BADGE = {
  Quoted: 'badge-blue', Scheduled: 'badge-amber',
  'In Progress': 'badge-green', Complete: 'badge-gray', Invoiced: 'badge-gray'
};

export default function JobsPage() {
  const [jobs, setJobs]           = useState([]);
  const [customers, setCustomers] = useState([]);
  const [equipment, setEquip]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [modal, setModal]         = useState(null);
  const [saving, setSaving]       = useState(false);
  const [divFilter, setDiv]       = useState('All');
  const [form, setForm] = useState({
    CustomerID: '', Division: 'Spray', Description: '',
    JobDate: today(), Status: 'Scheduled', TruckID: '', EmployeeIDs: '', Notes: ''
  });

  const load = () => {
    setLoading(true);
    Promise.all([api('getJobs'), api('getCustomers'), api('getEquipment')]).then(([j, c, e]) => {
      if (j.status === 'ok') setJobs(j.data);
      if (c.status === 'ok') setCustomers(c.data);
      if (e.status === 'ok') setEquip(e.data.filter(x => x.Type === 'Truck'));
      setLoading(false);
    });
  };
  useEffect(() => { load(); }, []);

  const f = e => setForm(p => ({ ...p, [e.target.name]: e.target.value }));

  const save = async () => {
    if (!form.CustomerID) return toast('Select a customer', 'error');
    setSaving(true);
    const r = await api(modal === 'add' ? 'addJob' : 'updateJob', {}, form);
    if (r.status === 'ok') { toast('Job saved!'); load(); setModal(null); }
    else toast(r.message, 'error');
    setSaving(false);
  };

  const visible = jobs
    .filter(j => divFilter === 'All' || j.Division === divFilter)
    .sort((a, b) => (b.JobDate || '').localeCompare(a.JobDate || ''));

  return (
    <div className="page">
      {/* Filters + Add */}
      <div className="row" style={{ marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        {['All', 'Spray', 'Tree'].map(d => (
          <button key={d} className={`btn btn-sm ${divFilter === d ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setDiv(d)}>{d}</button>
        ))}
        <button className="btn btn-primary btn-sm" style={{ marginLeft: 'auto' }}
          onClick={() => { setForm({ CustomerID:'', Division:'Spray', Description:'', JobDate: today(), Status:'Scheduled', TruckID:'', EmployeeIDs:'', Notes:'' }); setModal('add'); }}>
          + Add Job
        </button>
      </div>

      <div className="card">
        {loading ? <div className="card-body"><p className="text-muted">Loading…</p></div>
        : visible.length === 0 ? <div className="empty"><div className="empty-icon">🔧</div><p>No jobs found.</p></div>
        : visible.map(j => (
          <div key={j.JobID} className="list-item" onClick={() => { setForm(j); setModal('edit'); }} style={{ cursor: 'pointer' }}>
            <div className="list-item-main">
              <div className="list-item-title">{j.CustomerName || '—'}</div>
              <div className="list-item-sub">{j.JobDate} · {j.Description?.slice(0,40)}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
              {j.Division === 'Spray' ? <span className="div-spray">Spray</span> : <span className="div-tree">Tree</span>}
              <span className={`badge ${STATUS_BADGE[j.Status] || 'badge-gray'}`}>{j.Status}</span>
            </div>
          </div>
        ))}
      </div>

      {modal && (
        <Modal title={modal === 'add' ? 'Add Job' : 'Edit Job'} onClose={() => setModal(null)} onSave={save} saving={saving}>
          <div className="form-group">
            <label>Customer *</label>
            <select name="CustomerID" value={form.CustomerID} onChange={f}>
              <option value="">— Select customer —</option>
              {customers.map(c => <option key={c.CustomerID} value={c.CustomerID}>{c.Name}</option>)}
            </select>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Division</label>
              <select name="Division" value={form.Division} onChange={f}>
                <option>Spray</option><option>Tree</option>
              </select>
            </div>
            <div className="form-group">
              <label>Status</label>
              <select name="Status" value={form.Status} onChange={f}>
                {['Quoted','Scheduled','In Progress','Complete','Invoiced'].map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label>Job Date</label>
            <input type="date" name="JobDate" value={form.JobDate} onChange={f} />
          </div>
          <div className="form-group">
            <label>Truck</label>
            <select name="TruckID" value={form.TruckID} onChange={f}>
              <option value="">— Select truck —</option>
              {equipment.map(e => <option key={e.EquipmentID} value={e.EquipmentID}>{e.Name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Description</label>
            <textarea name="Description" value={form.Description} onChange={f} placeholder="Describe the work…" />
          </div>
          <div className="form-group">
            <label>Assigned Employees</label>
            <input name="EmployeeIDs" value={form.EmployeeIDs} onChange={f} placeholder="Names or IDs" />
          </div>
          <div className="form-group">
            <label>Notes</label>
            <textarea name="Notes" value={form.Notes} onChange={f} />
          </div>
        </Modal>
      )}
    </div>
  );
}

function today() { return new Date().toISOString().split('T')[0]; }
