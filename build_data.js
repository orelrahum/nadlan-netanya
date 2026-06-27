// Builds site data files from harvested deals + geocode caches + amenities.
// All deals come from the official government registry (nadlan.gov.il, Netanya 7400).
const fs = require('fs');

const CUTOFF = '2023-06-21';
// Netanya bounding box (filters out wrong same-named geocodes elsewhere).
const BBOX = { latMin: 32.255, latMax: 32.375, lonMin: 34.825, lonMax: 34.905 };
const inBox = (lat, lon) => lat >= BBOX.latMin && lat <= BBOX.latMax && lon >= BBOX.lonMin && lon <= BBOX.lonMax;

const raw = JSON.parse(fs.readFileSync('netanya_deals_raw.json'));
let cache = {}, neigh = {};
try { cache = JSON.parse(fs.readFileSync('geocode_cache.json')); } catch (e) {}
try { neigh = JSON.parse(fs.readFileSync('neigh_cache.json')); } catch (e) {}
const amenities = JSON.parse(fs.readFileSync('netanya_amenities.json'));

// ----- categorize each transaction by its government "deal nature" -----
const CAT = {
  apartment: { he: 'דירה', residential: true },
  garden:    { he: 'דירת גן', residential: true },
  penthouse: { he: 'פנטהאוז / דירת גג', residential: true },
  house:     { he: "קוטג' / בית פרטי", residential: true },
  vacation:  { he: 'דירת נופש', residential: true },
  commercial:{ he: 'מסחרי (משרד/חנות)', residential: false },
  parking:   { he: 'חניה', residential: false },
  storage:   { he: 'מחסן', residential: false },
  land:      { he: 'קרקע', residential: false },
  other:     { he: 'אחר / לא מסווג', residential: false }
};
function categorize(d) {
  const n = (d.dealNature || '').trim();
  const addr = (d.address || '').trim();
  if (!n) {
    // Records registered without a nature (incl. new-project pre-sales): treat as a
    // residential apartment only when the area looks like a real dwelling; otherwise "other".
    const a = +d.assetArea || 0;
    return (a >= 20 && a <= 400) ? 'apartment' : 'other';
  }
  if (n.includes('פנטהאוז') || n.includes('גג')) return 'penthouse';
  if (n.includes('דירת גן')) return 'garden';
  if (n.includes('קוטג') || n.includes('בית בודד') || n.includes('משפחתי')) return 'house';
  if (n.includes('נופש')) return 'vacation';
  if (n.includes('דירה')) return 'apartment';
  if (n.includes('משרד') || n.includes('חנות') || n.includes('מסחר')) return 'commercial';
  if (n.includes('חניה')) return 'parking';
  if (n.includes('מחסן')) return 'storage';
  if (n.includes('קרקע') || n.includes('מעובדת') || n.includes('תיכנון') || n.includes('תכנון')) return 'land';
  return 'other';
}

const seen = new Set();
const deals = [];
let exact = 0, approx = 0, unplaced = 0;
const jitterCount = {};
function jitter(lat, lon, baseR) {
  const ck = lat.toFixed(5) + ',' + lon.toFixed(5);
  const k = (jitterCount[ck] = (jitterCount[ck] || 0) + 1);
  if (k === 1 && baseR === 0) return [lat, lon];
  const ang = k * 2.399963, r = (baseR || 0.00012) * Math.sqrt(k);
  return [+(lat + r * Math.cos(ang)).toFixed(6), +(lon + r * Math.sin(ang)).toFixed(6)];
}

