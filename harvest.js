// Resumable Netanya deal harvester.
//
// nadlan.gov.il is protected by reCAPTCHA Enterprise and a strict per-IP rate
// limit. This script drives the real site headlessly: it clears sessionStorage to
// force a fresh reCAPTCHA token on each cycle, reads that token, then signs and
// sends deal-data requests for the next page (the signing scheme is reproduced
// from the site's client code). It checkpoints every page to netanya_deals_raw.json
// so it can be stopped/resumed and gradually extends history backwards.
//
// Env: COOLDOWN (ms initial quiet period), PACE (ms between fetches).
const puppeteer = require('puppeteer-core'), fs = require('fs');
const CUTOFF = '2023-06-21';
const URL = 'https://www.nadlan.gov.il/?view=settlement&id=7400&page=deals';
const RAW = 'netanya_deals_raw.json';
const COOLDOWN = Number(process.env.COOLDOWN || 0);
const PACE = Number(process.env.PACE || 75000);
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Runs inside the page: signs and sends one deal-data request, returns parsed JSON.
const FETCH_FN = async (n, token) => {
  const SECRET = "90c3e620192348f1bd46fcd9138c3c68", DOMAIN = location.hostname;
  const b64 = b => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const b64s = s => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  async function hmac(d) { const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']); return b64(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(d))); }
  async function jwt(p) { const d = b64s(JSON.stringify({ alg: 'HS256' })) + '.' + b64s(JSON.stringify(p)); return d + '.' + await hmac(d); }
  async function dz(t) { if (typeof t === 'string' && t.startsWith('H4sI')) { let s = t; while (s.length % 4) s += '='; const bin = atob(s); const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return await new Response(new Blob([a]).stream().pipeThrough(new DecompressionStream('gzip'))).text(); } return t; }
  const now = Math.floor(Date.now() / 1000);
  const pl = { base_id: "7400", base_name: "settlmentID", fetch_number: n, type_order: "dealDate_down", sk: await jwt({ domain: DOMAIN, exp: now + 120 }), token };
  const signed = await jwt({ ...pl, exp: now + 120, domain: DOMAIN });
  const res = await fetch('https://api.nadlan.gov.il/deal-data', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ '##': signed.split('').reverse().join('') }) });
  const j = JSON.parse(await dz(await res.text())); const items = (j.data && j.data.items) || [];
  return { statusCode: j.statusCode, total: j.data && j.data.total_rows, count: items.length, items };
};

function load() { try { return new Map(JSON.parse(fs.readFileSync(RAW)).map(d => [d.assetId + '_' + d.row_id + '_' + d.dealDate, d])); } catch (e) { return new Map(); } }
function save(m) { const a = [...m.values()].filter(d => d.dealDate >= CUTOFF).sort((x, y) => y.dealDate.localeCompare(x.dealDate)); fs.writeFileSync(RAW, JSON.stringify(a)); return a; }

(async () => {
  const map = load();
  let target = Math.max(1, Math.floor(map.size / 500));
  console.log(`harvest: resume=${map.size} startPage=${target} COOLDOWN=${COOLDOWN / 1000}s PACE=${PACE / 1000}s`);
  const browser = await puppeteer.launch({ executablePath: '/usr/bin/chromium', headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36');

  async function freshToken() {
    for (let a = 0; a < 6; a++) {
      try { await page.goto(URL, { waitUntil: 'networkidle2', timeout: 90000 }); } catch (e) {}
      await sleep(6000);
      const t = await page.evaluate(() => { const x = sessionStorage.getItem('recaptchaServerToken'); return x ? x.replace(/"/g, '') : null; }).catch(() => null);
      if (t) return t;
      await sleep(5000);
    }
    return null;
  }

  if (COOLDOWN) { console.log(`cooldown ${COOLDOWN / 1000}s...`); await sleep(COOLDOWN); }
  let token = await freshToken();
  console.log('token', token ? token.slice(0, 8) : 'NONE');
  let consec403 = 0;

  while (target <= 140) {
    // One backend request per cycle: reuse the valid token, reload only when needed.
    let res; try { res = await page.evaluate(FETCH_FN, target, token); } catch (e) { res = { statusCode: -2 }; }
    if (res.statusCode === 403) {
      consec403++;
      const wait = PACE + consec403 * 30000;
      console.log(`p${target} 403 (#${consec403}) backoff ${Math.round(wait / 1000)}s`);
      await sleep(wait);
      if (consec403 % 4 === 0) { console.log('refreshing token'); token = await freshToken(); }
      continue;
    }
    if (res.statusCode === 405 || res.statusCode < 0) {
      console.log(`p${target} st=${res.statusCode} -> refresh token`);
      token = await freshToken(); await sleep(8000); continue;
    }
    if (res.count === 0) { console.log(`p${target} empty total=${res.total} DONE`); break; }
    consec403 = 0;
    let added = 0; for (const it of res.items) { const k = it.assetId + '_' + it.row_id + '_' + it.dealDate; if (!map.has(k)) added++; map.set(k, it); }
    const last = res.items[res.items.length - 1].dealDate; const arr = save(map);
    console.log(`p${target} OK new=${added} last=${last} have3y=${arr.length} total=${res.total}`);
    if (last < CUTOFF) { console.log('cutoff reached'); break; }
    target++;
    await sleep(PACE);
  }
  const arr = save(map);
  console.log('COMPLETE have3y=', arr.length, 'oldest=', arr.length ? arr[arr.length - 1].dealDate : '-');
  await browser.close();
})().catch(e => console.error('FATAL', e.message));
