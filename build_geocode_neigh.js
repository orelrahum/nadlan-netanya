// Geocodes Netanya neighborhood names (fallback for deals without a street address).
const fs = require('fs');
const sleep = ms => new Promise(r => setTimeout(r, ms));
function merc2ll(x, y) { const lon = x / 20037508.34 * 180; let lat = y / 20037508.34 * 180; lat = 180 / Math.PI * (2 * Math.atan(Math.exp(lat * Math.PI / 180)) - Math.PI / 2); return [+lat.toFixed(6), +lon.toFixed(6)]; }
async function govmap(text) {
  try {
    const res = await fetch('https://www.govmap.gov.il/api/search-service/autocomplete', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Accept-Language': 'he-IL', 'Referer': 'https://www.govmap.gov.il/', 'Origin': 'https://www.govmap.gov.il' },
      body: JSON.stringify({ searchText: text, language: 'he', isAccurate: false, maxResults: 8 })
    });
    if (!res.ok) return null; const j = await res.json(); return j.results || [];
  } catch (e) { return null; }
}
function pick(results, types) {
  if (!results) return null;
  for (const t of types) { const r = results.find(x => x.type === t && /POINT/.test(x.shape || '')); if (r) { const m = r.shape.match(/POINT\(([-\d.]+) ([-\d.]+)\)/); if (m) return merc2ll(+m[1], +m[2]); } }
  return null;
}
const cleanName = n => (n || '').split(' - ')[0].replace(/["']/g, '').trim();

(async () => {
  const raw = JSON.parse(fs.readFileSync('netanya_deals_raw.json'));
  let cache = {}; try { cache = JSON.parse(fs.readFileSync('neigh_cache.json')); } catch (e) {}
  const names = [...new Set(raw.filter(d => (d.address || '').trim() === '0' && d.neighborhoodName).map(d => d.neighborhoodName))];
  console.log('neighborhoods to geocode:', names.length);
  for (const full of names) {
    if (cache[full] !== undefined) continue;
    const clean = cleanName(full);
    let pt = pick(await govmap(clean + ' נתניה'), ['neighborhood', 'poi', 'street', 'address']);
    cache[full] = pt;
    console.log((pt ? 'OK  ' : 'MISS'), full, '->', clean, pt ? pt.join(',') : '');
    fs.writeFileSync('neigh_cache.json', JSON.stringify(cache));
    await sleep(250);
  }
  console.log('done. geocoded:', Object.values(cache).filter(Boolean).length, '/', names.length);
})();