for (const d of raw) {
  if (!d.dealDate || d.dealDate < CUTOFF) continue;
  const key = d.assetId + '_' + d.row_id + '_' + d.dealDate + '_' + d.dealAmount;
  if (seen.has(key)) continue;
  seen.add(key);

  const addr = (d.address || '').trim();
  const cat = categorize(d);
  const residential = CAT[cat].residential;

  // location: exact address > neighborhood centroid (approx)
  let lat = null, lon = null, ap = 0;
  const pt = cache[addr];
  if (Array.isArray(pt) && inBox(pt[0], pt[1])) {
    [lat, lon] = jitter(pt[0], pt[1], 0.00012); exact++;
  } else {
    const np = d.neighborhoodName ? neigh[d.neighborhoodName] : null;
    if (Array.isArray(np) && inBox(np[0], np[1])) { [lat, lon] = jitter(np[0], np[1], 0.0011); ap = 1; approx++; }
    else { unplaced++; }
  }

  // price per m^2 only meaningful for residential with a sane area
  let pm = 0;
  const area = +d.assetArea || 0;
  if (residential && area >= 20 && d.dealAmount > 0) {
    pm = d.priceSM || Math.round(d.dealAmount / area);
  }

  deals.push({
    a: addr && addr !== '0' ? addr : (d.neighborhoodName || ''),
    nb: d.neighborhoodName || '',
    dt: d.dealDate,
    p: d.dealAmount || 0,
    r: d.roomNum || 0,
    ar: area,
    fl: d.floor || '',
    y: d.yearBuilt || 0,
    pm,
    nt: d.dealNature || (addr === '0' ? 'דירה (פרויקט חדש)' : ''),
    cat, ap, lat, lon
  });
}

// ----- stats -----
function pct(arr, p) { if (!arr.length) return 0; const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; }
function median(arr) { return pct(arr, 0.5); }
const resDeals = deals.filter(d => CAT[d.cat].residential);
const resPrices = resDeals.map(d => d.p).filter(Boolean);
const resPpsm = resDeals.map(d => d.pm).filter(Boolean);
const dates = deals.map(d => d.dt).sort();

// clamp the colour scale to the residential 10th–90th percentile of ₪/m²
const pmLow = Math.max(10000, Math.round(pct(resPpsm, 0.10) / 1000) * 1000);
const pmHigh = Math.min(60000, Math.round(pct(resPpsm, 0.90) / 1000) * 1000);

const catCounts = {};
for (const d of deals) catCounts[d.cat] = (catCounts[d.cat] || 0) + 1;
const amenityCounts = {};
for (const a of amenities) amenityCounts[a.cat] = (amenityCounts[a.cat] || 0) + 1;

const meta = {
  generated: new Date().toISOString(), city: 'נתניה', settlementCode: 7400,
  totalDeals: deals.length,
  residentialDeals: resDeals.length,
  mappedDeals: exact + approx, exactDeals: exact, approxDeals: approx, unplacedDeals: unplaced,
  dateFrom: dates[0] || CUTOFF, dateTo: dates[dates.length - 1] || '',
  medianPrice: median(resPrices), medianPpsm: median(resPpsm),
  pmLow, pmHigh,
  catCounts, catLabels: Object.fromEntries(Object.entries(CAT).map(([k, v]) => [k, v.he])),
  catResidential: Object.fromEntries(Object.entries(CAT).map(([k, v]) => [k, v.residential])),
  amenityCount: amenities.length, amenityCounts,
  source: 'אתר הנדל"ן הממשלתי · nadlan.gov.il'
};

fs.mkdirSync('data', { recursive: true });
fs.writeFileSync('data/deals.json', JSON.stringify(deals));
fs.writeFileSync('data/amenities.json', JSON.stringify(amenities));
fs.writeFileSync('data/meta.json', JSON.stringify(meta, null, 2));
console.log('deals:', deals.length, '| residential:', resDeals.length, '| exact:', exact, '| approx:', approx, '| unplaced:', unplaced);
console.log('categories:', JSON.stringify(catCounts));
console.log('date range:', meta.dateFrom, '->', meta.dateTo);
console.log('median price:', meta.medianPrice, '| median ₪/m²:', meta.medianPpsm, '| scale:', pmLow, '-', pmHigh);
