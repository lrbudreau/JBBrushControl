import React, { useState, useRef } from 'react';
import { api } from '../api';
import { lookupParcelByAddress } from '../hooks/useGIS';
import { getJobFolder, uploadPhoto, requestDriveAccess } from '../hooks/useDrive';
import { toast } from './Toast';

const STEPS = ['Address', 'Customer', 'Job Details', 'Estimate', 'Photos', 'Review'];

export default function NewJobFlow({ onComplete, onCancel }) {
  const [step, setStep]       = useState(0);
  const [saving, setSaving]   = useState(false);
  const [uploading, setUploading] = useState(false);

  // GIS lookup
  const [addressInput, setAddressInput] = useState('');
  const [searching, setSearching]       = useState(false);
  const [parcels, setParcels]           = useState([]);

  // Forms
  const [customer, setCustomer] = useState({ Name:'', Phone:'', Email:'', Address:'', City:'', State:'IN', Zip:'', County:'', Division:'Spray' });
  const [job, setJob]           = useState({ Description:'', Priority:'Normal', Notes:'' });
  const [lineItems, setLineItems] = useState([{ description:'', qty:1, rate:'', amount:'' }]);
  const [taxRate, setTaxRate]   = useState('0');
  const [photos, setPhotos]     = useState([]);
  const fileRef = useRef();

  // ── GIS Search ───────────────────────────────────────────

  const searchAddress = async () => {
    if (!addressInput.trim()) return;
    setSearching(true);
    setParcels([]);
    const results = await lookupParcelByAddress(addressInput);
    if (results.length === 0) {
      toast('No parcels found — fill in details manually', 'info');
      setCustomer(c => ({ ...c, Address: addressInput }));
      setStep(1);
    } else {
      setParcels(results);
    }
    setSearching(false);
  };

  const selectParcel = (parcel) => {
    setCustomer(c => ({
      ...c,
      Address: parcel.address,
      City:    parcel.city,
      State:   parcel.state,
      Zip:     parcel.zip,
      County:  parcel.county,
    }));
    setParcels([]);
    setStep(1);
  };

  const skipToManual = () => {
    setCustomer(c => ({ ...c, Address: addressInput }));
    setParcels([]);
    setStep(1);
  };

  // ── Line items ───────────────────────────────────────────

  const updateItem = (i, field, val) => {
    setLineItems(items => items.map((item, idx) => {
      if (idx !== i) return item;
      return { ...item, [field]: val };
    }));
  };

  const subtotal = lineItems.reduce((s, i) => s + (parseFloat(i.amount)||0), 0);
  const taxAmt   = subtotal * (parseFloat(taxRate)||0);
  const total    = subtotal + taxAmt;

  // ── Photos ───────────────────────────────────────────────

  const handlePhotoSelect = (e) => {
    const files = Array.from(e.target.files);
    setPhotos(p => [...p, ...files.map(file => ({ file, preview: URL.createObjectURL(file) }))]);
  };

  // ── Submit ───────────────────────────────────────────────

  const submit = async () => {
    setSaving(true);
    try {
      // 1. Add customer
      const cusRes = await api('addCustomer', {}, { ...customer, Division: customer.Division });
      if (cusRes.status !== 'ok') { toast('Failed to save customer', 'error'); setSaving(false); return; }
      const customerID = cusRes.data.CustomerID;

      // 2. Create job
      const jobRes = await api('addJob', {}, {
        CustomerID:  customerID,
        Division:    customer.Division,
        Description: job.Description,
        Priority:    job.Priority || 'Normal',
        Status:      'Estimate',
        Notes:       job.Notes,
      });
      if (jobRes.status !== 'ok') { toast('Failed to save job', 'error'); setSaving(false); return; }
      const jobID = jobRes.data.JobID;

      // 3. Upload photos to Drive and log to Photos sheet
      console.log('Photos to upload:', photos.length, photos.map(p => p.file?.name));
      if (photos.length > 0) {
        setUploading(true);
        try {
          const drivePromise = (async () => {
            await requestDriveAccess();
            const { folderId, folderUrl } = await getJobFolder(jobID, customer.Name);
            for (const photo of photos) {
              const result = await uploadPhoto(photo.file, folderId);
              if (result.id) {
                // Log each photo to the Photos sheet
                await api('addPhoto', {}, {
                  JobID:        jobID,
                  FileName:     result.name || photo.file.name,
                  DriveFileID:  result.id,
                  DriveUrl:     result.webViewLink || `https://drive.google.com/file/d/${result.id}/view`,
                  ThumbnailUrl: result.thumbnailLink || '',
                });
              }
            }
            // Update job notes with folder link
            await api('updateJob', {}, {
              JobID: jobID,
              Notes: (job.Notes ? job.Notes + '\n' : '') + `Photos: ${folderUrl}`
            });
          })();
          const timeout = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), 30000)
          );
          await Promise.race([drivePromise, timeout]);
          toast(`${photos.length} photo(s) uploaded ✅`);
        } catch (e) {
          console.error('Photo upload error:', e);
          if (e.message === 'timeout') {
            toast('Photos timed out — job saved, try uploading photos again', 'info');
          } else {
            toast('Photo upload failed: ' + e.message, 'error');
          }
        }
        setUploading(false);
      }

      // 4. Create estimate if any line items have a description
      const validItems = lineItems.filter(i => i.description);
      if (validItems.length > 0) {
        const estRes = await api('addEstimate', {}, {
          JobID:     jobID,
          LineItems: JSON.stringify(validItems),
          Subtotal:  subtotal.toFixed(2),
          TaxRate:   taxRate,
        });
        if (estRes.status !== 'ok') {
          toast('Job saved but estimate failed: ' + estRes.message, 'info');
        }
      }

      toast(`Job created! ${photos.length > 0 ? `${photos.length} photo(s) uploaded.` : ''}`);
      onComplete({ jobID, customerID });
    } catch (e) {
      toast('Something went wrong: ' + e.message, 'error');
    }
    setSaving(false);
  };

  // ── Render ───────────────────────────────────────────────

  const fc = e => setCustomer(p => ({ ...p, [e.target.name]: e.target.value }));
  const fj = e => setJob(p => ({ ...p, [e.target.name]: e.target.value }));

  return (
    <div style={S.wrap}>
      {/* Header */}
      <div style={S.header}>
        <button style={S.backBtn} onClick={step === 0 ? onCancel : () => setStep(s => s - 1)}>
          {step === 0 ? '✕' : '←'}
        </button>
        <div>
          <div style={S.headerTitle}>New Job</div>
          <div style={S.headerSub}>Step {step + 1} of {STEPS.length} — {STEPS[step]}</div>
        </div>
        <div style={S.dots}>
          {STEPS.map((_, i) => <div key={i} style={{ ...S.dot, background: i <= step ? '#4ade80' : 'rgba(255,255,255,0.3)' }} />)}
        </div>
      </div>

      <div style={S.body}>

        {/* STEP 0: Address lookup */}
        {step === 0 && (
          <div>
            <div style={S.stepTitle}>📍 Job site address</div>
            <div style={S.stepSub}>Type the street address to auto-fill city, state, and zip from Indiana's property records.</div>
            <div style={{ display:'flex', gap:8, marginBottom:16 }}>
              <input style={S.input} value={addressInput} onChange={e => setAddressInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && searchAddress()}
                placeholder="e.g. 403 N Monroe Ave" autoComplete="off" />
              <button style={S.searchBtn} onClick={searchAddress} disabled={searching}>
                {searching ? '…' : '🔍'}
              </button>
            </div>

            {parcels.length > 0 && (
              <div style={S.parcelList}>
                <div style={S.parcelHint}>Select the matching address:</div>
                {parcels.map((p, i) => (
                  <button key={i} style={S.parcelRow} onClick={() => selectParcel(p)}>
                    <div style={{ fontWeight:700, fontSize:15 }}>{p.address}</div>
                    <div style={{ fontSize:13, color:'#6b7280' }}>{p.city}, {p.state} {p.zip}</div>
                    <div style={{ fontSize:11, color:'#9ca3af' }}>{p.county} County · Parcel {p.parcelNo}</div>
                  </button>
                ))}
                <button style={S.manualBtn} onClick={skipToManual}>None of these — enter manually</button>
              </div>
            )}

            <button style={S.manualBtn} onClick={skipToManual}>Skip — enter address manually</button>
          </div>
        )}

        {/* STEP 1: Customer info */}
        {step === 1 && (
          <div>
            <div style={S.stepTitle}>👤 Customer</div>
            {customer.Address && (
              <div style={S.confirmBox}>
                ✅ Address confirmed: <strong>{customer.Address}</strong><br/>
                <span style={{ fontSize:12, color:'#6b7280' }}>{customer.City}{customer.City && customer.State ? ', ' : ''}{customer.State} {customer.Zip} {customer.County ? `· ${customer.County} County` : ''}</span>
              </div>
            )}
            <div style={S.label}>Customer name *</div>
            <input style={S.input} name="Name" value={customer.Name} onChange={fc} placeholder="Full name" />
            <div style={S.label}>Division</div>
            <select style={S.input} name="Division" value={customer.Division} onChange={fc}>
              <option>Spray</option><option>Tree</option>
            </select>
            <div style={{ display:'flex', gap:10 }}>
              <div style={{ flex:1 }}>
                <div style={S.label}>Phone</div>
                <input style={S.input} name="Phone" value={customer.Phone} onChange={fc} inputMode="tel" placeholder="(555) 555-5555" />
              </div>
              <div style={{ flex:1 }}>
                <div style={S.label}>Email</div>
                <input style={S.input} name="Email" value={customer.Email} onChange={fc} inputMode="email" placeholder="email@example.com" />
              </div>
            </div>
            <div style={S.label}>Street address</div>
            <input style={S.input} name="Address" value={customer.Address} onChange={fc} />
            <div style={{ display:'flex', gap:10 }}>
              <div style={{ flex:2 }}>
                <div style={S.label}>City</div>
                <input style={S.input} name="City" value={customer.City} onChange={fc} />
              </div>
              <div style={{ flex:1 }}>
                <div style={S.label}>State</div>
                <input style={S.input} name="State" value={customer.State} onChange={fc} />
              </div>
              <div style={{ flex:1 }}>
                <div style={S.label}>Zip</div>
                <input style={S.input} name="Zip" value={customer.Zip} onChange={fc} inputMode="numeric" />
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: Job details */}
        {step === 2 && (
          <div>
            <div style={S.stepTitle}>🔧 Job Details</div>
            <div style={S.label}>Priority</div>
            <div style={{ display:'flex', gap:10, marginBottom:4 }}>
              {['Normal','Urgent'].map(p => (
                <button key={p} type="button"
                  onClick={() => setJob(j => ({...j, Priority: p}))}
                  style={{
                    flex:1, padding:'12px', borderRadius:8, border:'2px solid',
                    borderColor: job.Priority===p ? (p==='Urgent'?'#dc2626':'#1a4a1a') : '#d1d5db',
                    background: job.Priority===p ? (p==='Urgent'?'#fee2e2':'#e8f5e8') : 'white',
                    color: job.Priority===p ? (p==='Urgent'?'#dc2626':'#1a4a1a') : '#6b7280',
                    fontWeight: 700, fontSize:14, cursor:'pointer',
                  }}>
                  {p === 'Urgent' ? '🔴 Urgent' : '🟢 Normal'}
                </button>
              ))}
            </div>

            <div style={S.label}>Description *</div>
            <textarea style={{ ...S.input, minHeight:100, resize:'vertical' }} name="Description"
              value={job.Description} onChange={fj} placeholder="Describe the work to be done…" />

            <div style={S.label}>Notes</div>
            <textarea style={{ ...S.input, minHeight:72, resize:'vertical' }} name="Notes" value={job.Notes} onChange={fj} placeholder="Any additional notes…" />
          </div>
        )}

        {/* STEP 3: Estimate */}
        {step === 3 && (
          <div>
            <div style={S.stepTitle}>💰 Estimate</div>
            <div style={S.stepSub}>Add line items. You can skip this and add it later.</div>
            {lineItems.map((item, i) => (
              <div key={i} style={{ display:'flex', gap:8, marginBottom:10, alignItems:'center' }}>
                <input style={{ ...S.input, flex:3 }} placeholder="Description (e.g. Remove oak tree)"
                  value={item.description} onChange={e => updateItem(i,'description',e.target.value)} />
                <div style={{ position:'relative', flex:1 }}>
                  <span style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'#6b7280', pointerEvents:'none' }}>$</span>
                  <input style={{ ...S.input, paddingLeft:22 }} placeholder="0.00" type="number"
                    value={item.amount} onChange={e => updateItem(i,'amount',e.target.value)} inputMode="decimal" />
                </div>
                <button onClick={() => setLineItems(items => items.filter((_,idx)=>idx!==i))}
                  style={{ background:'none', border:'none', color:'#dc2626', fontSize:22, cursor:'pointer', padding:'0 4px', flexShrink:0 }}>×</button>
              </div>
            ))}
            <button style={S.addLineBtn} onClick={() => setLineItems(i => [...i, { description:'', qty:1, rate:'', amount:'' }])}>
              + Add line item
            </button>
            <div style={S.label}>Tax rate</div>
            <select style={S.input} value={taxRate} onChange={e => setTaxRate(e.target.value)}>
              <option value="0">0% (no tax)</option>
              <option value="0.07">7% Indiana</option>
            </select>
            {subtotal > 0 && (
              <div style={S.totals}>
                <div style={S.totalsRow}><span>Subtotal</span><span>${subtotal.toFixed(2)}</span></div>
                <div style={S.totalsRow}><span>Tax</span><span>${taxAmt.toFixed(2)}</span></div>
                <div style={{ ...S.totalsRow, fontSize:18, fontWeight:800, color:'#1a4a1a', borderTop:'2px solid #d1d5db', paddingTop:10, marginTop:6 }}>
                  <span>Total</span><span>${total.toFixed(2)}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* STEP 4: Photos */}
        {step === 4 && (
          <div>
            <div style={S.stepTitle}>📸 Photos</div>
            <div style={S.stepSub}>Take photos of the job site. They'll be saved to Google Drive linked to this job.</div>
            <input ref={fileRef} type="file" accept="image/*" multiple style={{ display:'none' }} onChange={handlePhotoSelect} />
            <button style={S.photoBtn} onClick={() => fileRef.current.click()}>📷 Take / Add Photos</button>
            {photos.length > 0 ? (
              <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:8, marginTop:12 }}>
                {photos.map((p, i) => (
                  <div key={i} style={{ position:'relative', aspectRatio:'1', borderRadius:8, overflow:'hidden', background:'#e5e7eb' }}>
                    <img src={p.preview} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                    <button onClick={() => setPhotos(p => p.filter((_,idx)=>idx!==i))}
                      style={{ position:'absolute', top:4, right:4, width:24, height:24, borderRadius:'50%', background:'rgba(0,0,0,0.6)', border:'none', color:'white', fontSize:14, cursor:'pointer' }}>×</button>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ textAlign:'center', padding:'32px 0', color:'#9ca3af' }}>
                <div style={{ fontSize:40 }}>📷</div>
                <div>No photos yet</div>
              </div>
            )}
            <div style={{ fontSize:12, color:'#9ca3af', marginTop:16, textAlign:'center' }}>
              Photos upload to Google Drive and link to this job automatically.
            </div>
          </div>
        )}

        {/* STEP 5: Review */}
        {step === 5 && (
          <div>
            <div style={S.stepTitle}>✅ Review & Submit</div>
            <div style={S.reviewCard}>
              <div style={S.reviewLabel}>Customer</div>
              <div style={S.reviewValue}>{customer.Name || '—'}</div>
              <div style={S.reviewSub}>{customer.Address}{customer.City ? `, ${customer.City}` : ''}{customer.State ? `, ${customer.State}` : ''} {customer.Zip}{customer.County ? ` · ${customer.County} County` : ''}</div>
            </div>
            <div style={S.reviewCard}>
              <div style={S.reviewLabel}>Job · <span style={{ background: customer.Division==='Spray'?'#dcfce7':'#fef9c3', color: customer.Division==='Spray'?'#166534':'#854d0e', padding:'1px 8px', borderRadius:99, fontSize:11, fontWeight:700 }}>{customer.Division}</span></div>
              <div style={S.reviewValue}>{job.Description || '—'}</div>
              <div style={S.reviewSub}>{job.JobDate}</div>
            </div>
            {subtotal > 0 && (
              <div style={S.reviewCard}>
                <div style={S.reviewLabel}>Estimate</div>
                <div style={S.reviewValue}>${total.toFixed(2)}</div>
                <div style={S.reviewSub}>{lineItems.filter(i=>i.description).length} line item(s)</div>
              </div>
            )}
            {photos.length > 0 && (
              <div style={S.reviewCard}>
                <div style={S.reviewLabel}>Photos</div>
                <div style={S.reviewValue}>{photos.length} photo(s)</div>
                <div style={S.reviewSub}>Will upload to Google Drive</div>
              </div>
            )}
            <button style={{ ...S.submitBtn, opacity: saving ? 0.6 : 1 }} onClick={submit} disabled={saving}>
              {saving ? (uploading ? 'Uploading photos…' : 'Saving…') : '✅ Create Job'}
            </button>
          </div>
        )}

      </div>

      {/* Next button */}
      {step < STEPS.length - 1 && (
        <div style={S.footer}>
          <button style={S.nextBtn}
            onClick={() => setStep(s => s + 1)}
            disabled={step === 1 && !customer.Name || step === 2 && !job.Description}>
            {step === 4 && photos.length === 0 ? 'Skip Photos →' : 'Next →'}
          </button>
        </div>
      )}
    </div>
  );
}


