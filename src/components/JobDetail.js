import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { toast } from './Toast';
import PhotoViewer from './PhotoViewer';
import { downloadInvoicePDF } from './InvoicePDF';

export default function JobDetail({ jobID, onBack }) {
  const [job, setJob]           = useState(null);
  const [estimates, setEstimates] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [settings, setSettings] = useState({});
  const [loading, setLoading]   = useState(true);
  const [showPhotos, setShowPhotos] = useState(false);
  const [modal, setModal]       = useState(null);
  const [saving, setSaving]     = useState(false);

  const [dueDate, setDueDate]   = useState('');
  const [paidModal, setPaidModal] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('');
  const [paymentNotes, setPaymentNotes]   = useState('');
  const [paidDate, setPaidDate]   = useState(today());

  const load = () => {
    setLoading(true);
    Promise.all([api('getJobs'), api('getEstimates'), api('getInvoices'), api('getSettings')])
      .then(([j, e, inv, s]) => {
        if (j.status === 'ok')   setJob(j.data.find(x => x.JobID === jobID) || null);
        if (e.status === 'ok')   setEstimates(e.data.filter(x => x.JobID === jobID));
        if (inv.status === 'ok') setInvoices(inv.data.filter(x => x.JobID === jobID));
        if (s.status === 'ok')   setSettings(s.data);
        setLoading(false);
      });
  };

  useEffect(() => { load(); }, [jobID]);

  const getFolderUrl = (notes) => {
    if (!notes) return null;
    const match = notes.match(/Photos: (https:\/\/drive\.google\.com\/[^\n]+)/);
    return match ? match[1] : null;
  };

  // Accept estimate → prompt for job date → schedule job
  const acceptEstimate = async (est) => {
    setSaving(true);
    const r = await api('acceptEstimate', {}, { EstimateID: est.EstimateID });
    if (r.status === 'ok') { toast('Estimate accepted — job scheduled! ✅'); load(); setModal(null); }
    else toast(r.message, 'error');
    setSaving(false);
  };

  // Reject estimate → cancel job
  const rejectEstimate = async (est) => {
    if (!window.confirm('Reject this estimate? The job will be marked as Canceled.')) return;
    setSaving(true);
    const r = await api('rejectEstimate', {}, { EstimateID: est.EstimateID });
    if (r.status === 'ok') { toast('Estimate rejected'); load(); }
    else toast(r.message, 'error');
    setSaving(false);
  };

  // Convert to invoice → job finished
  const convertToInvoice = async (est) => {
    setSaving(true);
    const r = await api('convertToInvoice', {}, { EstimateID: est.EstimateID, DueDate: dueDate });
    if (r.status === 'ok') { toast(`Invoice ${r.data.InvoiceID} created ✅`); load(); setModal(null); }
    else toast(r.message, 'error');
    setSaving(false);
  };

  // Mark paid with payment method
  const markPaid = async () => {
    if (!paidModal) return;
    setSaving(true);
    const r = await api('markPaid', {}, {
      InvoiceID: paidModal.InvoiceID,
      PaidDate: paidDate,
      PaymentMethod: paymentMethod,
      Notes: paymentNotes,
    });
    if (r.status === 'ok') { toast('Invoice marked as paid ✅'); load(); setPaidModal(null); setPaymentMethod(''); setPaymentNotes(''); }
    else toast(r.message, 'error');
    setSaving(false);
  };

  const emailInvoice = async (inv) => {
    setSaving(inv.InvoiceID);
    const r = await api('getMailtoLink', {}, { InvoiceID: inv.InvoiceID });
    if (r.status === 'ok') {
      window.location.href = r.data.mailtoLink;
      setTimeout(async () => {
        if (window.confirm(`Did you send the invoice email? Tap OK to mark as sent.`)) {
          await api('markSent', {}, { InvoiceID: inv.InvoiceID });
          toast('Marked as sent ✅');
          load();
        }
      }, 1500);
    } else toast(r.message, 'error');
    setSaving(null);
  };

  const printInvoice = (inv) => {
    downloadInvoicePDF({ ...inv, LineItems: inv.LineItems }, settings);
  };

  const parseLineItems = (raw) => { try { return JSON.parse(raw); } catch { return []; } };

  if (loading) return (
    <div style={S.wrap}>
      <div style={S.header}><button style={S.backBtn} onClick={onBack}>←</button><div style={S.headerTitle}>Job Details</div></div>
      <div style={{ padding:24, textAlign:'center', color:'#6b7280' }}>Loading…</div>
    </div>
  );

  if (!job) return (
    <div style={S.wrap}>
      <div style={S.header}><button style={S.backBtn} onClick={onBack}>←</button><div style={S.headerTitle}>Job Details</div></div>
      <div style={{ padding:24, textAlign:'center', color:'#6b7280' }}>Job not found.</div>
    </div>
  );

  const folderUrl      = getFolderUrl(job.Notes);
  const activeEstimate = estimates.find(e => ['Pending','Accepted'].includes(e.Status));
  const activeInvoice  = invoices.find(i => i.Status === 'Awaiting Payment');

  return (
    <div style={S.wrap}>
      <div style={S.header}>
        <button style={S.backBtn} onClick={onBack}>←</button>
        <div>
          <div style={S.headerTitle}>{job.CustomerName || 'Job'}</div>
          <div style={S.headerSub}>{job.JobDate || 'No date set'}</div>
        </div>
        <div style={{ marginLeft:'auto', display:'flex', flexDirection:'column', alignItems:'flex-end', gap:4 }}>
          <span style={statusPill(job.Status)}>{job.Status}</span>
          {job.Priority === 'Urgent' && (
            <span style={{ background:'#fee2e2', color:'#991b1b', padding:'2px 8px', borderRadius:99, fontSize:10, fontWeight:700 }}>🔴 URGENT</span>
          )}
        </div>
      </div>

      <div style={S.body}>
        {/* Job info */}
        <div style={S.card}>
          <div style={S.cardLabel}>Job Details</div>
          <div style={S.infoRow}><span style={S.infoKey}>Division</span>
            <span style={job.Division==='Spray'?S.spray:S.tree}>{job.Division}</span>
          </div>
          {job.JobDate && <div style={S.infoRow}><span style={S.infoKey}>Date</span><span>{job.JobDate}</span></div>}
          {job.Description && <div style={{ marginTop:8, fontSize:14, color:'#374151', lineHeight:1.5 }}>{job.Description}</div>}
        </div>

        {/* Photos button */}
        <button style={S.photoBtn} onClick={() => setShowPhotos(true)}>
          <span style={{ fontSize:20 }}>📸</span>
          <span style={{ fontWeight:600 }}>View Photos</span>
          {folderUrl && <span style={{ fontSize:11, color:'#6b7280', marginLeft:'auto' }}>Drive linked</span>}
        </button>

        {/* Estimates */}
        <div style={S.sectionLabel}>Estimates</div>
        {estimates.length === 0
          ? <div style={S.emptyCard}>No estimates for this job yet.</div>
          : estimates.map(est => {
            const items = parseLineItems(est.LineItems);
            return (
              <div key={est.EstimateID} style={S.card}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8 }}>
                  <div>
                    <div style={{ fontWeight:700, fontSize:15 }}>{est.EstimateID}</div>
                    <div style={{ fontSize:12, color:'#6b7280' }}>{est.EstimateDate} · {est.Version}</div>
                  </div>
                  <div style={{ textAlign:'right' }}>
                    <div style={{ fontWeight:800, fontSize:18, color:'#1a4a1a' }}>${parseFloat(est.Total||0).toFixed(2)}</div>
                    <span style={statusPill(est.Status)}>{est.Status}</span>
                  </div>
                </div>

                {items.map((item, i) => (
                  <div key={i} style={{ display:'flex', justifyContent:'space-between', fontSize:13, padding:'4px 0', borderBottom:'1px solid #f3f4f6' }}>
                    <span style={{ color:'#374151' }}>{item.description}</span>
                    <span style={{ fontWeight:600 }}>${parseFloat(item.amount||0).toFixed(2)}</span>
                  </div>
                ))}
                {parseFloat(est.TaxRate) > 0 && (
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, padding:'3px 0', color:'#6b7280' }}>
                    <span>Tax ({(parseFloat(est.TaxRate)*100).toFixed(0)}%)</span>
                    <span>${parseFloat(est.TaxAmount||0).toFixed(2)}</span>
                  </div>
                )}

                {/* Estimate actions */}
                {est.Status === 'Pending' && (
                  <div style={{ display:'flex', gap:8, marginTop:10, flexWrap:'wrap' }}>
                    <button style={{ ...S.actionBtn, background:'#2d6a2d', flex:1 }}
                      onClick={() => { setModal({ type:'accept', est }); setJobDate(today()); }}>
                      ✅ Accept
                    </button>
                    <button style={{ ...S.actionBtn, background:'#dc2626', flex:1 }}
                      onClick={() => rejectEstimate(est)}>
                      ✕ Reject
                    </button>
                  </div>
                )}
                {est.Status === 'Accepted' && !invoices.find(i => i.EstimateID === est.EstimateID) && (
                  <button style={{ ...S.actionBtn, background:'#1d6fa4', marginTop:10, width:'100%' }}
                    onClick={() => { setModal({ type:'convert', est }); setDueDate(''); }}>
                    → Create Invoice
                  </button>
                )}
                {est.Status === 'Invoice' && (
                  <div style={{ fontSize:12, color:'#2d6a2d', fontWeight:600, marginTop:8 }}>✅ Invoice created</div>
                )}
                {est.Status === 'Rejected' && (
                  <div style={{ fontSize:12, color:'#dc2626', fontWeight:600, marginTop:8 }}>✕ Rejected</div>
                )}
              </div>
            );
          })
        }

        {/* Invoices */}
        {invoices.length > 0 && (
          <>
            <div style={S.sectionLabel}>Invoices</div>
            {invoices.map(inv => (
              <div key={inv.InvoiceID} style={S.card}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
                  <div>
                    <div style={{ fontWeight:700, fontSize:15 }}>{inv.InvoiceID}</div>
                    <div style={{ fontSize:12, color:'#6b7280' }}>
                      Issued {inv.IssueDate}{inv.DueDate ? ` · Due ${inv.DueDate}` : ''}
                    </div>
                  </div>
                  <div style={{ textAlign:'right' }}>
                    <div style={{ fontWeight:800, fontSize:18, color:'#1a4a1a' }}>${parseFloat(inv.Total||0).toFixed(2)}</div>
                    <span style={statusPill(inv.Status)}>{inv.Status}</span>
                  </div>
                </div>

                <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                  <button style={{ ...S.actionBtn, background:'#374151', flex:1 }} onClick={() => printInvoice(inv)}>
                    🖨 Save PDF
                  </button>
                  {inv.Status !== 'Paid' && (
                    <button style={{ ...S.actionBtn, background:'#1d6fa4', flex:1 }} onClick={() => emailInvoice(inv)}
                      disabled={saving === inv.InvoiceID}>
                      ✉️ Email
                    </button>
                  )}
                  {inv.Status === 'Awaiting Payment' && (
                    <button style={{ ...S.actionBtn, background:'#2d6a2d', flex:1 }}
                      onClick={() => { setPaidModal(inv); setPaidDate(today()); setPaymentMethod(''); setPaymentNotes(''); }}>
                      💵 Mark Paid
                    </button>
                  )}
                  {inv.Status === 'Paid' && (
                    <div style={{ fontSize:13, color:'#2d6a2d', fontWeight:700, padding:'8px 0' }}>
                      ✅ Paid {inv.PaidDate ? `on ${inv.PaidDate}` : ''} {inv.PaymentMethod ? `· ${inv.PaymentMethod}` : ''}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Accept estimate modal - simple confirm */}
      {modal?.type === 'accept' && (
        <div style={S.modalOverlay} onClick={e => e.target===e.currentTarget && setModal(null)}>
          <div style={S.modalSheet}>
            <div style={S.modalHandle}/>
            <div style={S.modalHeader}>
              <h3 style={{ fontSize:17, fontWeight:700 }}>Accept Estimate</h3>
              <button style={S.closeBtn} onClick={() => setModal(null)}>✕</button>
            </div>
            <div style={{ padding:16 }}>
              <div style={{ background:'#e8f5e8', borderRadius:8, padding:'14px 16px', marginBottom:14 }}>
                <div style={{ fontWeight:700, fontSize:15 }}>{modal.est.EstimateID}</div>
                <div style={{ fontSize:18, fontWeight:800, color:'#1a4a1a', marginTop:4 }}>${parseFloat(modal.est.Total||0).toFixed(2)}</div>
              </div>
              <div style={{ fontSize:14, color:'#374151', lineHeight:1.6 }}>
                Accepting this estimate will move the job to <strong>Scheduled</strong> status.
              </div>
            </div>
            <div style={S.modalFooter}>
              <button style={S.cancelBtn} onClick={() => setModal(null)}>Cancel</button>
              <button style={{ ...S.confirmBtn, background:'#2d6a2d' }} onClick={() => acceptEstimate(modal.est)} disabled={saving}>
                {saving ? 'Saving…' : '✅ Accept'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Convert to invoice modal */}
      {modal?.type === 'convert' && (
        <div style={S.modalOverlay} onClick={e => e.target===e.currentTarget && setModal(null)}>
          <div style={S.modalSheet}>
            <div style={S.modalHandle}/>
            <div style={S.modalHeader}>
              <h3 style={{ fontSize:17, fontWeight:700 }}>Create Invoice</h3>
              <button style={S.closeBtn} onClick={() => setModal(null)}>✕</button>
            </div>
            <div style={{ padding:16 }}>
              <div style={{ background:'#e8f5e8', borderRadius:8, padding:'12px 14px', marginBottom:16 }}>
                <div style={{ fontWeight:700 }}>{modal.est.EstimateID}</div>
                <div style={{ fontSize:13 }}>Total: <strong>${parseFloat(modal.est.Total||0).toFixed(2)}</strong></div>
              </div>
              <div style={S.label}>Due Date (optional)</div>
              <input type="date" style={S.input} value={dueDate} onChange={e => setDueDate(e.target.value)} />
              <div style={{ fontSize:12, color:'#6b7280', marginTop:8 }}>
                This will create an invoice and mark the job as Finished.
              </div>
            </div>
            <div style={S.modalFooter}>
              <button style={S.cancelBtn} onClick={() => setModal(null)}>Cancel</button>
              <button style={S.confirmBtn} onClick={() => convertToInvoice(modal.est)} disabled={saving}>
                {saving ? 'Creating…' : '→ Create Invoice'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mark paid modal */}
      {paidModal && (
        <div style={S.modalOverlay} onClick={e => e.target===e.currentTarget && setPaidModal(null)}>
          <div style={S.modalSheet}>
            <div style={S.modalHandle}/>
            <div style={S.modalHeader}>
              <h3 style={{ fontSize:17, fontWeight:700 }}>Mark as Paid</h3>
              <button style={S.closeBtn} onClick={() => setPaidModal(null)}>✕</button>
            </div>
            <div style={{ padding:16 }}>
              <div style={{ background:'#e8f5e8', borderRadius:8, padding:'12px 14px', marginBottom:16 }}>
                <div style={{ fontWeight:700 }}>{paidModal.InvoiceID}</div>
                <div style={{ fontSize:15, fontWeight:800, color:'#1a4a1a' }}>${parseFloat(paidModal.Total||0).toFixed(2)}</div>
              </div>
              <div style={S.label}>Payment Method</div>
              <select style={S.input} value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
                <option value="">— Select —</option>
                <option>Cash</option>
                <option>Check</option>
                <option>Venmo</option>
                <option>Zelle</option>
                <option>Credit Card</option>
                <option>Other</option>
              </select>
              <div style={S.label}>Date Paid</div>
              <input type="date" style={S.input} value={paidDate} onChange={e => setPaidDate(e.target.value)} />
              <div style={S.label}>Notes (optional)</div>
              <input style={S.input} placeholder="e.g. Check #1234" value={paymentNotes} onChange={e => setPaymentNotes(e.target.value)} />
            </div>
            <div style={S.modalFooter}>
              <button style={S.cancelBtn} onClick={() => setPaidModal(null)}>Cancel</button>
              <button style={{ ...S.confirmBtn, background:'#2d6a2d' }} onClick={markPaid} disabled={saving}>
                {saving ? 'Saving…' : '💵 Confirm Payment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showPhotos && (
        <PhotoViewer jobID={jobID} folderUrl={folderUrl} onClose={() => setShowPhotos(false)} />
      )}
    </div>
  );
}

    });
  }, [currentJobID]);

  // Build calendar days for current view month
  const { year, month } = viewMonth;
  const firstDay  = new Date(year, month, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today     = new Date().toISOString().split('T')[0];

  // Build indexed jobs map
  const jobsByDate = {};
  jobs.forEach(j => {
    if (!jobsByDate[j.JobDate]) jobsByDate[j.JobDate] = [];
    jobsByDate[j.JobDate].push(j);
  });

  const prevMonth = () => setViewMonth(v => {
    const d = new Date(v.year, v.month - 1, 1);
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const nextMonth = () => setViewMonth(v => {
    const d = new Date(v.year, v.month + 1, 1);
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  const monthName = new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  // Selected date jobs
  const selJobs = selectedDate ? (jobsByDate[selectedDate] || []) : [];

  return (
    <div style={{ marginTop:14 }}>
      <div style={{ fontSize:11, fontWeight:700, color:'#6b7280', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8 }}>
        Schedule Availability
      </div>

      {/* Month nav */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
        <button onClick={prevMonth} style={{ background:'none', border:'1px solid #e5e7eb', borderRadius:6, padding:'4px 10px', cursor:'pointer', fontSize:14 }}>‹</button>
        <span style={{ fontWeight:700, fontSize:14 }}>{monthName}</span>
        <button onClick={nextMonth} style={{ background:'none', border:'1px solid #e5e7eb', borderRadius:6, padding:'4px 10px', cursor:'pointer', fontSize:14 }}>›</button>
      </div>

      {/* Day headers */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:2, marginBottom:2 }}>
        {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (
          <div key={d} style={{ textAlign:'center', fontSize:10, fontWeight:700, color:'#9ca3af', padding:'2px 0' }}>{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:2 }}>
        {/* Empty cells before first day */}
        {Array(firstDay).fill(null).map((_, i) => <div key={'e'+i} />)}
        {/* Day cells */}
        {Array(daysInMonth).fill(null).map((_, i) => {
          const day     = i + 1;
          const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
          const dayJobs = jobsByDate[dateStr] || [];
          const isSelected  = dateStr === selectedDate;
          const isInRange   = endDate && endDate > selectedDate && dateStr > selectedDate && dateStr <= endDate;
          const isRangeEnd  = dateStr === endDate;
          const isToday    = dateStr === today;
          const isPast     = dateStr < today;
          const hasUrgent  = dayJobs.some(j => j.Priority === 'Urgent');

          return (
            <div key={day} onClick={() => !isPast && onSelectDate && onSelectDate(dateStr)}
              style={{
                borderRadius:6, padding:'4px 2px', minHeight:34, cursor: isPast ? 'default' : 'pointer',
                background: isSelected ? '#1a4a1a' : isRangeEnd ? '#2d6a2d' : isInRange ? '#e8f5e8' : dayJobs.length > 0 ? '#fff3cd' : 'white',
                border: isToday ? '2px solid #1a4a1a' : isSelected || isRangeEnd ? '2px solid #1a4a1a' : isInRange ? '1px solid #4a9e4a' : '1px solid #e5e7eb',
                opacity: isPast ? 0.4 : 1,
                display:'flex', flexDirection:'column', alignItems:'center',
              }}>
              <span style={{ fontSize:12, fontWeight: isSelected||isRangeEnd||isToday ? 700 : 400, color: isSelected||isRangeEnd ? 'white' : '#111827' }}>{day}</span>
              {dayJobs.length > 0 && !isSelected && (
                <span style={{ fontSize:9, background: hasUrgent?'#dc2626':'#d97706', color:'white', borderRadius:99, padding:'1px 4px', marginTop:1, lineHeight:1.4 }}>
                  {dayJobs.length}{hasUrgent?' 🔴':''}
                </span>
              )}
              {isSelected && dayJobs.length > 0 && (
                <span style={{ fontSize:9, background:'rgba(255,255,255,0.3)', color:'white', borderRadius:99, padding:'1px 4px', marginTop:1 }}>
                  {dayJobs.length} booked
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div style={{ display:'flex', gap:12, marginTop:8, fontSize:11, color:'#6b7280', flexWrap:'wrap' }}>
        <span>🟡 Booked</span>
        <span style={{ color:'#1a4a1a', fontWeight:700 }}>■ Start</span>
        <span style={{ color:'#2d6a2d', fontWeight:700 }}>■ End</span>
        <span style={{ color:'#4a9e4a', fontWeight:700 }}>■ Range</span>
        <span>🔴 Urgent</span>
      </div>

      {/* Jobs on selected date */}
      {selectedDate && (
        <div style={{ marginTop:10 }}>
          {selJobs.length === 0 ? (
            <div style={{ background:'#f0fdf4', borderRadius:8, padding:'8px 12px', fontSize:12, color:'#166534', fontWeight:600 }}>
              ✅ Nothing else scheduled on this date
            </div>
          ) : (
            <div style={{ background:'#fff3cd', borderRadius:8, padding:'10px 12px' }}>
              <div style={{ fontSize:11, fontWeight:700, color:'#92400e', marginBottom:6 }}>
                ⚠️ {selJobs.length} job{selJobs.length>1?'s':''} already scheduled this day:
              </div>
              {selJobs.map(j => (
                <div key={j.JobID} style={{ fontSize:12, color:'#374151', padding:'3px 0', borderBottom:'1px solid rgba(0,0,0,0.06)' }}>
                  🔧 {j.CustomerName} — {j.Description?.slice(0,40)}
                  {j.Priority==='Urgent' && <span style={{ color:'#dc2626', fontWeight:700 }}> 🔴 URGENT</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function today() { return new Date().toISOString().split('T')[0]; }

function statusPill(status) {
  const map = {
    Estimate:         { bg:'#dbeafe', color:'#1e40af' },
    Scheduled:        { bg:'#fef3c7', color:'#92400e' },
    Finished:         { bg:'#dcfce7', color:'#166534' },
    Canceled:         { bg:'#fee2e2', color:'#991b1b' },
    Pending:          { bg:'#dbeafe', color:'#1e40af' },
    Accepted:         { bg:'#dcfce7', color:'#166534' },
    Rejected:         { bg:'#fee2e2', color:'#991b1b' },
    Invoice:          { bg:'#dcfce7', color:'#166534' },
    Superseded:       { bg:'#f3f4f6', color:'#6b7280' },
    'Awaiting Payment':{ bg:'#fef3c7', color:'#92400e' },
    Paid:             { bg:'#dcfce7', color:'#166534' },
  };
  const c = map[status] || { bg:'#f3f4f6', color:'#6b7280' };
  return { background:c.bg, color:c.color, padding:'2px 8px', borderRadius:99, fontSize:11, fontWeight:700, whiteSpace:'nowrap' };
}

const S = {
  wrap:        { position:'fixed', inset:0, background:'#f0f4f0', zIndex:200, display:'flex', flexDirection:'column', maxWidth:480, margin:'0 auto', overflowY:'auto' },
  header:      { background:'#1a4a1a', color:'white', padding:'14px 16px', display:'flex', alignItems:'center', gap:12, flexShrink:0 },
  backBtn:     { background:'rgba(255,255,255,0.15)', border:'none', color:'white', width:36, height:36, borderRadius:8, fontSize:18, cursor:'pointer', flexShrink:0 },
  headerTitle: { fontSize:16, fontWeight:700, color:'white' },
  headerSub:   { fontSize:11, color:'rgba(255,255,255,0.6)' },
  body:        { padding:14, flex:1 },
  card:        { background:'white', borderRadius:10, padding:'14px 16px', marginBottom:10, boxShadow:'0 1px 3px rgba(0,0,0,0.08)' },
  cardLabel:   { fontSize:11, fontWeight:700, color:'#6b7280', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:8 },
  infoRow:     { display:'flex', justifyContent:'space-between', alignItems:'center', padding:'4px 0', fontSize:14, borderBottom:'1px solid #f3f4f6' },
  infoKey:     { color:'#6b7280', fontSize:13 },
  spray:       { background:'#dcfce7', color:'#166534', padding:'2px 8px', borderRadius:99, fontSize:11, fontWeight:700 },
  tree:        { background:'#fef9c3', color:'#854d0e', padding:'2px 8px', borderRadius:99, fontSize:11, fontWeight:700 },
  sectionLabel:{ fontSize:11, fontWeight:700, color:'#6b7280', textTransform:'uppercase', letterSpacing:'0.05em', margin:'14px 0 6px' },
  emptyCard:   { background:'white', borderRadius:10, padding:16, textAlign:'center', color:'#9ca3af', fontSize:13, marginBottom:10 },
  photoBtn:    { display:'flex', alignItems:'center', gap:10, width:'100%', padding:'12px 16px', background:'white', borderRadius:10, border:'none', cursor:'pointer', marginBottom:10, boxShadow:'0 1px 3px rgba(0,0,0,0.08)', fontSize:14 },
  actionBtn:   { padding:'10px 14px', borderRadius:8, border:'none', color:'white', fontWeight:700, fontSize:13, cursor:'pointer' },
  modalOverlay:{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:300, display:'flex', alignItems:'flex-end' },
  modalSheet:  { background:'white', borderRadius:'20px 20px 0 0', width:'100%', maxWidth:480, margin:'0 auto', animation:'slideUp 0.25s ease' },
  modalHandle: { width:40, height:4, background:'#d1d5db', borderRadius:99, margin:'10px auto 0' },
  modalHeader: { padding:'12px 18px', display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:'1px solid #f3f4f6' },
  modalFooter: { padding:'12px 18px 24px', display:'flex', gap:10 },
  closeBtn:    { background:'none', border:'none', fontSize:18, cursor:'pointer', color:'#6b7280' },
  label:       { fontSize:13, fontWeight:600, color:'#374151', marginBottom:5, marginTop:12 },
  input:       { width:'100%', height:50, padding:'12px 14px', border:'2px solid #d1d5db', borderRadius:8, fontSize:16, fontFamily:'inherit' },
  cancelBtn:   { flex:1, padding:12, borderRadius:8, border:'2px solid #d1d5db', background:'white', color:'#374151', fontWeight:600, cursor:'pointer', fontSize:14 },
  confirmBtn:  { flex:2, padding:12, borderRadius:8, border:'none', background:'#1a4a1a', color:'white', fontWeight:700, cursor:'pointer', fontSize:14 },
};
