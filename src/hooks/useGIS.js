import { CONFIG } from '../config';

// Search Indiana statewide parcel data by address, as you type.
//
// Speed notes (measured Nov 2026): the state's parcel layer has no index on
// the address column, so the server checks parcels one by one until it has
// enough matches. A "starts with" search with NO sorting stops early and takes
// 0.1–1 s. Asking the server to sort (orderByFields) or to filter by map area
// forces it to check all ~3.7 million parcels: 7–11 s. So: no server sorting;
// we grab up to 40 matches and sort them ourselves, nearest to the phone first.
//
// near: { lat, lon } (optional) — put the closest matches first
// Remembers the last search that returned EVERY match (fewer than 40), so
// typing more letters just filters those on the phone — instant, no new search.
let complete = null;   // { text, items }

export async function lookupParcelByAddress(address, { signal, limit = 8, near = null } = {}) {
  const raw  = address.trim().replace(/\s+/g, ' ').toUpperCase();
  const text = raw.replace(/'/g, "''");
  if (!text) return [];
  try {
    let results;
    if (complete && raw.startsWith(complete.text)) {
      results = complete.items.filter(p => p.address.toUpperCase().startsWith(raw)).map(p => ({ ...p }));
    } else {
      results = await queryParcels(`prop_add LIKE '${text}%'`, signal);
      complete = results.full ? { text: raw, items: results } : null;
    }
    // Nothing starts that way: try "contains" (slower, ~2 s), only once they've typed enough
    if (results.length === 0 && text.length >= 6) {
      results = await queryParcels(`UPPER(prop_add) LIKE '%${text}%'`, signal);
    }
    if (near) {
      results.forEach(r => { r.miles = (r.lat && r.lon) ? milesBetween(near.lat, near.lon, r.lat, r.lon) : null; });
      results.sort((x, y) => (x.miles ?? 1e9) - (y.miles ?? 1e9));
    }
    return results.slice(0, limit);
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    console.error('Indiana GIS lookup failed:', e);
    return [];
  }
}

async function queryParcels(where, signal) {
  const params = new URLSearchParams({
    where,
    outFields: 'prop_add,prop_city,prop_state,prop_zip,state_parcel_id,tax_county,latitude,longitude',
    returnGeometry: false,
    resultRecordCount: 40,
    f: 'json',
  });
  const res  = await fetch(`${CONFIG.INDIANA_PARCELS_URL}?${params}`, { signal });
  const data = await res.json();
  if (!data.features || data.features.length === 0) { const none = []; none.full = !data.error; return none; }

  const seen = new Set();
  const list = data.features.map(f => {
    const a = f.attributes;

    // prop_city sometimes contains "CITY, IN ZIP" all in one field — parse it out
    let city  = a.prop_city || '';
    let state = a.prop_state || '';
    let zip   = a.prop_zip || '';

    if (city.includes(',')) {
      // e.g. "FOWLER, IN 47944"
      const parts = city.split(',');
      city = parts[0].trim();
      const stateZip = (parts[1] || '').trim().split(/\s+/);
      if (stateZip.length >= 1 && !state) state = stateZip[0];
      if (stateZip.length >= 2 && !zip)   zip   = stateZip[1];
    }

    return {
      address:  toTitleCase(a.prop_add || ''),
      city:     toTitleCase(city),
      state:    state || 'IN',
      zip:      (zip || '').slice(0, 5),
      parcelNo: a.state_parcel_id || '',
      county:   toTitleCase((a.tax_county || '').replace(/ COUNTY$/i, '')),
      lat:      a.latitude,
      lon:      a.longitude,
    };
  // drop exact duplicates (same address listed for several parcels)
  }).filter(p => { const k = p.address + '|' + p.city; if (seen.has(k)) return false; seen.add(k); return true; });
  list.full = data.features.length < 40 && !data.exceededTransferLimit;   // got every match
  return list;
}

// One tiny search to wake the state's server up before they start typing
export function warmUpParcelSearch() {
  const params = new URLSearchParams({ where: "prop_add LIKE '1 %'", outFields: 'prop_add', returnGeometry: false, resultRecordCount: 1, f: 'json' });
  fetch(`${CONFIG.INDIANA_PARCELS_URL}?${params}`).catch(() => {});
}

function milesBetween(lat1, lon1, lat2, lon2) {
  const R = 3958.8, rad = d => d * Math.PI / 180;
  const dLat = rad(lat2 - lat1), dLon = rad(lon2 - lon1);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Ask the phone where it is (once), to list nearby addresses first.
// Resolves to { lat, lon } or null if they say no / it isn't available.
export function getHereOnce() {
  return new Promise(resolve => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 10 * 60 * 1000 }
    );
  });
}

function toTitleCase(str) {
  if (!str) return '';
  return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()).trim();
}
