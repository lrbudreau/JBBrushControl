import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { toast } from './Toast';

export default function NewEstimate({ onComplete, onCancel, prefillJobID = null }) {
  const [jobs, setJobs]       = useState([]);
  const [saving, setSaving]   = useState(false);
  const [form, setForm]       = useState({
    JobID: prefillJobID || '',
    EstimateDate: today(),
    TaxRate: '0',
    Notes: '',
  });
  const [lineItems, setLineItems] = useState([{ description: '', amount: '' }]);

  useEffect(() => {
    api('getJobs').then(r => { if (r.status === 'ok') setJobs(r.data); });
  }, []);

  const f = e => setForm(p => ({ ...p, [e.target.name]: e.target.value }));

  const updateItem = (i, field, val) => {
    setLineItems(items => items.map((item, idx) => idx !== i ? item : { ...item, [field]: val }));
  };

  const subtotal = lineItems.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
  const taxAmt   = subtotal * (parseFloat(form.TaxRate) || 0);
  const total    = subtotal + taxAmt;

  const save = async () => {
    if (!form.JobID) return toast('Select a job', 'error');
    const validItems = lineItems.filter(i => i.description);
    if (validItems.length === 0) return toast('Add at least one line item', 'error');

    setSaving(true);
    const r = await api('addEstimate', {}, {
      JobID:     form.JobID,
      LineItems: JSON.stringify(validItems),
      Subtotal:  subtotal.toFixed(2),
      TaxRate:   form.TaxRate,
      Notes:     form.Notes,
      EstimateDate: form.EstimateDate,
    });
    if (r.status === 'ok') {
      toast(`Estimate ${r.data.EstimateID} created ✅`);
      onComplete(r.data);
    } else toast(r.message, 'error');
    setSaving(false);
  };

  return (
    <div style={S.wrap}>
      <div style={S.header}>
        <button style={S.backBtn} onClick={onCancel}>←</button>
        <div style={S.headerTitle}>New Estimate</div>
      </div>

      <div style={S.body}>
        <div style={S.label}>Job *</div>
        <select style={S.input} name="JobID" value={form.JobID} onChange={f}>
          <option value="">— Select a job —</option>
          {jobs.map(j => (
            <option key={j.JobID} value={j.JobID}>
              {j.CustomerName} — {j.Description?.slice(0, 40)} ({j.JobDate})
            </option>
          ))}
        </select>

        <div style={S.label}>Date</div>
        <input type="date" style={S.input} name="EstimateDate" value={form.EstimateDate} onChange={f} />

        {/* Flat fee line items */}
        <div style={{ fontWeight: 700, fontSize: 14, color: '#1a4a1a', margin: '16px 0 8px' }}>
          Line Items
        </div>
        {lineItems.map((item, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
            <input
              style={{ ...S.input, flex: 2 }}
              placeholder="Description (e.g. Remove oak tree)"
              value={item.description}
              onChange={e => updateItem(i, 'description', e.target.value)}
            />
            <div style={{ position: 'relative', flex: 1 }}>
              <span style={S.dollarSign}>$</span>
              <input
                style={{ ...S.input, paddingLeft: 24 }}
                placeholder="0.00"
                type="number"
                inputMode="decimal"
                value={item.amount}
                onChange={e => updateItem(i, 'amount', e.target.value)}
              />
            </div>
            <button onClick={() => setLineItems(items => items.filter((_, idx) => idx !== i))}
              style={S.removeBtn}>×</button>
          </div>
        ))}

        <button style={S.addLineBtn} onClick={() => setLineItems(i => [...i, { description: '', amount: '' }])}>
          + Add line item
        </button>

        <div style={S.label}>Tax rate</div>
        <select style={S.input} name="TaxRate" value={form.TaxRate} onChange={f}>
          <option value="0">0% (no tax)</option>
          <option value="0.07">7% Indiana</option>
        </select>

        {/* Totals */}
        {subtotal > 0 && (
          <div style={S.totals}>
            <div style={S.totalsRow}><span>Subtotal</span><span>${subtotal.toFixed(2)}</span></div>
            {parseFloat(form.TaxRate) > 0 && (
              <div style={S.totalsRow}><span>Tax ({(parseFloat(form.TaxRate) * 100).toFixed(0)}%)</span><span>${taxAmt.toFixed(2)}</span></div>
            )}
            <div style={{ ...S.totalsRow, fontSize: 20, fontWeight: 800, color: '#1a4a1a', borderTop: '2px solid #d1d5db', paddingTop: 10, marginTop: 6 }}>
              <span>Total</span><span>${total.toFixed(2)}</span>
            </div>
          </div>
        )}

        <div style={S.label}>Notes</div>
        <textarea style={{ ...S.input, minHeight: 80 }} name="Notes" value={form.Notes} onChange={f} placeholder="Any notes…" />

        <button style={{ ...S.submitBtn, marginTop: 16, opacity: saving ? 0.6 : 1 }} onClick={save} disabled={saving}>
          {saving ? 'Saving…' : '✅ Create Estimate'}
        </button>
      </div>
    </div>
  );
}

function today() { return new Date().toISOString().split('T')[0]; }

const S = {
  wrap:       { position: 'fixed', inset: 0, background: '#f0f4f0', zIndex: 250, display: 'flex', flexDirection: 'column', maxWidth: 480, margin: '0 auto' },
  header:     { background: '#1a4a1a', color: 'white', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 },
  backBtn:    { background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white', width: 36, height: 36, borderRadius: 8, fontSize: 18, cursor: 'pointer' },
  headerTitle:{ fontSize: 16, fontWeight: 700, color: 'white' },
  body:       { flex: 1, overflowY: 'auto', padding: 16 },
  label:      { fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5, marginTop: 12 },
  input:      { width: '100%', minHeight: 50, padding: '12px 14px', border: '2px solid #d1d5db', borderRadius: 8, fontSize: 16, fontFamily: 'inherit', color: '#111827', background: 'white', display: 'block' },
  dollarSign: { position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#6b7280', fontSize: 16, pointerEvents: 'none' },
  removeBtn:  { background: 'none', border: 'none', color: '#dc2626', fontSize: 24, cursor: 'pointer', flexShrink: 0, padding: '0 4px' },
  addLineBtn: { display: 'block', width: '100%', padding: 12, border: '2px dashed #2d6a2d', borderRadius: 8, background: 'transparent', color: '#2d6a2d', fontSize: 14, fontWeight: 600, cursor: 'pointer', marginTop: 4 },
  totals:     { background: '#f3f4f6', borderRadius: 8, padding: 14, marginTop: 12 },
  totalsRow:  { display: 'flex', justifyContent: 'space-between', fontSize: 14, padding: '3px 0', color: '#374151' },
  submitBtn:  { width: '100%', padding: 16, borderRadius: 10, border: 'none', background: '#1a4a1a', color: 'white', fontSize: 16, fontWeight: 800, cursor: 'pointer' },
};
