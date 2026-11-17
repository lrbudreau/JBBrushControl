import { CONFIG } from '../config';

// Search Indiana statewide parcel data by address.
// Tries a fast "starts with" search first (403 N MON → 403 N MONROE AVE),
// then falls back to a slower "contains" search if nothing starts that way.
// Pass an AbortSignal so typing cancels the previous search.
export async function lookupParcelByAddress(address, { signal, limit = 8 } = {}) {
  const text = address.trim().replace(/\s+/g, ' ').replace(/'/g, "''").toUpperCase();
  if (!text) return [];
  try {
    let results = await queryParcels(`prop_add LIKE '${text}%'`, limit, signal);
    if (results.length === 0) {
      results = await queryParcels(`UPPER(prop_add) LIKE '%${text}%'`, limit, signal);
    }
    return results;
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    console.error('Indiana GIS lookup failed:', e);
    return [];
  }
}

async function queryParcels(where, limit, signal) {
  const params = new URLSearchParams({
    where,
    outFields: 'prop_add,prop_city,prop_state,prop_zip,state_parcel_id,tax_county',
    returnGeometry: false,
    resultRecordCount: limit,
    orderByFields: 'prop_add',
    f: 'json',
  });
  const res  = await fetch(`${CONFIG.INDIANA_PARCELS_URL}?${params}`, { signal });
  const data = await res.json();
  if (!data.features || data.features.length === 0) return [];

  const seen = new Set();
  return data.features.map(f => {
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
      zip:      zip,
      parcelNo: a.state_parcel_id || '',
      county:   toTitleCase((a.tax_county || '').replace(/ COUNTY$/i, '')),
    };
  // drop exact duplicates (same address listed for several parcels)
  }).filter(p => { const k = p.address + '|' + p.city; if (seen.has(k)) return false; seen.add(k); return true; });
}

function toTitleCase(str) {
  if (!str) return '';
  return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()).trim();
}
