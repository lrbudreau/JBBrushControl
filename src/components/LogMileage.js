import React, { useEffect, useState } from 'react';
import { api, getUser } from '../api';
import { toast } from './Toast';

const HOME_ADDRESS = ''; // Will be pulled from Settings

export default function LogMileage({ onClose }) {
  const user = getUser();
  const [equipment, setEquip] = useState([]);
  const [jobs, setJobs]       = useState([]);
  const [customers, setCustomers] = useState([]);
  const [saving, setSaving]   = useState(false);
  const [calculating, setCalc] = useState(null);
  const [homeAddress, setHomeAddress] = useState('');
  const [date, setDate]       = useState(today());
  const [entries, setEntries] = useState([blankEntry()]);

  useEffect(() => {
    Promise.all([
      api('getEquipment'),
      api('getJobs'),
      api('getCustomers'),
      api('getSettings'),
    ]).then(([e, j, c, s]) => {
      if (e.status === 'ok') setEquip(e.data.filter(x => ['Truck','Trailer'].includes(x.Type)));
      if (j.status === 'ok') setJobs(j.data);
      if (c.status === 'ok') setCustomers(c.data);
      if (s.status === 'ok') {
        const addr = s.data.HomeAddress || s.data.Address || '';
        const city  = s.data.City  || '';
        const state = s.data.State || 'IN';
        const zip   = s.data.Zip   || '';
        setHomeAddress([addr, city, state, zip].filter(Boolean).join(', '));
      }
    });
  }, []);

  function blankEntry() {
    return {
      equipmentID: '', truckName: '',
      pointAType: 'home', pointACustom: '', pointAJobID: '',
      pointBType: 'job',  pointBCustom: '', pointBJobID: '',
      miles: '', rounds: 1, totalMiles: '',
      jobID: '', division: 'Spray', purpose: '',
    };
  }

  // Resolve address from type selection
  function resolveAddress(entry, side) {
    const type    = side === 'A' ? entry.pointAType    : entry.pointBType;
    const custom  = side === 'A' ? entry.pointACustom  : entry.pointBCustom;
    const jobID   = side === 'A' ? entry.pointAJobID   : entry.pointBJobID;

    if (type === 'custom') return custom;
    if (type === 'home')   return homeAddress || 'home';
    if (type === 'job') {
      const job      = jobs.find(j => j.JobID === jobID);
      const customer = job ? customers.find(c => c.CustomerID === job.CustomerID) : null;
      if (customer) {
        return [customer.Address, customer.City, customer.State].filter(Boolean).join(', ');
      }
      return '';
    }
    return '';
  }

  function getAddressDisplay(entry, side) {
    const addr = resolveAddress(entry, side);
    return addr || '—';
  }

  const updateEntry = (i, field, val) => {
    setEntries(entries => entries.map((e, idx) => {
      if (idx !== i) return e;
      const next = { ...e, [field]: val };
      if (field === 'equipmentID') {
        const eq = equipment.find(x => x.EquipmentID === val);
        if (eq) next.truckName = eq.Name;
      }
      // Link job to the trip automatically
      if (field === 'pointBJobID' && next.pointBType === 'job') next.jobID = val;
      if (field === 'pointAJobID' && next.pointAType === 'job') next.jobID = val;
      // Recalculate total
      if (field === 'miles' || field === 'rounds') {
        const m = parseFloat(field === 'miles' ? val : next.miles) || 0;
        const r = parseInt(field === 'rounds' ? val : next.rounds) || 1;
        if (m) next.totalMiles = (m * r).toFixed(1);
      }
      return next;
    }));
  };

  const calculateDistance = async (i) => {
    const entry = entries[i];
    const addrA = resolveAddress(entry, 'A');
    const addrB = resolveAddress(entry, 'B');

    if (!addrA || !addrB) return toast('Set both Point A and Point B first', 'error');

    setCalc(i);
    try {
      const ORS_KEY = process.env.REACT_APP_ORS_KEY;

      // Geocode both addresses
      const geocode = async (addr) => {
        const res  = await fetch(
          `https://api.openrouteservice.org/geocode/search?api_key=${ORS_KEY}&text=${encodeURIComponent(addr + ', Indiana, USA')}&boundary.country=US&size=1`
        );
        const data = await res.json();
        if (data.features?.length > 0) return data.features[0].geometry.coordinates; // [lng, lat]
        throw new Error('Address not found: ' + addr);
      };

      const [coordsA, coordsB] = await Promise.all([geocode(addrA), geocode(addrB)]);

      // Get driving distance
      const dirRes  = await fetch('https://api.openrouteservice.org/v2/directions/driving-car', {
        method: 'POST',
        headers: {
          'Authorization': ORS_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ coordinates: [coordsA, coordsB], units: 'mi' }),
      });
      const dirData = await dirRes.json();

      if (dirData.routes?.length > 0) {
        const summary = dirData.routes[0].summary;
        const miles   = summary.distance.toFixed(1);
        const mins    = Math.round(summary.duration / 60);
        const timeStr = mins >= 60 ? `${Math.floor(mins/60)}h ${mins%60}m` : `${mins} min`;
        updateEntry(i, 'miles', miles);
        toast(`${miles} miles · ${timeStr} ✅`);
      } else {
        toast('Could not find route — enter miles manually', 'info');
      }
    } catch (e) {
      console.error('ORS error:', e);
      toast('Could not calculate — enter miles manually', 'info');
    }
    setCalc(null);
  };

  const openInMaps = (i) => {
    const entry = entries[i];
    const addrA = resolveAddress(entry, 'A');
    const addrB = resolveAddress(entry, 'B');
    if (!addrA || !addrB) return toast('Set both points first', 'info');
    window.open(`https://www.google.com/maps/dir/${encodeURIComponent(addrA)}/${encodeURIComponent(addrB)}`, '_blank');
  };

  const save = async () => {
    const valid = entries.filter(e => e.equipmentID && (e.totalMiles || e.miles));
    if (valid.length === 0) return toast('Select a truck and enter or calculate mileage', 'error');
    setSaving(true);
    let count = 0;
    for (const entry of valid) {
      const addrA = resolveAddress(entry, 'A');
      const addrB = resolveAddress(entry, 'B');
      const miles = parseFloat(entry.totalMiles || entry.miles) || 0;
      const r = await api('addMileage', {}, {
        Date:        date,
        EquipmentID: entry.equipmentID,
        TruckName:   entry.truckName,
        JobID:       entry.jobID || '',
        StartMiles:  0,
        EndMiles:    0,
        TotalMiles:  miles,
        Purpose:     entry.purpose || (addrA && addrB ? `${addrA} → ${addrB}` : ''),
        Division:    entry.division,
        PointA:      addrA,
        PointB:      addrB,
        Rounds:      parseInt(entry.rounds) || 1,
      });
      if (r.status === 'ok') count++;
    }
    if (count > 0) { toast(`${count} mileage entr${count > 1 ? 'ies' : 'y'} logged ✅`); onClose(); }
    else toast('Failed to save', 'error');
    setSaving(false);
  };

  const grandTotal = entries.reduce((s, e) => s + (parseFloat(e.totalMiles || e.miles) || 0), 0);

  return (
    <div style={S.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={S.sheet}>
        <div style={S.handle} />
        <div style={S.header}>
          <h3 style={{ fontSize: 17, fontWeight: 700 }}>Log Mileage</h3>
          <button style={S.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div style={S.body}>
          <div style={S.label}>Date</div>
          <input type="date" style={S.input} value={date} onChange={e => setDate(e.target.value)} />

          {entries.map((entry, i) => (
            <div key={i} style={S.entryCard}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                <div style={{ fontWeight:700, fontSize:13, color:'#1a4a1a' }}>Trip {i+1}</div>
                {entries.length > 1 && (
                  <button onClick={() => setEntries(e => e.filter((_,idx) => idx !== i))} style={S.removeBtn}>Remove</button>
                )}
              </div>

              {/* Truck */}
              <div style={S.label}>Truck *</div>
              <select style={S.input} value={entry.equipmentID} onChange={e => updateEntry(i,'equipmentID',e.target.value)}>
                <option value="">— Select truck —</option>
                {equipment.map(e => <option key={e.EquipmentID} value={e.EquipmentID}>{e.Name}</option>)}
              </select>

              {/* Division */}
              <div style={S.label}>Division</div>
              <select style={S.input} value={entry.division} onChange={e => updateEntry(i,'division',e.target.value)}>
                <option>Spray</option><option>Tree</option>
              </select>

              {/* Point A */}
              <div style={S.label}>From (Point A)</div>
              <PointSelector
                typeVal={entry.pointAType}
                jobVal={entry.pointAJobID}
                customVal={entry.pointACustom}
                jobs={jobs}
                display={getAddressDisplay(entry, 'A')}
                onTypeChange={v => updateEntry(i,'pointAType',v)}
                onJobChange={v => updateEntry(i,'pointAJobID',v)}
                onCustomChange={v => updateEntry(i,'pointACustom',v)}
              />

              {/* Point B */}
              <div style={S.label}>To (Point B)</div>
              <PointSelector
                typeVal={entry.pointBType}
                jobVal={entry.pointBJobID}
                customVal={entry.pointBCustom}
                jobs={jobs}
                display={getAddressDisplay(entry, 'B')}
                onTypeChange={v => updateEntry(i,'pointBType',v)}
                onJobChange={v => updateEntry(i,'pointBJobID',v)}
                onCustomChange={v => updateEntry(i,'pointBCustom',v)}
              />

              {/* Calculate buttons */}
              <div style={{ display:'flex', gap:8, marginTop:10 }}>
                <button style={S.calcBtn} onClick={() => calculateDistance(i)} disabled={calculating===i}>
                  {calculating===i ? '…' : '📍 Calc miles'}
                </button>
                <button style={S.mapsBtn} onClick={() => openInMaps(i)}>🗺 Maps</button>
              </div>

              {/* Miles + Rounds */}
              <div style={{ display:'flex', gap:8, marginTop:8 }}>
                <div style={{ flex:1 }}>
                  <div style={S.label}>One-way miles</div>
                  <input style={S.input} type="number" inputMode="decimal" placeholder="0.0"
                    value={entry.miles} onChange={e => updateEntry(i,'miles',e.target.value)} />
                </div>
                <div style={{ flex:1 }}>
                  <div style={S.label}>Rounds</div>
                  <input style={S.input} type="number" inputMode="numeric" min="1" placeholder="1"
                    value={entry.rounds} onChange={e => updateEntry(i,'rounds',e.target.value)} />
                </div>
              </div>

              {/* Entry total */}
              {(entry.miles || entry.totalMiles) && entry.rounds > 1 && (
                <div style={S.entryTotal}>
                  {entry.miles} mi × {entry.rounds} rounds = <strong>{entry.totalMiles} mi</strong>
                </div>
              )}

              <div style={S.label}>Notes</div>
              <input style={S.input} placeholder="e.g. Dumping brush at shop" value={entry.purpose}
                onChange={e => updateEntry(i,'purpose',e.target.value)} />
            </div>
          ))}

          <button style={S.addBtn} onClick={() => setEntries(e => [...e, blankEntry()])}>
            + Add another trip
          </button>

          {grandTotal > 0 && (
            <div style={S.grandTotal}>
              <div style={{ fontWeight:700, fontSize:16 }}>Total: {grandTotal.toFixed(1)} miles</div>
              <div style={{ fontSize:12, color:'#4a9e4a', marginTop:2 }}>
                IRS deduction: ${(grandTotal * 0.67).toFixed(2)}
              </div>
            </div>
          )}
        </div>

        <div style={S.footer}>
          <button style={S.cancelBtn} onClick={onClose}>Cancel</button>
          <button style={S.saveBtn} onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save Mileage'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Point selector component ──────────────────────────────────
function PointSelector({ typeVal, jobVal, customVal, jobs, display, onTypeChange, onJobChange, onCustomChange }) {
  return (
    <div>
      {/* Type toggle buttons */}
      <div style={{ display:'flex', gap:6, marginBottom:8 }}>
        {[
          { val:'home',   label:'🏠 Home' },
          { val:'job',    label:'📍 Job site' },
          { val:'custom', label:'✏️ Type address' },
        ].map(opt => (
          <button key={opt.val}
            style={{
              flex:1, padding:'7px 4px', borderRadius:7, fontSize:12, fontWeight:600, cursor:'pointer',
              border: typeVal===opt.val ? '2px solid #1a4a1a' : '2px solid #d1d5db',
              background: typeVal===opt.val ? '#e8f5e8' : 'white',
              color: typeVal===opt.val ? '#1a4a1a' : '#6b7280',
            }}
            onClick={() => onTypeChange(opt.val)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Job selector */}
      {typeVal === 'job' && (
        <select style={PS.input} value={jobVal} onChange={e => onJobChange(e.target.value)}>
          <option value="">— Select job —</option>
          {jobs.map(j => (
            <option key={j.JobID} value={j.JobID}>
              {j.CustomerName} — {j.Description?.slice(0,35)}
            </option>
          ))}
        </select>
      )}

      {/* Custom address */}
      {typeVal === 'custom' && (
        <input style={PS.input} placeholder="Enter address…" value={customVal} onChange={e => onCustomChange(e.target.value)} />
      )}

      {/* Address preview */}
      {typeVal !== 'custom' && display && display !== '—' && (
        <div style={PS.preview}>{display}</div>
      )}
    </div>
  );
}

const PS = {
  input:   { width:'100%', minHeight:46, padding:'10px 12px', border:'2px solid #d1d5db', borderRadius:8, fontSize:15, fontFamily:'inherit', background:'white' },
  preview: { fontSize:12, color:'#6b7280', padding:'6px 10px', background:'#f3f4f6', borderRadius:6, marginTop:4 },
};

function today() { return new Date().toISOString().split('T')[0]; }

const S = {
  overlay:    { position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:300, display:'flex', alignItems:'flex-end' },
  sheet:      { background:'white', borderRadius:'20px 20px 0 0', width:'100%', maxWidth:480, margin:'0 auto', maxHeight:'94vh', display:'flex', flexDirection:'column', animation:'slideUp 0.25s ease' },
  handle:     { width:40, height:4, background:'#d1d5db', borderRadius:99, margin:'10px auto 0', flexShrink:0 },
  header:     { padding:'12px 18px', display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:'1px solid #f3f4f6', flexShrink:0 },
  closeBtn:   { background:'none', border:'none', fontSize:20, cursor:'pointer', color:'#6b7280' },
  body:       { padding:'14px 18px', overflowY:'auto', flex:1 },
  footer:     { padding:'12px 18px 24px', display:'flex', gap:10, borderTop:'1px solid #f3f4f6', flexShrink:0 },
  label:      { fontSize:12, fontWeight:600, color:'#374151', marginBottom:4, marginTop:10 },
  input:      { width:'100%', minHeight:46, padding:'10px 12px', border:'2px solid #d1d5db', borderRadius:8, fontSize:15, fontFamily:'inherit', background:'white' },
  entryCard:  { background:'#f9fafb', borderRadius:10, padding:'12px 14px', marginBottom:10, border:'1px solid #e5e7eb' },
  removeBtn:  { background:'none', border:'none', color:'#dc2626', fontSize:12, fontWeight:600, cursor:'pointer' },
  calcBtn:    { flex:2, padding:'9px 12px', borderRadius:8, border:'none', background:'#1a4a1a', color:'white', fontWeight:600, fontSize:13, cursor:'pointer' },
  mapsBtn:    { flex:1, padding:'9px 12px', borderRadius:8, border:'2px solid #d1d5db', background:'white', color:'#374151', fontWeight:600, fontSize:13, cursor:'pointer' },
  entryTotal: { background:'#e8f5e8', borderRadius:6, padding:'8px 12px', marginTop:8, fontSize:13, color:'#1a4a1a', textAlign:'center' },
  addBtn:     { display:'block', width:'100%', padding:11, border:'2px dashed #2d6a2d', borderRadius:8, background:'transparent', color:'#2d6a2d', fontSize:14, fontWeight:600, cursor:'pointer', marginTop:4 },
  grandTotal: { background:'#e8f5e8', borderRadius:8, padding:'12px 14px', marginTop:12, textAlign:'center', color:'#1a4a1a' },
  cancelBtn:  { flex:1, padding:12, borderRadius:8, border:'2px solid #d1d5db', background:'white', color:'#374151', fontWeight:600, cursor:'pointer', fontSize:14 },
  saveBtn:    { flex:2, padding:12, borderRadius:8, border:'none', background:'#1a4a1a', color:'white', fontWeight:700, cursor:'pointer', fontSize:14 },
};
