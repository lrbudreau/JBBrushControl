import React, { useEffect, useState } from 'react';
import { api } from '../api';
import Modal from '../components/Modal';
import { toast } from '../components/Toast';

const STATUS_BADGE = {
  Draft:'badge-gray', Sent:'badge-blue', Approved:'badge-green',
  Superseded:'badge-gray', Converted:'badge-green', Rejected:'badge-red'
};
const blankItem = { description:'', qty:1, rate:'', amount:'' };

export default function EstimatesPage({ navigate }) {
  const [estimates, setEstimates] = useState([]);
  const [jobs, setJobs]           = useState([]);
  const [loading, setLoading]     = useState(true);
  const [modal, setModal]         = useState(null); // 'add'|'edit'|'revise'|'convert'
  const [selected, setSelected]   = useState(null);
  const [saving, setSaving]       = useState(false);
  const [form, setForm]           = useState({ JobID:'', EstimateDate: today(), TaxRate:'0', Notes:'' });
  const [lineItems, setLineItems] = useState([{ ...blankItem }]);

  const load = () => {
    setLoading(true);
    Promise.all([api('getEstimates'), api('getJobs')]).then(([e, j]) => {
      if (e.status === 'ok') setEstimates(e.data.slice().reverse());
      if (j.status === 'ok') setJobs(j.data);
      setLoading(false);
    });
  };
  useEffect(() => { load(); }, []);

  const f = e => setForm(p => ({ ...p, [e.target.name]: e.target.value }));

  const updateItem = (i, field, val) => {
    setLineItems(items => items.map((item, idx) => {
      if (idx !== i) return item;
      const next = { ...item, [field]: val };
      next.amount = ((parseFloat(next.qty)||0) * (parseFloat(next.rate)||0)).toFixed(2);
      return next;
    }));
  };

  const subtotal = lineItems.reduce((s, i) => s + (parseFloat(i.amount)||0), 0);
  const taxAmt   = subtotal * (parseFloat(form.TaxRate)||0);
  const total    = subtotal + taxAmt;

  const openAdd = () => {
    setForm({ JobID:'', EstimateDate: today(), TaxRate:'0', Notes:'' });
    setLineItems([{ ...blankItem }]);
    setModal('add');
  };

  const openRevise = est => {
    setSelected(est);
    setForm({ EstimateID: est.EstimateID, TaxRate: est.TaxRate || '0', Notes:'' });
    try { setLineItems(JSON.parse(est.LineItems)); } catch { setLineItems([{ ...blankItem }]); }
    setModal('revise');
  };

  const openConvert = est => { setSelected(est); setForm({ EstimateID: est.EstimateID, DueDate:'', Notes:'' }); setModal('convert'); };

  const save = async () => {
    if (modal === 'add' && !form.JobID) return toast('Select a job', 'error');
    setSaving(true);
    let r;
    if (modal === 'add') {
      r = await api('addEstimate', {}, { ...form, LineItems: lineItems, Subtotal: subtotal.toFixed(2) });
    } else if (modal === 'revise') {
      r = await api('reviseEstimate', {}, { ...form, LineItems: lineItems, Subtotal: subtotal.toFixed(2) });
    } else if (modal === 'convert') {
      r = await api('convertToInvoice', {}, form);
    } else {
      r = await api('updateEstimate', {}, form);
    }
    if (r.status === 'ok') {
      toast(modal === 'convert' ? `Invoice ${r.data.InvoiceID} created! ✅` : 'Saved!');
      load(); setModal(null);
    } else toast(r.message, 'error');
    setSaving(false);
  };

  return (
    <div className="page">
      <button className="big-btn big-btn-green" onClick={openAdd} style={{ marginBottom: 14 }}>
        <span className="btn-icon">📋</span>
        <div className="btn-text">
          <span className="btn-label">New Estimate</span>
          <span className="btn-sub">Create a quote for a job</span>
        </div>
      </button>

      <div className="card">
        {loading ? <div className="card-body"><p className="text-muted">Loading…</p></div>
        : estimates.length === 0 ? <div className="empty"><div className="empty-icon">📋</div><p>No estimates yet.</p></div>
        : estimates.map(est => (
          <div key={est.EstimateID} className="list-item">
            <div className="list-item-main">
              <div className="list-item-title">{est.CustomerName || '—'}</div>
              <div className="list-item-sub">{est.EstimateID} · {est.EstimateDate} · {est.Version}</div>
            </div>
            <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:4 }}>
              <span style={{ fontWeight:800, color:'var(--green-dark)' }}>${parseFloat(est.Total||0).toFixed(2)}</span>
              <span className={`badge ${STATUS_BADGE[est.Status]||'badge-gray'}`}>{est.Status}</span>
            </div>
          </div>
        ))}
      </div>

      {/* View/action buttons per estimate */}
      {estimates.filter(e => ['Draft','Sent'].includes(e.Status)).length > 0 && (
        <>
          <div className="section-heading">Pending action</div>
          {estimates.filter(e => ['Draft','Sent'].includes(e.Status)).map(est => (
            <div key={est.EstimateID} className="card" style={{ marginBottom: 10 }}>
              <div className="card-header">
                <div>
                  <div style={{ fontWeight:700 }}>{est.CustomerName}</div>
                  <div className="text-muted">{est.EstimateID} · ${parseFloat(est.Total||0).toFixed(2)}</div>
                </div>
                <span className={`badge ${STATUS_BADGE[est.Status]||'badge-gray'}`}>{est.Status}</span>
              </div>
              <div className="card-body" style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                <button className="btn btn-outline btn-sm" onClick={() => openRevise(est)}>Revise</button>
                <button className="btn btn-primary btn-sm" onClick={() => openConvert(est)}>→ Invoice</button>
              </div>
            </div>
          ))}
        </>
      )}

      {/* Add / Revise modal */}
      {(modal === 'add' || modal === 'revise') && (
        <Modal
          title={modal === 'add' ? 'New Estimate' : `Revise ${selected?.EstimateID}`}
          onClose={() => setModal(null)} onSave={save} saving={saving}
        >
          {modal === 'add' && (
            <div className="form-group">
              <label>Job *</label>
              <select name="JobID" value={form.JobID} onChange={f}>
                <option value="">— Select job —</option>
                {jobs.map(j => <option key={j.JobID} value={j.JobID}>{j.CustomerName} — {j.Description?.slice(0,40)}</option>)}
              </select>
            </div>
          )}
          <div className="form-row">
            <div className="form-group">
              <label>Date</label>
              <input type="date" name="EstimateDate" value={form.EstimateDate} onChange={f} />
            </div>
            <div className="form-group">
              <label>Tax Rate</label>
              <select name="TaxRate" value={form.TaxRate} onChange={f}>
                <option value="0">0% (no tax)</option>
                <option value="0.07">7% Indiana</option>
              </select>
            </div>
          </div>

          {/* Line items */}
          <div style={{ fontWeight:700, fontSize:13, marginBottom:8 }}>Line Items</div>
          {lineItems.map((item, i) => (
            <div key={i} className="line-item-row">
              <input placeholder="Description" value={item.description} onChange={e => updateItem(i,'description',e.target.value)} />
              <input type="number" placeholder="Qty" value={item.qty} onChange={e => updateItem(i,'qty',e.target.value)} inputMode="numeric" />
              <input type="number" placeholder="Rate" value={item.rate} onChange={e => updateItem(i,'rate',e.target.value)} inputMode="decimal" />
              <div className="line-item-total">${parseFloat(item.amount||0).toFixed(2)}</div>
              <button onClick={() => setLineItems(items => items.filter((_,idx) => idx!==i))}
                style={{ background:'none', border:'none', color:'var(--red)', fontSize:20, cursor:'pointer' }}>×</button>
            </div>
          ))}
          <button className="btn btn-outline btn-sm" onClick={() => setLineItems(i => [...i, { ...blankItem }])}>+ Add line</button>

          {/* Totals */}
          <div className="totals-box">
            <div className="totals-row"><span>Subtotal</span><span>${subtotal.toFixed(2)}</span></div>
            <div className="totals-row"><span>Tax ({(parseFloat(form.TaxRate||0)*100).toFixed(0)}%)</span><span>${taxAmt.toFixed(2)}</span></div>
            <div className="totals-row total-final"><span>Total</span><span>${total.toFixed(2)}</span></div>
          </div>

          <div className="form-group mt-3"><label>Notes</label><textarea name="Notes" value={form.Notes} onChange={f} /></div>
        </Modal>
      )}

      {/* Convert to invoice modal */}
      {modal === 'convert' && (
        <Modal title="Convert to Invoice" onClose={() => setModal(null)} onSave={save} saving={saving} saveLabel="Create Invoice">
          <p style={{ fontSize:14, color:'var(--gray-700)', marginBottom:14 }}>
            Converting estimate <strong>{selected?.EstimateID}</strong> for <strong>{selected?.CustomerName}</strong> — <strong>${parseFloat(selected?.Total||0).toFixed(2)}</strong>
          </p>
          <div className="form-group">
            <label>Due Date (optional)</label>
            <input type="date" name="DueDate" value={form.DueDate} onChange={f} />
          </div>
          <div className="form-group"><label>Notes</label><textarea name="Notes" value={form.Notes} onChange={f} /></div>
        </Modal>
      )}
    </div>
  );
}

function today() { return new Date().toISOString().split('T')[0]; }
