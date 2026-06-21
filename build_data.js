// Builds site data files from harvested deals + geocode caches + amenities.
const fs = require('fs');

const CUTOFF = '2023-06-21';
// Netanya bounding box (filters out wrong same-named geocodes elsewhere)
const BBOX = { latMin: 32.255, latMax: 32.375, lonMin: 34.825, lonMax: 34.905 };
const inBox = (lat, lon) => lat >= BBOX.latMin && lat <= BBOX.latMax && lon >= BBOX.lonMin && lon <= BBOX.lonMax;

const raw = JSON.parse(fs.readFileSync('netanya_deals_raw.json'));
let cache = {}, neigh = {};
try { cache = JSON.parse(fs.readFileSync('geocode_cache.json')); } catch (e) {}
try { neigh = JSON.parse(fs.readFileSync('neigh_cache.json')); } catch (e) {}
const amenities = JSON.parse(fs.readFileSync('netanya_amenities.json'));

const seen = new Set();
const deals = [];
let exact = 0, approx = 0;
const jitterCount = {};
function jitter(lat, lon, baseR) {
  const ck = lat.toFixed(5) + ',' + lon.toFixed(5);
  const n = (jitterCount[ck] = (jitterCount[ck] || 0) + 1);
  if (n === 1 && baseR === 0) return [lat, lon];
  const ang = n * 2.399963, r = (baseR || 0.00012) * Math.sqrt(n);
  return [+(lat + r * Math.cos(ang)).toFixed(6), +(lon + r * Math.sin(ang)).toFixed(6)];
}

for (const d of raw) {
  if (!d.dealDate || d.dealDate < CUTOFF) continue;
  const key = d.assetId + '_' + d.row_id + '_' + d.dealDate + '_' + d.dealAmount;
  if (seen.has(key)) continue;
  seen.add(key);

  const addr = (d.address || '').trim();
  let lat = null, lon = null, ap = 0;
  const pt = cache[addr];
  if (Array.isArray(pt) && inBox(pt[0], pt[1])) {
    [lat, lon] = jitter(pt[0], pt[1], 0.00012); exact++;
  } else {
    const np = d.neighborhoodName ? neigh[d.neighborhoodName] : null;
    if (Array.isArray(np) && inBox(np[0], np[1])) {
      [lat, lon] = jitter(np[0], np[1], 0.0009); ap = 1; approx++;
    }
  }

  deals.push({
    a: addr === '0' ? (d.neighborhoodName || '') : addr,
    nb: d.neighborhoodName || '',
    dt: d.dealDate,
    p: d.dealAmount || 0,
    r: d.roomNum || 0,
    ar: d.assetArea || 0,
    fl: d.floor || '',
    y: d.yearBuilt || 0,
    pm: d.priceSM || (d.assetArea ? Math.round(d.dealAmount / d.assetArea) : 0),
    nt: d.dealNature || '',
    ap, lat, lon
  });
}

function median(arr) { if (!arr.length) return 0; const s = [...arr].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); }
const prices = deals.map(d => d.p).filter(Boolean);
const ppsms = deals.map(d => d.pm).filter(Boolean);
const dates = deals.map(d => d.dt).sort();
const amenityCounts = {};
for (const a of amenities) amenityCounts[a.cat] = (amenityCounts[a.cat] || 0) + 1;

const meta = {
  generated: new Date().toISOString(), city: 'נתניה',
  totalDeals: deals.length,
  mappedDeals: exact + approx, exactDeals: exact, approxDeals: approx,
  dateFrom: dates[0] || CUTOFF, dateTo: dates[dates.length - 1] || '',
  medianPrice: median(prices), medianPpsm: median(ppsms),
  amenityCount: amenities.length, amenityCounts
};

fs.mkdirSync('data', { recursive: true });
fs.writeFileSync('data/deals.json', JSON.stringify(deals));
fs.writeFileSync('data/amenities.json', JSON.stringify(amenities));
fs.writeFileSync('data/meta.json', JSON.stringify(meta, null, 2));
console.log('deals:', deals.length, '| exact:', exact, '| approx(neigh):', approx, '| amenities:', amenities.length);
console.log('date range:', meta.dateFrom, '->', meta.dateTo);
console.log('median price:', meta.medianPrice, '| median ₪/m²:', meta.medianPpsm);