const S = {
  wrap:       { position:'fixed', inset:0, background:'#f0f4f0', zIndex:300, display:'flex', flexDirection:'column', maxWidth:480, margin:'0 auto' },
  header:     { background:'#1a4a1a', color:'white', padding:'14px 16px', display:'flex', alignItems:'center', gap:12 },
  backBtn:    { background:'rgba(255,255,255,0.15)', border:'none', color:'white', width:36, height:36, borderRadius:8, fontSize:18, cursor:'pointer', flexShrink:0 },
  headerTitle:{ fontSize:16, fontWeight:700 },
  headerSub:  { fontSize:11, color:'rgba(255,255,255,0.6)' },
  dots:       { marginLeft:'auto', display:'flex', gap:5 },
  dot:        { width:8, height:8, borderRadius:'50%', transition:'background 0.2s' },
  body:       { flex:1, overflowY:'auto', padding:16 },
  footer:     { padding:'12px 16px', background:'white', borderTop:'1px solid #e5e7eb' },
  stepTitle:  { fontSize:20, fontWeight:800, color:'#1a4a1a', marginBottom:6 },
  stepSub:    { fontSize:13, color:'#6b7280', marginBottom:16, lineHeight:1.5 },
  label:      { fontSize:13, fontWeight:600, color:'#374151', marginBottom:5, marginTop:12 },
  input:      { width:'100%', minHeight:50, padding:'12px 14px', border:'2px solid #d1d5db', borderRadius:8, fontSize:16, fontFamily:'inherit', color:'#111827', background:'white', display:'block' },
  searchBtn:  { minHeight:50, width:52, borderRadius:8, border:'2px solid #1a4a1a', background:'#1a4a1a', color:'white', fontSize:20, cursor:'pointer', flexShrink:0 },
  parcelList: { background:'white', borderRadius:10, border:'2px solid #d1d5db', marginBottom:14, overflow:'hidden' },
  parcelHint: { padding:'10px 14px', fontSize:12, fontWeight:600, color:'#6b7280', background:'#f9fafb', borderBottom:'1px solid #e5e7eb' },
  parcelRow:  { display:'block', width:'100%', padding:'12px 14px', border:'none', background:'white', textAlign:'left', borderBottom:'1px solid #e5e7eb', cursor:'pointer' },
  confirmBox: { background:'#e8f5e8', border:'2px solid #2d6a2d', borderRadius:8, padding:'10px 14px', marginBottom:14, fontSize:13, lineHeight:1.8 },
  manualBtn:  { display:'block', width:'100%', padding:'12px', border:'2px dashed #d1d5db', borderRadius:8, background:'transparent', color:'#6b7280', fontSize:13, cursor:'pointer', marginTop:8, textAlign:'center' },
  addLineBtn: { display:'block', width:'100%', padding:'10px', border:'2px dashed #2d6a2d', borderRadius:8, background:'transparent', color:'#2d6a2d', fontSize:14, fontWeight:600, cursor:'pointer', margin:'8px 0 14px' },
  totals:     { background:'#f3f4f6', borderRadius:8, padding:'14px', marginTop:12 },
  totalsRow:  { display:'flex', justifyContent:'space-between', fontSize:14, padding:'3px 0', color:'#374151' },
  photoBtn:   { display:'block', width:'100%', padding:'18px', border:'2px dashed #2d6a2d', borderRadius:10, background:'#f3faf3', color:'#1a4a1a', fontSize:16, fontWeight:700, cursor:'pointer', textAlign:'center' },
  reviewCard: { background:'white', borderRadius:10, padding:'14px 16px', marginBottom:10, boxShadow:'0 1px 3px rgba(0,0,0,0.08)' },
  reviewLabel:{ fontSize:11, fontWeight:700, color:'#6b7280', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:4 },
  reviewValue:{ fontSize:17, fontWeight:700, color:'#111827' },
  reviewSub:  { fontSize:12, color:'#6b7280', marginTop:2 },
  submitBtn:  { width:'100%', padding:'18px', borderRadius:12, border:'none', background:'#1a4a1a', color:'white', fontSize:18, fontWeight:800, cursor:'pointer', marginTop:8 },
  nextBtn:    { width:'100%', padding:'16px', borderRadius:10, border:'none', background:'#2d6a2d', color:'white', fontSize:16, fontWeight:700, cursor:'pointer' },
};
