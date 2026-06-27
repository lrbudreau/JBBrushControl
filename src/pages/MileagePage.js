import React, { useEffect, useState } from 'react';
import { api } from '../api';
import Modal from '../components/Modal';
import { toast } from '../components/Toast';

export default function MileagePage() {
  const [mileage, setMileage]   = useState([]);
  const [equipment, setEquip]   = useState([]);
  const [jobs, setJobs]         = useState([]);
  const [loading, setLoading]   = useState(true);
  const [modal, setModal]       = useState(false);
  const [saving, setSaving]     = useState(false);
  const [form, setForm] = useState({
    Date: today(), EquipmentID: '', TruckName: '',
    JobID: '', StartMiles: '', EndMiles: '', Purpose: '', Division: 'Spray'
  });

  const load = () => {
    setLoading(true);
    Promise.all([api('getMileage'), api('getEquipment'), api('getJobs')]).then(([m, e, j]) => {
      if (m.status === 'ok') setMileage(m.data.slice().reverse());
      if (e.status === 'ok') setEquip(e.data.filter(x => ['Truck','Trailer'].includes(x.Type)));
      if (j.status === 'ok') setJobs(j.data);
      setLoading(false);
    });
  };
  useEffect(() => { load(); }, []);

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
    if (!form.StartMiles || !form.EndMiles) return toast('Enter start and end miles', 'error');
    setSaving(true);
    const r = await api('addMileage', {}, form);
    if (r.status === 'ok') {
      toast(`${r.data.TotalMiles} miles logged ✅`);
      load();
      setModal(false);
      setForm({ Date: today(), EquipmentID: '', TruckName: '', JobID: '', StartMiles: '', EndMiles: '', Purpose: '', Division: 'Spray' });
    } else toast(r.message, 'error');
    setSaving(false);
  };

  const totalMiles = mileage.reduce((s, m) => s + (parseFloat(m.TotalMiles)||0), 0);
  const deduction  = (totalMiles * 0.67).toFixed(2);

  return (
    <div className="page">
      <div className="stats-row">
        <div className="stat"><div className="stat-label">Total miles</div><div className="stat-value">{totalMiles.toLocaleString()}</div></div>
        <div className="stat blue"><div className="stat-label">IRS deduction</div><div className="stat-value">${parseFloat(deduction).toLocaleString()}</div></div>
      </div>

      <button className="big-btn big-btn-green" onClick={() => setModal(true)}>
        <span className="btn-icon">🚛</span>
        <div className="btn-text">
          <span className="btn-label">Log Mileage</span>
          <span className="btn-sub">Record today's truck miles</span>
        </div>
      </button>

      <div className="section-heading" style={{ marginTop: 16 }}>Recent entries</div>
      <div className="card">
        {loading ? <div className="card-body"><p className="text-muted">Loading…</p></div>
        : mileage.length === 0 ? <div className="empty"><div className="empty-icon">🚛</div><p>No mileage logged yet.</p></div>
        : mileage.slice(0, 20).map(m => (
          <div key={m.MileageID} className="list-item">
            <div className="list-item-main">
              <div className="list-item-title">{m.TruckName || m.EquipmentID}</div>
              <div className="list-item-sub">{m.Date} · {m.Purpose || 'No purpose noted'}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontWeight: 700, color: 'var(--green-dark)' }}>{m.TotalMiles} mi</div>
              {m.Division === 'Spray' ? <span className="div-spray">Spray</span> : <span className="div-tree">Tree</span>}
            </div>
          </div>
        ))}
      </div>

      {modal && (
        <Modal title="Log Mileage" onClose={() => setModal(false)} onSave={save} saving={saving}>
          <div className="form-group">
            <label>Date</label>
            <input type="date" name="Date" value={form.Date} onChange={f} />
          </div>
          <div className="form-group">
            <label>Truck *</label>
            <select name="EquipmentID" value={form.EquipmentID} onChange={f}>
              <option value="">— Select truck —</option>
              {equipment.map(e => <option key={e.EquipmentID} value={e.EquipmentID}>{e.Name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Division</label>
            <select name="Division" value={form.Division} onChange={f}>
              <option>Spray</option><option>Tree</option>
            </select>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Start Miles</label>
              <input type="number" name="StartMiles" value={form.StartMiles} onChange={f} placeholder="0" inputMode="numeric" />
            </div>
            <div className="form-group">
              <label>End Miles</label>
              <input type="number" name="EndMiles" value={form.EndMiles} onChange={f} placeholder="0" inputMode="numeric" />
            </div>
          </div>
          <div style={{ background: 'var(--green-pale)', borderRadius: 8, padding: '12px 14px', marginBottom: 14, textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: 'var(--green-dark)', fontWeight: 700, textTransform: 'uppercase' }}>Total Miles</div>
            <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--green-dark)' }}>{total.toFixed(1)}</div>
          </div>
          <div className="form-group">
            <label>Job (optional)</label>
            <select name="JobID" value={form.JobID} onChange={f}>
              <option value="">—</option>
              {jobs.map(j => <option key={j.JobID} value={j.JobID}>{j.CustomerName} — {j.Description?.slice(0,35)}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Purpose</label>
            <input name="Purpose" value={form.Purpose} onChange={f} placeholder="e.g. Job site, supply run" />
          </div>
        </Modal>
      )}
    </div>
  );
}

function today() { return new Date().toISOString().split('T')[0]; }
