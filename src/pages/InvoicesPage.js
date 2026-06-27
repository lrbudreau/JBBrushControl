import React, { useEffect, useState } from 'react';
import { api } from '../api';
import Modal from '../components/Modal';
import { toast } from '../components/Toast';

const STATUS_BADGE = { Draft:'badge-gray', Sent:'badge-blue', Paid:'badge-green', Overdue:'badge-red', Void:'badge-gray' };

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState([]);
  const [log, setLog]           = useState([]);
  const [loading, setLoading]   = useState(true);
  const [modal, setModal]       = useState(null);
  const [selected, setSelected] = useState(null);
  const [working, setWorking]   = useState(false);
  const [statusFilter, setStatus] = useState('All');

  const load = () => {
    setLoading(true);
    Promise.all([api('getInvoices'), api('getInvoiceLog')]).then(([inv, lg]) => {
      if (inv.status === 'ok') setInvoices(inv.data.slice().reverse());
      if (lg.status === 'ok')  setLog(lg.data);
      setLoading(false);
    });
  };
  useEffect(() => { load(); }, []);

  const handleEmail = async inv => {
    setWorking(inv.InvoiceID);
    const r = await api('getMailtoLink', {}, { InvoiceID: inv.InvoiceID });
    if (r.status === 'ok') {
      // Open mailto link
      window.location.href = r.data.mailtoLink;
      // After a short delay, ask if they sent it
      setTimeout(() => setModal({ type:'confirmSent', inv }), 1500);
    } else toast(r.message, 'error');
    setWorking(null);
  };

  const confirmSent = async () => {
    const r = await api('markSent', {}, { InvoiceID: modal.inv.InvoiceID });
    if (r.status === 'ok') { toast('Invoice marked as sent ✅'); load(); setModal(null); }
    else toast(r.message, 'error');
  };

  const markPaid = async inv => {
    const r = await api('markPaid', {}, { InvoiceID: inv.InvoiceID });
    if (r.status === 'ok') { toast('Invoice marked as paid ✅'); load(); }
    else toast(r.message, 'error');
  };

  const viewLog = inv => {
    setSelected(inv);
    setModal({ type:'log', inv });
  };

  const visible = invoices.filter(i => statusFilter === 'All' || i.Status === statusFilter);
  const outstanding = invoices.filter(i => ['Sent','Overdue'].includes(i.Status));
  const outTotal    = outstanding.reduce((s,i) => s+(parseFloat(i.Total)||0), 0);

  return (
    <div className="page">
      <div className="stats-row">
        <div className="stat amber">
          <div className="stat-label">Outstanding</div>
          <div className="stat-value">${outTotal.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</div>
          <div className="stat-sub">{outstanding.length} invoice(s)</div>
        </div>
        <div className="stat">
          <div className="stat-label">Total invoices</div>
          <div className="stat-value">{invoices.length}</div>
          <div className="stat-sub">{invoices.filter(i=>i.Status==='Paid').length} paid</div>
        </div>
      </div>

      {/* Status filter */}
      <div className="row" style={{ gap:8, marginBottom:12, flexWrap:'wrap' }}>
        {['All','Draft','Sent','Paid','Overdue'].map(s => (
          <button key={s} className={`btn btn-sm ${statusFilter===s?'btn-primary':'btn-outline'}`}
            onClick={() => setStatus(s)}>{s}</button>
        ))}
      </div>

      <div className="card">
        {loading ? <div className="card-body"><p className="text-muted">Loading…</p></div>
        : visible.length === 0 ? <div className="empty"><div className="empty-icon">🧾</div><p>No invoices found.</p></div>
        : visible.map(inv => (
          <div key={inv.InvoiceID}>
            <div className="list-item">
              <div className="list-item-main">
                <div className="list-item-title">{inv.CustomerName || '—'}</div>
                <div className="list-item-sub">{inv.InvoiceID} · {inv.IssueDate}</div>
              </div>
              <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:4 }}>
                <span style={{ fontWeight:800, color:'var(--green-dark)' }}>${parseFloat(inv.Total||0).toFixed(2)}</span>
                <span className={`badge ${STATUS_BADGE[inv.Status]||'badge-gray'}`}>{inv.Status}</span>
              </div>
            </div>
            {/* Action row */}
            <div style={{ display:'flex', gap:8, padding:'8px 16px 12px', flexWrap:'wrap' }}>
              <button className="btn btn-outline btn-sm" onClick={() => viewLog(inv)}>📋 Log</button>
              {inv.Status !== 'Paid' && inv.Status !== 'Void' && (
                <button className="btn btn-blue btn-sm"
                  style={{ background:'var(--blue)', color:'white' }}
                  onClick={() => handleEmail(inv)}
                  disabled={working === inv.InvoiceID}>
                  {working === inv.InvoiceID ? '…' : '✉️ Email'}
                </button>
              )}
              {['Sent','Overdue'].includes(inv.Status) && (
                <button className="btn btn-primary btn-sm" onClick={() => markPaid(inv)}>✅ Mark Paid</button>
              )}
            </div>
            <div className="divider" />
          </div>
        ))}
      </div>

      {/* Confirm sent modal */}
      {modal?.type === 'confirmSent' && (
        <Modal title="Did you send it?" onClose={() => setModal(null)} onSave={confirmSent} saveLabel="Yes, mark as sent">
          <p style={{ fontSize:14, color:'var(--gray-700)' }}>
            Your email app should have opened with invoice <strong>{modal.inv.InvoiceID}</strong> ready to send to <strong>{modal.inv.CustomerEmail}</strong>.
            <br/><br/>
            Once you've hit send in your email, tap below to log it.
          </p>
        </Modal>
      )}

      {/* Invoice log modal */}
      {modal?.type === 'log' && (
        <Modal title={`Log — ${modal.inv.InvoiceID}`} onClose={() => setModal(null)}>
          {log.filter(l => l.invoiceID === modal.inv.InvoiceID).length === 0
            ? <p className="text-muted">No events logged yet.</p>
            : log.filter(l => l.invoiceID === modal.inv.InvoiceID).map((l, i) => (
              <div key={i} className="list-item" style={{ padding:'10px 0' }}>
                <div className="list-item-main">
                  <div className="list-item-title">{l.Event}</div>
                  <div className="list-item-sub">{new Date(l.EventDate).toLocaleString()} {l.CustomerEmail ? `· ${l.CustomerEmail}` : ''}</div>
                </div>
                <span className={`badge ${l.Event==='Paid'?'badge-green':l.Event==='Sent'?'badge-blue':'badge-gray'}`}>{l.Event}</span>
              </div>
            ))
          }
        </Modal>
      )}
    </div>
  );
}
