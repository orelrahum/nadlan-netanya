// Geocodes Netanya deal addresses via govmap autocomplete. Resumable via cache.
const fs = require('fs');
const RAW = 'netanya_deals_raw.json';
const CACHE = 'geocode_cache.json';
const sleep = ms => new Promise(r => setTimeout(r, ms));

function merc2ll(x, y) {
  const lon = x / 20037508.34 * 180;
  let lat = y / 20037508.34 * 180;
  lat = 180 / Math.PI * (2 * Math.atan(Math.exp(lat * Math.PI / 180)) - Math.PI / 2);
  return [+lat.toFixed(6), +lon.toFixed(6)];
}

async function govmap(text) {
  try {
    const res = await fetch('https://www.govmap.gov.il/api/search-service/autocomplete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Accept-Language': 'he-IL', 'Referer': 'https://www.govmap.gov.il/', 'Origin': 'https://www.govmap.gov.il' },
      body: JSON.stringify({ searchText: text, language: 'he', isAccurate: true, maxResults: 6 })
    });
    if (!res.ok) return null;
    const j = await res.json();
    return j.results || [];
  } catch (e) { return null; }
}

function pickPoint(results, wantTypes) {
  if (!results) return null;
  for (const t of wantTypes) {
    const r = results.find(x => x.type === t && /POINT/.test(x.shape || ''));
    if (r) { const m = r.shape.match(/POINT\(([-\d.]+) ([-\d.]+)\)/); if (m) return merc2ll(+m[1], +m[2]); }
  }
  return null;
}

(async () => {
  const deals = JSON.parse(fs.readFileSync(RAW));
  let cache = {};
  try { cache = JSON.parse(fs.readFileSync(CACHE)); } catch (e) {}
  const addrs = [...new Set(deals.map(d => (d.address || '').trim()).filter(Boolean))];
  console.log('unique addresses:', addrs.length, '| cached:', Object.keys(cache).length);
  let done = 0, ok = 0, streetOk = 0, fail = 0, since = 0;
  for (const a of addrs) {
    if (cache[a] !== undefined) { done++; continue; }
    let pt = pickPoint(await govmap(a + ' נתניה'), ['address']);
    if (!pt) {
      // fallback: strip house number -> street-level
      const street = a.replace(/\s*\d+.*$/, '').trim();
      if (street) { await sleep(200); pt = pickPoint(await govmap(street + ' נתניה'), ['street', 'address']); if (pt) streetOk++; }
    } else ok++;
    cache[a] = pt; // null if not found
    if (!pt) fail++;
    done++; since++;
    if (since >= 25) { fs.writeFileSync(CACHE, JSON.stringify(cache)); since = 0; process.stdout.write(`\r  geocoded ${done}/${addrs.length} ok=${ok} street=${streetOk} fail=${fail}   `); }
    await sleep(220);
  }
  fs.writeFileSync(CACHE, JSON.stringify(cache));
  console.log(`\nDONE addresses=${addrs.length} exact=${ok} street=${streetOk} fail=${fail}`);
})();
