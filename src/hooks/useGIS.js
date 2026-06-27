import { CONFIG } from '../config';

// Search Indiana statewide parcel data by address
export async function lookupParcelByAddress(address) {
  try {
    const escaped = address.replace(/'/g, "''");
    const where = `UPPER(prop_add) LIKE UPPER('%${escaped}%')`;

    const params = new URLSearchParams({
      where,
      outFields: 'prop_add,prop_city,prop_state,prop_zip,state_parcel_id,tax_county',
      returnGeometry: false,
      resultRecordCount: 5,
      f: 'json',
    });

    const res = await fetch(`${CONFIG.INDIANA_PARCELS_URL}?${params}`);
    const data = await res.json();

    if (!data.features || data.features.length === 0) return [];

    return data.features.map(f => {
      const a = f.attributes;

      // prop_city sometimes contains "CITY, IN ZIP" all in one field — parse it out
      let city = a.prop_city || '';
      let state = a.prop_state || 'IN';
      let zip = a.prop_zip || '';

      if (city.includes(',')) {
        // e.g. "FOWLER, IN 47944"
        const parts = city.split(',');
        city = parts[0].trim();
        const stateZip = (parts[1] || '').trim().split(' ');
        if (stateZip.length >= 1 && !state) state = stateZip[0];
        if (stateZip.length >= 2 && !zip)   zip   = stateZip[1];
      }

      return {
        address:  a.prop_add || '',
        city:     toTitleCase(city),
        state:    state || 'IN',
        zip:      zip,
        parcelNo: a.state_parcel_id || '',
        county:   toTitleCase((a.tax_county || '').replace(' COUNTY', '')),
      };
    });
  } catch (e) {
    console.error('Indiana GIS lookup failed:', e);
    return [];
  }
}

function toTitleCase(str) {
  if (!str) return '';
  return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()).trim();
}
