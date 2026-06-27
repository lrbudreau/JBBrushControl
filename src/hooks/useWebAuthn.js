import { CONFIG } from '../config';

// Search Indiana statewide parcel data by address
export async function lookupParcelByAddress(address) {
  try {
    const params = new URLSearchParams({
      where: `UPPER(SITUS_ADDRESS) LIKE UPPER('%${address.replace(/'/g, "''")}%')`,
      outFields: 'OWNER_NAME,SITUS_ADDRESS,SITUS_CITY,SITUS_STATE,SITUS_ZIP,STATE_PARCEL_NO,COUNTY_NAME',
      returnGeometry: false,
      resultRecordCount: 5,
      f: 'json',
    });

    const res = await fetch(`${CONFIG.INDIANA_PARCELS_URL}?${params}`);
    const data = await res.json();

    if (!data.features || data.features.length === 0) return [];

    return data.features.map(f => ({
      ownerName:   f.attributes.OWNER_NAME   || '',
      address:     f.attributes.SITUS_ADDRESS || '',
      city:        f.attributes.SITUS_CITY    || '',
      state:       f.attributes.SITUS_STATE   || 'IN',
      zip:         f.attributes.SITUS_ZIP     || '',
      parcelNo:    f.attributes.STATE_PARCEL_NO || '',
      county:      f.attributes.COUNTY_NAME   || '',
    }));
  } catch (e) {
    console.error('Indiana GIS lookup failed:', e);
    return [];
  }
}

// Clean up owner name formatting (GIS data is often ALL CAPS)
export function formatOwnerName(name) {
  if (!name) return '';
  return name.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()).trim();
}
