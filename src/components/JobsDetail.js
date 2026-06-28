import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { toast } from './Toast';
import PhotoViewer from './PhotoViewer';

export default function JobDetail({ jobID, onBack }) {
  const [job, setJob]           = useState(null);
  const [customer, setCustomer] = useState(null);
  const [estimates, setEstimates] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [showPhotos, setShowPhotos] = useState(false);
  const [modal, setModal]       = useState(null); // 'revise' | 'convert' | 'invoice'
  const [selected, setSelected] = useState(null);
  const [saving, setSaving]     = useState(false);
  const [dueDate, setDueDate]   = useState('');

  const load = () => {
    setLoading(true);
    Promise.all([
      api('getJobs'),
      api('getEstimates'),
      api('getInvoices'),
    ]).then(([j, e, inv]) => {
      if (j.status === 'ok') {
        const found = j.data.find(x => x.JobID === jobID);
        setJob(found || null);
      }
      if (e.status === 'ok') setEstimates(e.data.filter(x => x.JobID === jobID));
      if (inv.status === 'ok') setInvoices(inv.data.filter(x => x.JobID === jobID));
      setLoading(false);
    });
  };

  useEffect(() => { load(); }, [jobID]);

  const getFolderUrl = (notes) => {
    if (!notes) return null;
    const match = notes.match(/Photos: (https:\/\/drive\.google\.com\/[^\n]+)/);
    return match ? match[1] : null;
  };

  const convertToInvoice = async () => {
    if (!selected) return;
    setSaving(true);
    const r = await api('convertToInvoice', {}, {
      EstimateID: selected.EstimateID,
      DueDate: dueDate,
    });
    if (r.status === 'ok') {
      toast(`Invoice ${r.data.InvoiceID} created ✅`);
      load();
      setModal(null);
    } else toast(r.message, 'error');
    setSaving(false);
  };

  const markSent = async (inv) => {
    setSaving(true);
    const r = await api('getMailtoLink', {}, { InvoiceID: inv.InvoiceID });
    if (r.status === 'ok') {
      window.location.href = r.data.mailtoLink;
      setTimeout(async () => {
        const confirm = window.confirm(`Did you send the email for invoice ${inv.InvoiceID}? Tap OK to mark as sent.`);
        if (confirm) {
          await api('markSent', {}, { InvoiceID: inv.InvoiceID });
          toast('Marked as sent ✅');
          load();
        }
      }, 1500);
    } else toast(r.message, 'error');
    setSaving(false);
  };

  const markPaid = async (inv) => {
    const r = await api('markPaid', {}, { InvoiceID: inv.InvoiceID });
    if (r.status === 'ok') { toast('Invoice marked as paid ✅'); load(); }
    else toast(r.message, 'error');
  };

  const STATUS_COLOR = {
    Scheduled: '#d97706', 'In Progress': '#2d6a2d',
    Complete: '#6b7280', Quoted: '#1d6fa4', Invoiced: '#6b7280'
  };

  const parseLineItems = (raw) => {
    try { return JSON.parse(raw); } catch { return []; }
  };

  if (loading) return (
    <div style={S.wrap}>
      <div style={S.header}>
        <button style={S.backBtn} onClick={onBack}>←</button>
        <div style={S.headerTitle}>Job Details</div>
      </div>
      <div style={{ padding: 24, textAlign: 'center', color: '#6b7280' }}>Loading…</div>
    </div>
  );

  if (!job) return (
    <div style={S.wrap}>
      <div style={S.header}>
        <button style={S.backBtn} onClick={onBack}>←</button>
        <div style={S.headerTitle}>Job Details</div>
      </div>
      <div style={{ padding: 24, textAlign: 'center', color: '#6b7280' }}>Job not found.</div>
    </div>
  );

  const folderUrl = getFolderUrl(job.Notes);
  const activeEstimate = estimates.find(e => ['Draft','Sent','Approved'].includes(e.Status));
  const convertedInvoice = invoices.find(i => i.EstimateID === activeEstimate?.EstimateID);

  return (
    <div style={S.wrap}>
      {/* Header */}
      <div style={S.header}>
        <button style={S.backBtn} onClick={onBack}>←</button>
        <div>
          <div style={S.headerTitle}>{job.CustomerName || 'Job'}</div>
          <div style={S.headerSub}>{job.JobDate}</div>
        </div>
        <span style={{
          marginLeft: 'auto', fontSize: 11, fontWeight: 700, padding: '3px 10px',
          borderRadius: 99, background: 'rgba(255,255,255,0.2)', color: 'white'
        }}>{job.Status}</span>
      </div>

      <div style={S.body}>

        {/* Job info card */}
        <div style={S.card}>
          <div style={S.cardLabel}>Job Details</div>
          <div style={S.infoRow}><span style={S.infoKey}>Division</span>
            <span style={job.Division==='Spray' ? S.spray : S.tree}>{job.Division}</span>
          </div>
          <div style={S.infoRow}><span style={S.infoKey}>Date</span><span>{job.JobDate}</span></div>
          <div style={S.infoRow}><span style={S.infoKey}>Status</span>
            <span style={{ color: STATUS_COLOR[job.Status] || '#6b7280', fontWeight: 700 }}>{job.Status}</span>
          </div>
          {job.Description && (
            <div style={{ marginTop: 8, fontSize: 14, color: '#374151', lineHeight: 1.5 }}>{job.Description}</div>
          )}
        </div>

        {/* Photos */}
        <button style={S.photoBtn} onClick={() => setShowPhotos(true)}>
          <span style={{ fontSize: 20 }}>📸</span>
          <span style={{ fontWeight: 600 }}>View Photos</span>
          {folderUrl && <span style={{ fontSize: 11, color: '#6b7280', marginLeft: 'auto' }}>Drive linked</span>}
        </button>

        {/* Estimates */}
        <div style={S.sectionLabel}>Estimates</div>
        {estimates.length === 0 ? (
          <div style={S.emptyCard}>No estimates yet for this job.</div>
        ) : estimates.map(est => {
          const items = parseLineItems(est.LineItems);
          return (
            <div key={est.EstimateID} style={S.card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{est.EstimateID}</div>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>{est.EstimateDate} · {est.Version}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 800, fontSize: 18, color: '#1a4a1a' }}>${parseFloat(est.Total||0).toFixed(2)}</div>
                  <span style={statusStyle(est.Status)}>{est.Status}</span>
                </div>
              </div>

              {/* Line items */}
              {items.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  {items.map((item, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '3px 0', borderBottom: '1px solid #f3f4f6' }}>
                      <span style={{ color: '#374151' }}>{item.description} {item.qty > 1 ? `×${item.qty}` : ''}</span>
                      <span style={{ fontWeight: 600 }}>${parseFloat(item.amount||0).toFixed(2)}</span>
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0', color: '#6b7280' }}>
                    <span>Tax ({(parseFloat(est.TaxRate||0)*100).toFixed(0)}%)</span>
                    <span>${parseFloat(est.TaxAmount||0).toFixed(2)}</span>
                  </div>
                </div>
              )}

              {/* Actions */}
              {['Draft','Sent','Approved'].includes(est.Status) && !convertedInvoice && (
                <button style={S.actionBtn} onClick={() => { setSelected(est); setModal('convert'); }}>
                  → Convert to Invoice
                </button>
              )}
              {est.Status === 'Converted' && (
                <div style={{ fontSize: 12, color: '#2d6a2d', fontWeight: 600 }}>✅ Converted to invoice</div>
              )}
            </div>
          );
        })}

        {/* Invoices */}
        {invoices.length > 0 && (
          <>
            <div style={S.sectionLabel}>Invoices</div>
            {invoices.map(inv => (
              <div key={inv.InvoiceID} style={S.card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{inv.InvoiceID}</div>
                    <div style={{ fontSize: 12, color: '#6b7280' }}>Issued {inv.IssueDate}{inv.DueDate ? ` · Due ${inv.DueDate}` : ''}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 800, fontSize: 18, color: '#1a4a1a' }}>${parseFloat(inv.Total||0).toFixed(2)}</div>
                    <span style={statusStyle(inv.Status)}>{inv.Status}</span>
                  </div>
                </div>

                {/* Invoice actions */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {inv.Status !== 'Paid' && inv.Status !== 'Void' && (
                    <button style={{ ...S.actionBtn, background: '#1d6fa4' }} onClick={() => markSent(inv)}>
                      ✉️ Email Invoice
                    </button>
                  )}
                  {['Sent','Overdue'].includes(inv.Status) && (
                    <button style={{ ...S.actionBtn, background: '#2d6a2d' }} onClick={() => markPaid(inv)}>
                      ✅ Mark Paid
                    </button>
                  )}
                  {inv.Status === 'Paid' && (
                    <div style={{ fontSize: 13, color: '#2d6a2d', fontWeight: 700 }}>
                      ✅ Paid {inv.PaidDate ? `on ${inv.PaidDate}` : ''}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </>
        )}

      </div>

      {/* Convert to invoice modal */}
      {modal === 'convert' && selected && (
        <div style={S.modalOverlay} onClick={e => e.target===e.currentTarget && setModal(null)}>
          <div style={S.modalSheet}>
            <div style={S.modalHandle} />
            <div style={S.modalHeader}>
              <h3 style={{ fontSize: 17, fontWeight: 700 }}>Convert to Invoice</h3>
              <button style={S.closeBtn} onClick={() => setModal(null)}>✕</button>
            </div>
            <div style={{ padding: 16 }}>
              <div style={{ background: '#e8f5e8', borderRadius: 8, padding: '12px 14px', marginBottom: 16 }}>
                <div style={{ fontWeight: 700 }}>{selected.EstimateID}</div>
                <div style={{ fontSize: 13, color: '#374151' }}>Total: ${parseFloat(selected.Total||0).toFixed(2)}</div>
              </div>
              <div style={S.label}>Due Date (optional)</div>
              <input type="date" style={S.input} value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </div>
            <div style={S.modalFooter}>
              <button style={S.cancelBtn} onClick={() => setModal(null)}>Cancel</button>
              <button style={S.confirmBtn} onClick={convertToInvoice} disabled={saving}>
                {saving ? 'Creating…' : 'Create Invoice →'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Photo viewer */}
      {showPhotos && (
        <PhotoViewer jobID={jobID} folderUrl={folderUrl} onClose={() => setShowPhotos(false)} />
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────
function statusStyle(status) {
  const colors = {
    Draft: { bg: '#f3f4f6', color: '#6b7280' },
    Sent:  { bg: '#dbeafe', color: '#1e40af' },
    Paid:  { bg: '#dcfce7', color: '#166534' },
    Overdue: { bg: '#fee2e2', color: '#991b1b' },
    Converted: { bg: '#dcfce7', color: '#166534' },
    Approved:  { bg: '#dcfce7', color: '#166534' },
    Superseded:{ bg: '#f3f4f6', color: '#6b7280' },
  };
  const c = colors[status] || { bg: '#f3f4f6', color: '#6b7280' };
  return { background: c.bg, color: c.color, padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 700 };
}

const S = {
  wrap:        { position: 'fixed', inset: 0, background: '#f0f4f0', zIndex: 200, display: 'flex', flexDirection: 'column', maxWidth: 480, margin: '0 auto', overflowY: 'auto' },
  header:      { background: '#1a4a1a', color: 'white', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 },
  backBtn:     { background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white', width: 36, height: 36, borderRadius: 8, fontSize: 18, cursor: 'pointer', flexShrink: 0 },
  headerTitle: { fontSize: 16, fontWeight: 700 },
  headerSub:   { fontSize: 11, color: 'rgba(255,255,255,0.6)' },
  body:        { padding: 14, flex: 1 },
  card:        { background: 'white', borderRadius: 10, padding: '14px 16px', marginBottom: 10, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' },
  cardLabel:   { fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 },
  infoRow:     { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', fontSize: 14, borderBottom: '1px solid #f3f4f6' },
  infoKey:     { color: '#6b7280', fontSize: 13 },
  spray:       { background: '#dcfce7', color: '#166534', padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 700 },
  tree:        { background: '#fef9c3', color: '#854d0e', padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 700 },
  sectionLabel:{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '14px 0 6px' },
  emptyCard:   { background: 'white', borderRadius: 10, padding: '16px', textAlign: 'center', color: '#9ca3af', fontSize: 13, marginBottom: 10 },
  photoBtn:    { display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '12px 16px', background: 'white', borderRadius: 10, border: 'none', cursor: 'pointer', marginBottom: 10, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', fontSize: 14 },
  actionBtn:   { flex: 1, padding: '10px 14px', borderRadius: 8, border: 'none', background: '#1a4a1a', color: 'white', fontWeight: 700, fontSize: 13, cursor: 'pointer' },
  modalOverlay:{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 300, display: 'flex', alignItems: 'flex-end' },
  modalSheet:  { background: 'white', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 480, margin: '0 auto', animation: 'slideUp 0.25s ease' },
  modalHandle: { width: 40, height: 4, background: '#d1d5db', borderRadius: 99, margin: '10px auto 0' },
  modalHeader: { padding: '12px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #f3f4f6' },
  modalFooter: { padding: '12px 18px 24px', display: 'flex', gap: 10 },
  closeBtn:    { background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#6b7280' },
  label:       { fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 5 },
  input:       { width: '100%', height: 50, padding: '12px 14px', border: '2px solid #d1d5db', borderRadius: 8, fontSize: 16, fontFamily: 'inherit' },
  cancelBtn:   { flex: 1, padding: '12px', borderRadius: 8, border: '2px solid #d1d5db', background: 'white', color: '#374151', fontWeight: 600, cursor: 'pointer', fontSize: 14 },
  confirmBtn:  { flex: 2, padding: '12px', borderRadius: 8, border: 'none', background: '#1a4a1a', color: 'white', fontWeight: 700, cursor: 'pointer', fontSize: 14 },
};
