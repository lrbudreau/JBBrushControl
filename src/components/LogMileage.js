import React, { useEffect, useState } from 'react';
import { api, getUser } from '../api';
import { toast } from './Toast';
import { CONFIG } from '../config';

export default function LogMileage({ onClose }) {
  const user = getUser();
  const [equipment, setEquip]   = useState([]);
  const [jobs, setJobs]         = useState([]);
  const [saving, setSaving]     = useState(false);
  const [calculating, setCalc]  = useState(false);

  // Mileage entries: each is { equipmentID, pointA, pointB, miles, rounds, totalMiles, jobID, division, purpose }
  const [date, setDate] = useState(today());
  const [entries, setEntries] = useState([blankEntry()]);

  useEffect(() => {
    Promise.all([api('getEquipment'), api('getJobs')]).then(([e, j]) => {
      if (e.status === 'ok') setEquip(e.data.filter(x => ['Truck', 'Trailer'].includes(x.Type)));
      if (j.status === 'ok') setJobs(j.data);
    });
  }, []);

  function blankEntry() {
    return { equipmentID: '', pointA: '', pointB: '', miles: '', rounds: 1, totalMiles: '', jobID: '', division: 'Spray', purpose: '', truckName: '' };
  }

  const updateEntry = (i, field, val) => {
    setEntries(entries => entries.map((e, idx) => {
      if (idx !== i) return e;
      const next = { ...e, [field]: val };
      if (field === 'equipmentID') {
        const eq = equipment.find(x => x.EquipmentID === val);
        if (eq) next.truckName = eq.Name;
      }
      // Recalculate total when miles or rounds changes
      if (field === 'miles' || field === 'rounds') {
        const m = field === 'miles' ? parseFloat(val) : parseFloat(next.miles);
        const r = field === 'rounds' ? parseInt(val) : parseInt(next.rounds);
        if (m && r) next.totalMiles = (m * r).toFixed(1);
      }
      return next;
    }));
  };

  const calculateDistance = async (i) => {
    const entry = entries[i];
    if (!entry.pointA || !entry.pointB) return toast('Enter both Point A and Point B', 'error');
    setCalc(i);

    try {
      // Use Google Maps Distance Matrix API
      const origin = encodeURIComponent(entry.pointA + ', Indiana');
      const dest   = encodeURIComponent(entry.pointB + ', Indiana');
      const url    = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${origin}&destinations=${dest}&units=imperial&key=${CONFIG.GOOGLE_API_KEY}`;

      // We can't call this directly due to CORS — use a proxy approach via the app
      // Instead use the Directions API which works from browser
      const directionsUrl = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin}&destination=${dest}&key=${CONFIG.GOOGLE_API_KEY}`;

      const res  = await fetch(directionsUrl);
      const data = await res.json();

      if (data.status === 'OK' && data.routes?.length > 0) {
        const meters = data.routes[0].legs[0].distance.value;
        const miles  = (meters / 1609.344).toFixed(1);
        updateEntry(i, 'miles', miles);
        toast(`${miles} miles calculated ✅`);
      } else {
        // Fallback: try a simpler geocode approach
        await calculateDistanceFallback(i, entry);
      }
    } catch (e) {
      await calculateDistanceFallback(i, entry);
    }
    setCalc(null);
  };

  const calculateDistanceFallback = async (i, entry) => {
    try {
      // Use Maps Embed / Geocoding as fallback
      const geocodeA = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(entry.pointA + ', Indiana')}&key=${CONFIG.GOOGLE_API_KEY}`);
      const dataA    = await geocodeA.json();
      const geocodeB = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(entry.pointB + ', Indiana')}&key=${CONFIG.GOOGLE_API_KEY}`);
      const dataB    = await geocodeB.json();

      if (dataA.status === 'OK' && dataB.status === 'OK') {
        const locA = dataA.results[0].geometry.location;
        const locB = dataB.results[0].geometry.location;
        // Haversine formula for straight-line distance (multiply by 1.25 for road estimate)
        const R    = 3958.8; // Earth radius in miles
        const dLat = (locB.lat - locA.lat) * Math.PI / 180;
        const dLon = (locB.lng - locA.lng) * Math.PI / 180;
        const a    = Math.sin(dLat/2)**2 + Math.cos(locA.lat*Math.PI/180) * Math.cos(locB.lat*Math.PI/180) * Math.sin(dLon/2)**2;
        const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        const roadMiles = (dist * 1.25).toFixed(1); // road distance estimate
        updateEntry(i, 'miles', roadMiles);
        toast(`~${roadMiles} miles (estimated) ✅`);
      } else {
        toast('Could not calculate — enter miles manually', 'info');
      }
    } catch (e) {
      toast('Could not calculate — enter miles manually', 'info');
    }
  };

  const openInMaps = (i) => {
    const entry = entries[i];
    if (!entry.pointA || !entry.pointB) return;
    const url = `https://www.google.com/maps/dir/${encodeURIComponent(entry.pointA + ', Indiana')}/${encodeURIComponent(entry.pointB + ', Indiana')}`;
    window.open(url, '_blank');
  };

  const save = async () => {
    const valid = entries.filter(e => e.equipmentID && (e.totalMiles || e.miles));
    if (valid.length === 0) return toast('Select a truck and enter mileage for at least one entry', 'error');

    setSaving(true);
    let count = 0;
    for (const entry of valid) {
      const miles = parseFloat(entry.totalMiles || entry.miles) || 0;
      const r = await api('addMileage', {}, {
        Date:        date,
        EquipmentID: entry.equipmentID,
        TruckName:   entry.truckName,
        JobID:       entry.jobID || '',
        StartMiles:  0,
        EndMiles:    0,
        TotalMiles:  miles,
        Purpose:     entry.purpose || (entry.pointA && entry.pointB ? `${entry.pointA} → ${entry.pointB}` : ''),
        Division:    entry.division,
        PointA:      entry.pointA || '',
        PointB:      entry.pointB || '',
        Rounds:      parseInt(entry.rounds) || 1,
      });
      if (r.status === 'ok') count++;
    }
    if (count > 0) { toast(`${count} mileage entr${count > 1 ? 'ies' : 'y'} logged ✅`); onClose(); }
    else toast('Failed to save mileage', 'error');
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: '#1a4a1a' }}>Trip {i + 1}</div>
                {entries.length > 1 && (
                  <button onClick={() => setEntries(e => e.filter((_, idx) => idx !== i))} style={S.removeBtn}>Remove</button>
                )}
              </div>

              <div style={S.label}>Truck *</div>
              <select style={S.input} value={entry.equipmentID} onChange={e => updateEntry(i, 'equipmentID', e.target.value)}>
                <option value="">— Select truck —</option>
                {equipment.map(e => <option key={e.EquipmentID} value={e.EquipmentID}>{e.Name}</option>)}
              </select>

              <div style={S.label}>Division</div>
              <select style={S.input} value={entry.division} onChange={e => updateEntry(i, 'division', e.target.value)}>
                <option>Spray</option><option>Tree</option>
              </select>

              {/* Point A to B */}
              <div style={S.label}>Point A (from)</div>
              <input style={S.input} placeholder="e.g. 403 N Monroe Ave, Fowler" value={entry.pointA}
                onChange={e => updateEntry(i, 'pointA', e.target.value)} />

              <div style={S.label}>Point B (to)</div>
              <input style={S.input} placeholder="e.g. Job site, home, dump" value={entry.pointB}
                onChange={e => updateEntry(i, 'pointB', e.target.value)} />

              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button style={S.calcBtn} onClick={() => calculateDistance(i)} disabled={calculating === i}>
                  {calculating === i ? '…' : '📍 Calculate'}
                </button>
                <button style={S.mapsBtn} onClick={() => openInMaps(i)}>
                  🗺 Open in Maps
                </button>
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <div style={{ flex: 1 }}>
                  <div style={S.label}>One-way miles</div>
                  <input style={S.input} type="number" inputMode="decimal" placeholder="0.0"
                    value={entry.miles} onChange={e => updateEntry(i, 'miles', e.target.value)} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={S.label}>Rounds (trips)</div>
                  <input style={S.input} type="number" inputMode="numeric" min="1" placeholder="1"
                    value={entry.rounds} onChange={e => updateEntry(i, 'rounds', e.target.value)} />
                </div>
              </div>

              {/* Total for this entry */}
              {(entry.miles || entry.totalMiles) && (
                <div style={S.entryTotal}>
                  {entry.miles} mi × {entry.rounds} round{entry.rounds > 1 ? 's' : ''} = <strong>{entry.totalMiles || entry.miles} miles</strong>
                </div>
              )}

              <div style={S.label}>Job (optional)</div>
              <select style={S.input} value={entry.jobID} onChange={e => updateEntry(i, 'jobID', e.target.value)}>
                <option value="">—</option>
                {jobs.map(j => <option key={j.JobID} value={j.JobID}>{j.CustomerName} — {j.Description?.slice(0, 30)}</option>)}
              </select>

              <div style={S.label}>Purpose / Notes</div>
              <input style={S.input} placeholder="e.g. Dumping brush, supply run" value={entry.purpose}
                onChange={e => updateEntry(i, 'purpose', e.target.value)} />
            </div>
          ))}

          <button style={S.addBtn} onClick={() => setEntries(e => [...e, blankEntry()])}>
            + Add another trip
          </button>

          {grandTotal > 0 && (
            <div style={S.grandTotal}>
              Total miles today: <strong>{grandTotal.toFixed(1)}</strong>
              <div style={{ fontSize: 12, color: '#4a9e4a', marginTop: 2 }}>
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

function today() { return new Date().toISOString().split('T')[0]; }

const S = {
  overlay:    { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 300, display: 'flex', alignItems: 'flex-end' },
  sheet:      { background: 'white', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 480, margin: '0 auto', maxHeight: '94vh', display: 'flex', flexDirection: 'column', animation: 'slideUp 0.25s ease' },
  handle:     { width: 40, height: 4, background: '#d1d5db', borderRadius: 99, margin: '10px auto 0', flexShrink: 0 },
  header:     { padding: '12px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #f3f4f6', flexShrink: 0 },
  closeBtn:   { background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#6b7280' },
  body:       { padding: '14px 18px', overflowY: 'auto', flex: 1 },
  footer:     { padding: '12px 18px 24px', display: 'flex', gap: 10, borderTop: '1px solid #f3f4f6', flexShrink: 0 },
  label:      { fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4, marginTop: 10 },
  input:      { width: '100%', minHeight: 46, padding: '10px 12px', border: '2px solid #d1d5db', borderRadius: 8, fontSize: 15, fontFamily: 'inherit', background: 'white' },
  entryCard:  { background: '#f9fafb', borderRadius: 10, padding: '12px 14px', marginBottom: 10, border: '1px solid #e5e7eb' },
  removeBtn:  { background: 'none', border: 'none', color: '#dc2626', fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  calcBtn:    { flex: 1, padding: '9px 12px', borderRadius: 8, border: 'none', background: '#1a4a1a', color: 'white', fontWeight: 600, fontSize: 13, cursor: 'pointer' },
  mapsBtn:    { flex: 1, padding: '9px 12px', borderRadius: 8, border: '2px solid #d1d5db', background: 'white', color: '#374151', fontWeight: 600, fontSize: 13, cursor: 'pointer' },
  entryTotal: { background: '#e8f5e8', borderRadius: 6, padding: '8px 12px', marginTop: 8, fontSize: 13, color: '#1a4a1a', textAlign: 'center' },
  addBtn:     { display: 'block', width: '100%', padding: 11, border: '2px dashed #2d6a2d', borderRadius: 8, background: 'transparent', color: '#2d6a2d', fontSize: 14, fontWeight: 600, cursor: 'pointer', marginTop: 4 },
  grandTotal: { background: '#e8f5e8', borderRadius: 8, padding: '12px 14px', marginTop: 12, textAlign: 'center', fontSize: 15, color: '#1a4a1a' },
  cancelBtn:  { flex: 1, padding: 12, borderRadius: 8, border: '2px solid #d1d5db', background: 'white', color: '#374151', fontWeight: 600, cursor: 'pointer', fontSize: 14 },
  saveBtn:    { flex: 2, padding: 12, borderRadius: 8, border: 'none', background: '#1a4a1a', color: 'white', fontWeight: 700, cursor: 'pointer', fontSize: 14 },
};
