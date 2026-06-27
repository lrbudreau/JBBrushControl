import React, { useState, useRef } from 'react';
import { api } from '../api';
import { lookupParcelByAddress, formatOwnerName } from '../hooks/useGIS';
import { getJobFolder, uploadPhoto, requestDriveAccess } from '../hooks/useDrive';
import { toast } from './Toast';

const STEPS = ['Address', 'Details', 'Estimate', 'Photos', 'Review'];

export default function NewJobFlow({ onComplete, onCancel }) {
  const [step, setStep]         = useState(0);
  const [saving, setSaving]     = useState(false);

  // GIS lookup
  const [addressInput, setAddressInput] = useState('');
  const [searching, setSearching]       = useState(false);
  const [parcels, setParcels]           = useState([]);
  const [selectedParcel, setSelected]   = useState(null);
  const [manualMode, setManual]         = useState(false);

  // Customer / job form
  const [customer, setCustomer] = useState({ Name:'', Phone:'', Email:'', Address:'', City:'', State:'IN', Zip:'', Division:'Spray' });
  const [job, setJob]           = useState({ Description:'', JobDate: today(), Division:'Spray', Notes:'' });

  // Estimate
  const [lineItems, setLineItems] = useState([{ description:'', qty:1, rate:'', amount:'' }]);
  const [taxRate, setTaxRate]     = useState('0');

  // Photos
  const [photos, setPhotos]       = useState([]); // { file, preview }
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef();

  // ── GIS Search ───────────────────────────────────────────

  const searchAddress = async () => {
    if (!addressInput.trim()) return;
    setSearching(true);
    setParcels([]);
    const results = await lookupParcelByAddress(addressInput);
    if (results.length === 0) {
      toast('No parcels found — enter details manually', 'info');
      prefillManual();
    } else {
      setParcels(results);
    }
    setSearching(false);
  };

  const prefillManual = () => {
    setCustomer(c => ({ ...c, Address: addressInput }));
    setManual(true);
    setParcels([]);
    setStep(1);
  };

  const selectParcel = (parcel) => {
    setSelected(parcel);
    setCustomer({
      Name:     formatOwnerName(parcel.ownerName),
      Phone:    '',
      Email:    '',
      Address:  parcel.address,
      City:     parcel.city,
      State:    parcel.state || 'IN',
      Zip:      parcel.zip,
      Division: 'Spray',
    });
    setParcels([]);
    setStep(1);
  };

  // ── Line items ───────────────────────────────────────────

  const updateItem = (i, field, val) => {
    setLineItems(items => items.map((item, idx) => {
      if (idx !== i) return item;
      const next = { ...item, [field]: val };
      next.amount = ((parseFloat(next.qty)||0) * (parseFloat(next.rate)||0)).toFixed(2);
      return next;
    }));
  };

  const subtotal = lineItems.reduce((s, i) => s + (parseFloat(i.amount)||0), 0);
  const taxAmt   = subtotal * (parseFloat(taxRate)||0);
  const total    = subtotal + taxAmt;

  // ── Photos ───────────────────────────────────────────────

  const handlePhotoSelect = (e) => {
    const files = Array.from(e.target.files);
    const newPhotos = files.map(file => ({
      file,
      preview: URL.createObjectURL(file),
      name: file.name,
    }));
    setPhotos(p => [...p, ...newPhotos]);
  };

  const removePhoto = (i) => {
    setPhotos(p => p.filter((_, idx) => idx !== i));
  };

  // ── Final submit ─────────────────────────────────────────

  const submit = async () => {
    setSaving(true);
    try {
      // 1. Add or find customer
      let customerID;
      const cusRes = await api('addCustomer', {}, { ...customer, Division: job.Division });
      if (cusRes.status === 'ok') {
        customerID = cusRes.data.CustomerID;
      } else {
        toast('Failed to save customer', 'error');
        setSaving(false); return;
      }

      // 2. Create job
      let jobID;
      const jobRes = await api('addJob', {}, {
        CustomerID:  customerID,
        Division:    job.Division,
        Description: job.Description,
        JobDate:     job.JobDate,
        Status:      'Scheduled',
        Notes:       job.Notes,
      });
      if (jobRes.status === 'ok') {
        jobID = jobRes.data.JobID;
      } else {
        toast('Failed to save job', 'error');
        setSaving(false); return;
      }

      // 3. Upload photos to Drive
      let folderUrl = '';
      if (photos.length > 0) {
        try {
          setUploading(true);
          await requestDriveAccess();
          const { folderId, folderUrl: fUrl } = await getJobFolder(jobID, customer.Name);
          folderUrl = fUrl;
          for (const photo of photos) {
            await uploadPhoto(photo.file, folderId);
          }
          // Update job with photo folder URL
          await api('updateJob', {}, { JobID: jobID, Notes: job.Notes + (job.Notes ? '\n' : '') + `Photos: ${folderUrl}` });
          setUploading(false);
        } catch (e) {
          toast('Photos skipped — Drive access needed', 'info');
          setUploading(false);
        }
      }

      // 4. Create estimate if line items filled in
      const hasItems = lineItems.some(i => i.description && i.rate);
      if (hasItems) {
        await api('addEstimate', {}, {
          JobID:     jobID,
          LineItems: lineItems,
          Subtotal:  subtotal.toFixed(2),
          TaxRate:   taxRate,
        });
      }

      toast(`Job created! ${photos.length > 0 ? `${photos.length} photo(s) uploaded.` : ''}`, 'success');
      onComplete({ jobID, customerID, folderUrl });

    } catch (e) {
      toast('Something went wrong: ' + e.message, 'error');
    }
    setSaving(false);
  };

  // ── Render steps ─────────────────────────────────────────

  return (
    <div style={styles.wrap}>
      {/* Header */}
      <div style={styles.header}>
        <button style={styles.backBtn} onClick={step === 0 ? onCancel : () => setStep(s => s - 1)}>
          {step === 0 ? '✕' : '←'}
        </button>
        <div>
          <div style={styles.headerTitle}>New Job</div>
          <div style={styles.headerSub}>Step {step + 1} of {STEPS.length} — {STEPS[step]}</div>
        </div>
        <div style={styles.stepDots}>
          {STEPS.map((_, i) => (
            <div key={i} style={{ ...styles.dot, background: i <= step ? '#4ade80' : 'rgba(255,255,255,0.3)' }} />
          ))}
        </div>
      </div>

      <div style={styles.body}>

        {/* ── STEP 0: Address lookup ── */}
        {step === 0 && (
          <div>
            <div style={styles.stepTitle}>📍 Job site address</div>
            <div style={styles.stepSub}>Type the address to look up the property owner automatically.</div>

            <div style={{ display:'flex', gap:8, marginBottom:16 }}>
              <input
                style={styles.input}
                value={addressInput}
                onChange={e => setAddressInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && searchAddress()}
                placeholder="123 Main St, Benton County"
                autoComplete="off"
              />
              <button style={styles.searchBtn} onClick={searchAddress} disabled={searching}>
                {searching ? '…' : '🔍'}
              </button>
            </div>

            {/* Parcel results */}
            {parcels.length > 0 && (
              <div style={styles.parcelList}>
                <div style={styles.parcelHint}>Select the matching property:</div>
                {parcels.map((p, i) => (
                  <button key={i} style={styles.parcelRow} onClick={() => selectParcel(p)}>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{formatOwnerName(p.ownerName)}</div>
                    <div style={{ fontSize: 13, color: '#6b7280' }}>{p.address}, {p.city} {p.zip}</div>
                    <div style={{ fontSize: 11, color: '#9ca3af' }}>{p.county} County · Parcel {p.parcelNo}</div>
                  </button>
                ))}
                <button style={styles.manualBtn} onClick={prefillManual}>
                  None of these — enter manually
                </button>
              </div>
            )}

            <button style={styles.manualBtn} onClick={prefillManual}>
              Skip lookup — enter manually
            </button>
          </div>
        )}

        {/* ── STEP 1: Customer + job details ── */}
        {step === 1 && (
          <div>
            <div style={styles.stepTitle}>👤 Customer & Job</div>
            {selectedParcel && (
              <div style={styles.parcelConfirm}>
                ✅ Property owner: <strong>{formatOwnerName(selectedParcel.ownerName)}</strong><br/>
                <span style={{ fontSize:12, color:'#6b7280' }}>{selectedParcel.address}, {selectedParcel.city}</span>
              </div>
            )}

            <div style={styles.label}>Customer name *</div>
            <input style={styles.input} value={customer.Name} onChange={e => setCustomer(c => ({...c, Name: e.target.value}))} placeholder="Full name" />

            <div style={styles.row}>
              <div style={{ flex:1 }}>
                <div style={styles.label}>Phone</div>
                <input style={styles.input} value={customer.Phone} onChange={e => setCustomer(c => ({...c, Phone: e.target.value}))} inputMode="tel" placeholder="(555) 555-5555" />
              </div>
              <div style={{ flex:1 }}>
                <div style={styles.label}>Division</div>
                <select style={styles.input} value={job.Division} onChange={e => { setJob(j => ({...j, Division: e.target.value})); setCustomer(c => ({...c, Division: e.target.value})); }}>
                  <option>Spray</option>
                  <option>Tree</option>
                </select>
              </div>
            </div>

            <div style={styles.label}>Email</div>
            <input style={styles.input} value={customer.Email} onChange={e => setCustomer(c => ({...c, Email: e.target.value}))} inputMode="email" placeholder="email@example.com" />

            <div style={styles.label}>Address</div>
            <input style={styles.input} value={customer.Address} onChange={e => setCustomer(c => ({...c, Address: e.target.value}))} />

            <div style={styles.row}>
              <div style={{ flex:2 }}>
                <div style={styles.label}>City</div>
                <input style={styles.input} value={customer.City} onChange={e => setCustomer(c => ({...c, City: e.target.value}))} />
              </div>
              <div style={{ flex:1 }}>
                <div style={styles.label}>Zip</div>
                <input style={styles.input} value={customer.Zip} onChange={e => setCustomer(c => ({...c, Zip: e.target.value}))} inputMode="numeric" />
              </div>
            </div>

            <div style={styles.label}>Job description *</div>
            <textarea style={{ ...styles.input, minHeight:80, resize:'vertical' }} value={job.Description} onChange={e => setJob(j => ({...j, Description: e.target.value}))} placeholder="Describe the work to be done…" />

            <div style={styles.label}>Job date</div>
            <input type="date" style={styles.input} value={job.JobDate} onChange={e => setJob(j => ({...j, JobDate: e.target.value}))} />
          </div>
        )}

        {/* ── STEP 2: Estimate ── */}
        {step === 2 && (
          <div>
            <div style={styles.stepTitle}>💰 Estimate</div>
            <div style={styles.stepSub}>Add line items for this job. You can skip this and add it later.</div>

            {lineItems.map((item, i) => (
              <div key={i} style={{ marginBottom: 10 }}>
                <input style={styles.input} placeholder="Description (e.g. Remove oak tree)" value={item.description} onChange={e => updateItem(i,'description',e.target.value)} />
                <div style={styles.row}>
                  <div style={{ flex:1 }}>
                    <input style={styles.input} placeholder="Qty" type="number" value={item.qty} onChange={e => updateItem(i,'qty',e.target.value)} inputMode="numeric" />
                  </div>
                  <div style={{ flex:1 }}>
                    <input style={styles.input} placeholder="Rate $" type="number" value={item.rate} onChange={e => updateItem(i,'rate',e.target.value)} inputMode="decimal" />
                  </div>
                  <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                    <div style={{ fontWeight:700, color:'#1a4a1a', padding:'0 8px' }}>${parseFloat(item.amount||0).toFixed(2)}</div>
                    <button onClick={() => setLineItems(items => items.filter((_,idx)=>idx!==i))}
                      style={{ background:'none', border:'none', color:'#dc2626', fontSize:20, cursor:'pointer' }}>×</button>
                  </div>
                </div>
              </div>
            ))}

            <button style={styles.addLineBtn} onClick={() => setLineItems(i => [...i, { description:'', qty:1, rate:'', amount:'' }])}>
              + Add line item
            </button>

            <div style={styles.label}>Tax rate</div>
            <select style={styles.input} value={taxRate} onChange={e => setTaxRate(e.target.value)}>
              <option value="0">0% (no tax)</option>
              <option value="0.07">7% Indiana</option>
            </select>

            {/* Totals */}
            {subtotal > 0 && (
              <div style={styles.totalsBox}>
                <div style={styles.totalsRow}><span>Subtotal</span><span>${subtotal.toFixed(2)}</span></div>
                <div style={styles.totalsRow}><span>Tax</span><span>${taxAmt.toFixed(2)}</span></div>
                <div style={{ ...styles.totalsRow, fontSize:18, fontWeight:800, color:'#1a4a1a', borderTop:'2px solid #d1d5db', paddingTop:10, marginTop:6 }}>
                  <span>Total</span><span>${total.toFixed(2)}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── STEP 3: Photos ── */}
        {step === 3 && (
          <div>
            <div style={styles.stepTitle}>📸 Photos</div>
            <div style={styles.stepSub}>Take photos of the job site. They'll be saved to Google Drive linked to this job.</div>

            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              capture="environment"
              style={{ display:'none' }}
              onChange={handlePhotoSelect}
            />

            <button style={styles.photoBtn} onClick={() => fileRef.current.click()}>
              📷 Take / Add Photos
            </button>

            {photos.length > 0 && (
              <div style={styles.photoGrid}>
                {photos.map((p, i) => (
                  <div key={i} style={styles.photoThumb}>
                    <img src={p.preview} alt="" style={{ width:'100%', height:'100%', objectFit:'cover', borderRadius:8 }} />
                    <button style={styles.removePhoto} onClick={() => removePhoto(i)}>×</button>
                  </div>
                ))}
              </div>
            )}

            {photos.length === 0 && (
              <div style={{ textAlign:'center', padding:'32px 0', color:'#9ca3af' }}>
                <div style={{ fontSize:40 }}>📷</div>
                <div>No photos yet — tap above to add some</div>
              </div>
            )}

            <div style={{ fontSize:12, color:'#9ca3af', marginTop:16, textAlign:'center' }}>
              Photos upload to Google Drive and link to this job automatically.
            </div>
          </div>
        )}

        {/* ── STEP 4: Review ── */}
        {step === 4 && (
          <div>
            <div style={styles.stepTitle}>✅ Review & Submit</div>

            <div style={styles.reviewCard}>
              <div style={styles.reviewLabel}>Customer</div>
              <div style={styles.reviewValue}>{customer.Name || '—'}</div>
              <div style={styles.reviewSub}>{customer.Address}, {customer.City}</div>
            </div>

            <div style={styles.reviewCard}>
              <div style={styles.reviewLabel}>Job</div>
              <div style={styles.reviewValue}>{job.Description || '—'}</div>
              <div style={styles.reviewSub}>{job.JobDate} · <span style={{ background: job.Division==='Spray'?'#dcfce7':'#fef9c3', color: job.Division==='Spray'?'#166534':'#854d0e', padding:'1px 8px', borderRadius:99, fontSize:11, fontWeight:700 }}>{job.Division}</span></div>
            </div>

            {subtotal > 0 && (
              <div style={styles.reviewCard}>
                <div style={styles.reviewLabel}>Estimate</div>
                <div style={styles.reviewValue}>${total.toFixed(2)}</div>
                <div style={styles.reviewSub}>{lineItems.filter(i=>i.description).length} line item(s)</div>
              </div>
            )}

            {photos.length > 0 && (
              <div style={styles.reviewCard}>
                <div style={styles.reviewLabel}>Photos</div>
                <div style={styles.reviewValue}>{photos.length} photo(s)</div>
                <div style={styles.reviewSub}>Will upload to Google Drive</div>
              </div>
            )}

            <button style={{ ...styles.bigSubmitBtn, opacity: saving ? 0.6 : 1 }} onClick={submit} disabled={saving}>
              {saving ? (uploading ? `Uploading photos…` : 'Saving…') : '✅ Create Job'}
            </button>
          </div>
        )}
      </div>

      {/* Next button */}
      {step < 4 && (
        <div style={styles.footer}>
          <button
            style={styles.nextBtn}
            onClick={() => setStep(s => s + 1)}
            disabled={step === 1 && !customer.Name}
          >
            {step === 3 && photos.length === 0 ? 'Skip Photos →' : 'Next →'}
          </button>
        </div>
      )}
    </div>
  );
}

function today() { return new Date().toISOString().split('T')[0]; }

const styles = {
  wrap: { position:'fixed', inset:0, background:'#f0f4f0', zIndex:300, display:'flex', flexDirection:'column', maxWidth:480, margin:'0 auto' },
  header: { background:'#1a4a1a', color:'white', padding:'14px 16px', display:'flex', alignItems:'center', gap:12 },
  backBtn: { background:'rgba(255,255,255,0.15)', border:'none', color:'white', width:36, height:36, borderRadius:8, fontSize:18, cursor:'pointer', flexShrink:0 },
  headerTitle: { fontSize:16, fontWeight:700 },
  headerSub: { fontSize:11, color:'rgba(255,255,255,0.6)' },
  stepDots: { marginLeft:'auto', display:'flex', gap:5 },
  dot: { width:8, height:8, borderRadius:'50%', transition:'background 0.2s' },
  body: { flex:1, overflowY:'auto', padding:16 },
  footer: { padding:'12px 16px', background:'white', borderTop:'1px solid #e5e7eb' },
  stepTitle: { fontSize:20, fontWeight:800, color:'#1a4a1a', marginBottom:6 },
  stepSub: { fontSize:13, color:'#6b7280', marginBottom:16, lineHeight:1.5 },
  label: { fontSize:13, fontWeight:600, color:'#374151', marginBottom:5, marginTop:10 },
  input: { width:'100%', minHeight:50, padding:'12px 14px', border:'2px solid #d1d5db', borderRadius:8, fontSize:16, fontFamily:'inherit', color:'#111827', background:'white', display:'block' },
  row: { display:'flex', gap:10 },
  searchBtn: { minHeight:50, width:52, borderRadius:8, border:'2px solid #1a4a1a', background:'#1a4a1a', color:'white', fontSize:20, cursor:'pointer', flexShrink:0 },
  parcelList: { background:'white', borderRadius:10, border:'2px solid #d1d5db', marginBottom:14, overflow:'hidden' },
  parcelHint: { padding:'10px 14px', fontSize:12, fontWeight:600, color:'#6b7280', background:'#f9fafb', borderBottom:'1px solid #e5e7eb' },
  parcelRow: { display:'block', width:'100%', padding:'12px 14px', border:'none', background:'white', textAlign:'left', borderBottom:'1px solid #e5e7eb', cursor:'pointer' },
  parcelConfirm: { background:'#e8f5e8', border:'2px solid #2d6a2d', borderRadius:8, padding:'10px 14px', marginBottom:14, fontSize:13, lineHeight:1.6 },
  manualBtn: { display:'block', width:'100%', padding:'12px', border:'2px dashed #d1d5db', borderRadius:8, background:'transparent', color:'#6b7280', fontSize:13, cursor:'pointer', marginTop:8, textAlign:'center' },
  addLineBtn: { display:'block', width:'100%', padding:'10px', border:'2px dashed #2d6a2d', borderRadius:8, background:'transparent', color:'#2d6a2d', fontSize:14, fontWeight:600, cursor:'pointer', marginBottom:14 },
  totalsBox: { background:'#f3f4f6', borderRadius:8, padding:'14px', marginTop:12 },
  totalsRow: { display:'flex', justifyContent:'space-between', fontSize:14, padding:'3px 0', color:'#374151' },
  photoBtn: { display:'block', width:'100%', padding:'18px', border:'2px dashed #2d6a2d', borderRadius:10, background:'#f3faf3', color:'#1a4a1a', fontSize:16, fontWeight:700, cursor:'pointer', marginBottom:14, textAlign:'center' },
  photoGrid: { display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:8, marginBottom:14 },
  photoThumb: { position:'relative', aspectRatio:'1', borderRadius:8, overflow:'hidden', background:'#e5e7eb' },
  removePhoto: { position:'absolute', top:4, right:4, width:24, height:24, borderRadius:'50%', background:'rgba(0,0,0,0.6)', border:'none', color:'white', fontSize:14, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' },
  reviewCard: { background:'white', borderRadius:10, padding:'14px 16px', marginBottom:10, boxShadow:'0 1px 3px rgba(0,0,0,0.08)' },
  reviewLabel: { fontSize:11, fontWeight:700, color:'#6b7280', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:4 },
  reviewValue: { fontSize:17, fontWeight:700, color:'#111827' },
  reviewSub: { fontSize:12, color:'#6b7280', marginTop:2 },
  bigSubmitBtn: { width:'100%', padding:'18px', borderRadius:12, border:'none', background:'#1a4a1a', color:'white', fontSize:18, fontWeight:800, cursor:'pointer', marginTop:8 },
  nextBtn: { width:'100%', padding:'16px', borderRadius:10, border:'none', background:'#2d6a2d', color:'white', fontSize:16, fontWeight:700, cursor:'pointer' },
};
