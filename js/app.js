'use strict';

/* ---------- amenity category metadata ---------- */
const AM = {
  school:      { he: 'בתי ספר',        ic: '🏫', color: '#3b82f6' },
  kindergarten:{ he: 'גני ילדים',      ic: '🧸', color: '#f59e0b' },
  college:     { he: 'מכללות',         ic: '🎓', color: '#6366f1' },
  supermarket: { he: 'סופרמרקטים',     ic: '🛒', color: '#16a34a' },
  minimarket:  { he: 'מינימרקטים',     ic: '🏪', color: '#22c55e' },
  grocery:     { he: 'ירקנים',         ic: '🥬', color: '#65a30d' },
  bakery:      { he: 'מאפיות',         ic: '🥐', color: '#d97706' },
  butcher:     { he: 'אטליזים',        ic: '🥩', color: '#dc2626' },
  mall:        { he: 'קניונים/שווקים', ic: '🛍️', color: '#db2777' },
  pharmacy:    { he: 'בתי מרקחת',      ic: '💊', color: '#ef4444' },
  clinic:      { he: 'מרפאות',         ic: '🩺', color: '#0ea5e9' },
  hospital:    { he: 'בתי חולים',      ic: '🏥', color: '#e11d48' },
  park:        { he: 'פארקים',         ic: '🌳', color: '#15803d' },
  playground:  { he: 'גני משחקים',     ic: '🛝', color: '#14b8a6' },
  worship:     { he: 'בתי כנסת',       ic: '🕍', color: '#7c3aed' },
  bank:        { he: 'בנקים',          ic: '🏦', color: '#475569' },
  library:     { he: 'ספריות',         ic: '📚', color: '#9333ea' },
  bus_stop:    { he: 'תחנות אוטובוס',  ic: '🚌', color: '#64748b' }
};
const AM_ORDER = ['school','kindergarten','college','supermarket','minimarket','grocery','bakery','butcher','mall','pharmacy','clinic','hospital','park','playground','worship','bank','library','bus_stop'];
const DEFAULT_ON = new Set(['school','kindergarten','minimarket','supermarket']);

/* ---------- price color scale (₪/m²) ---------- */
const SCALE = [
  [12000, '#2c7bb6'], [20000, '#7fcdbb'], [28000, '#fed976'],
  [38000, '#fd8d3c'], [99999999, '#e31a1c']
];
function priceColor(ppsm) {
  if (!ppsm) return '#9aa6b2';
  for (const [t, c] of SCALE) if (ppsm <= t) return c;
  return '#e31a1c';
}
const nis = n => n ? '₪' + Number(n).toLocaleString('he-IL') : '—';
const fmtDate = s => { const [y, m, d] = s.split('-'); return `${d}/${m}/${y}`; };

/* ---------- state ---------- */
let DEALS = [], META = {}, map, dealCluster;
const amenityLayers = {};
const filters = { from: null, to: null, rooms: new Set(), pmin: null, pmax: null, nature: '' };

/* ---------- init ---------- */
(async function init() {
  try {
    const [deals, amen, meta] = await Promise.all([
      fetch('data/deals.json').then(r => r.json()),
      fetch('data/amenities.json').then(r => r.json()),
      fetch('data/meta.json').then(r => r.json())
    ]);
    DEALS = deals; META = meta;
    buildMap();
    buildAmenities(amen);
    buildControls();
    buildLegend();
    setCoverage();
    applyFilters();
    document.getElementById('loader').classList.add('done');
  } catch (e) {
    document.getElementById('loader').innerHTML = '<span style="color:#c00">שגיאה בטעינת הנתונים<br>' + e.message + '</span>';
    console.error(e);
  }
})();

/* ---------- map ---------- */
function buildMap() {
  map = L.map('map', { zoomControl: true, preferCanvas: true }).setView([32.321, 34.853], 13);
  L.control.zoom({ position: 'topleft' });
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap &copy; CARTO', maxZoom: 19, subdomains: 'abcd'
  }).addTo(map);
  dealCluster = L.markerClusterGroup({
    chunkedLoading: true, maxClusterRadius: 50, spiderfyOnMaxZoom: true,
    disableClusteringAtZoom: 17
  });
  map.addLayer(dealCluster);
  window._map = map;
}

function dealMarker(d) {
  const m = L.circleMarker([d.lat, d.lon], {
    radius: 6, weight: 1.5, color: '#fff', fillColor: priceColor(d.pm), fillOpacity: .9
  });
  m.bindPopup(() => popupHtml(d), { maxWidth: 280 });
  return m;
}
function popupHtml(d) {
  return `<div class="pp-addr">${d.a || 'כתובת לא ידועה'}</div>
    <div class="pp-price">${nis(d.p)}</div>
    <div class="pp-grid">
      <span><b>תאריך:</b> ${fmtDate(d.dt)}</span>
      <span><b>חדרים:</b> ${d.r || '—'}</span>
      <span><b>שטח:</b> ${d.ar ? d.ar + ' מ"ר' : '—'}</span>
      <span><b>קומה:</b> ${d.fl || '—'}</span>
      <span><b>שנת בנייה:</b> ${d.y || '—'}</span>
      <span><b>₪ למ"ר:</b> ${d.pm ? nis(d.pm) : '—'}</span>
    </div>
    ${d.nt ? `<span class="pp-nature">${d.nt}</span>` : ''}
    ${d.ap ? `<div class="pp-approx">📍 מיקום משוער (מרכז השכונה)</div>` : ''}`;
}

/* ---------- amenities ---------- */
function buildAmenities(list) {
  const byCat = {};
  for (const a of list) (byCat[a.cat] = byCat[a.cat] || []).push(a);
  const host = document.getElementById('amenityList');
  for (const cat of AM_ORDER) {
    const items = byCat[cat]; if (!items || !items.length) continue;
    const meta = AM[cat];
    const lg = L.layerGroup();
    for (const a of items) {
      L.marker([a.lat, a.lon], {
        icon: L.divIcon({
          className: '', html: `<div class="am-marker" style="border-color:${meta.color}">${meta.ic}</div>`,
          iconSize: [30, 30], iconAnchor: [15, 15]
        })
      }).bindPopup(`<div class="pp-addr" style="color:${meta.color}">${meta.ic} ${a.name}</div><div class="pp-nature">${meta.he}</div>`).addTo(lg);
    }
    amenityLayers[cat] = lg;
    const on = DEFAULT_ON.has(cat);
    if (on) map.addLayer(lg);

    const row = document.createElement('label');
    row.className = 'am-row';
    row.innerHTML = `<input type="checkbox" ${on ? 'checked' : ''}/>
      <span class="am-ic">${meta.ic}</span>
      <span class="am-name">${meta.he}</span>
      <span class="am-cnt">${items.length}</span>`;
    row.querySelector('input').addEventListener('change', e => {
      if (e.target.checked) map.addLayer(lg); else map.removeLayer(lg);
    });
    host.appendChild(row);
  }
}

/* ---------- controls ---------- */
function buildControls() {
  // date range
  const from = document.getElementById('dateFrom'), to = document.getElementById('dateTo');
  from.min = to.min = (META.dateFrom || '2023-06-21').slice(0, 7);
  from.max = to.max = (META.dateTo || '').slice(0, 7);
  from.value = from.min; to.value = to.max;
  filters.from = from.value; filters.to = to.value;
  from.addEventListener('change', () => { filters.from = from.value; applyFilters(); });
  to.addEventListener('change', () => { filters.to = to.value; applyFilters(); });

  // rooms chips
  const rc = document.getElementById('roomChips');
  [['1','1'],['2','2'],['3','3'],['4','4'],['5','5'],['6+','6']].forEach(([lab, val]) => {
    const c = document.createElement('div'); c.className = 'chip'; c.textContent = lab;
    c.addEventListener('click', () => {
      c.classList.toggle('on');
      if (filters.rooms.has(val)) filters.rooms.delete(val); else filters.rooms.add(val);
      applyFilters();
    });
    rc.appendChild(c);
  });

  // price
  const pmin = document.getElementById('priceMin'), pmax = document.getElementById('priceMax');
  pmin.addEventListener('input', () => { filters.pmin = +pmin.value || null; applyFilters(); });
  pmax.addEventListener('input', () => { filters.pmax = +pmax.value || null; applyFilters(); });

  // nature select
  const natSel = document.getElementById('natureSel');
  [...new Set(DEALS.map(d => d.nt).filter(Boolean))].sort().forEach(n => {
    const o = document.createElement('option'); o.value = n; o.textContent = n; natSel.appendChild(o);
  });
  natSel.addEventListener('change', () => { filters.nature = natSel.value; applyFilters(); });

  // deals toggle
  document.getElementById('dealsToggle').addEventListener('change', e => {
    if (e.target.checked) map.addLayer(dealCluster); else map.removeLayer(dealCluster);
  });

  // reset
  document.getElementById('resetFilters').addEventListener('click', () => {
    filters.rooms.clear(); filters.pmin = filters.pmax = null; filters.nature = '';
    document.querySelectorAll('#roomChips .chip').forEach(c => c.classList.remove('on'));
    pmin.value = ''; pmax.value = ''; natSel.value = '';
    from.value = from.min; to.value = to.max; filters.from = from.min; filters.to = to.max;
    applyFilters();
  });

  // list panel
  const panel = document.getElementById('dealPanel');
  document.getElementById('listToggle').addEventListener('click', () => panel.classList.toggle('hidden'));
  document.getElementById('listClose').addEventListener('click', () => panel.classList.add('hidden'));

  // mobile menu
  document.getElementById('menuToggle').addEventListener('click', () =>
    document.getElementById('sidebar').classList.toggle('open'));

  // info modal
  const modal = document.getElementById('infoModal');
  const fmtHe = s => { if (!s) return '—'; const [y, m, d] = s.split('-'); return `${d}/${m}/${y}`; };
  document.getElementById('infoStats').innerHTML =
    `<li>סה"כ עסקאות: <b>${(META.totalDeals || 0).toLocaleString('he-IL')}</b></li>
     <li>על המפה: <b>${(META.mappedDeals || 0).toLocaleString('he-IL')}</b></li>
     <li>נקודות עניין: <b>${(META.amenityCount || 0).toLocaleString('he-IL')}</b></li>
     <li>טווח: <b>${fmtHe(META.dateFrom)} – ${fmtHe(META.dateTo)}</b></li>`;
  document.getElementById('infoBtn').addEventListener('click', () => modal.classList.remove('hidden'));
  document.getElementById('infoClose').addEventListener('click', () => modal.classList.add('hidden'));
  modal.addEventListener('click', e => { if (e.target === modal) modal.classList.add('hidden'); });
}

function buildLegend() {
  document.getElementById('priceLegend').innerHTML =
    `<div class="bar"></div><div class="ticks"><span>נמוך</span><span>₪/מ"ר</span><span>גבוה</span></div>`;
}

function setCoverage() {
  const mon = s => { if (!s) return ''; const [y, m] = s.split('-'); return `${m}/${y}`; };
  const el = document.getElementById('coverage');
  if (META.dateFrom && META.dateTo) el.textContent = `עסקאות מ-${mon(META.dateFrom)} עד ${mon(META.dateTo)}`;
}

/* ---------- filtering ---------- */
function matches(d) {
  if (d.lat == null) return false;
  const mon = d.dt.slice(0, 7);
  if (filters.from && mon < filters.from) return false;
  if (filters.to && mon > filters.to) return false;
  if (filters.rooms.size) {
    const r = Math.floor(d.r || 0);
    const key = r >= 6 ? '6' : String(r);
    if (!filters.rooms.has(key)) return false;
  }
  if (filters.pmin && d.p < filters.pmin) return false;
  if (filters.pmax && d.p > filters.pmax) return false;
  if (filters.nature && d.nt !== filters.nature) return false;
  return true;
}

let renderTimer;
function applyFilters() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(render, 60);
}
function render() {
  const shown = DEALS.filter(matches);
  dealCluster.clearLayers();
  const markers = shown.map(dealMarker);
  dealCluster.addLayers(markers);
  updateStats(shown);
  updateList(shown);
}

function median(a) { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); }

function updateStats(shown) {
  const prices = shown.map(d => d.p).filter(Boolean);
  const ppsm = shown.map(d => d.pm).filter(Boolean);
  document.getElementById('dealCount').textContent = shown.length.toLocaleString('he-IL');
  document.getElementById('listCount').textContent = shown.length.toLocaleString('he-IL');
  document.getElementById('topstats').innerHTML = `
    <div class="stat"><b>${shown.length.toLocaleString('he-IL')}</b><span>עסקאות מוצגות</span></div>
    <div class="stat"><b>${prices.length ? nis(median(prices)) : '—'}</b><span>מחיר חציוני</span></div>
    <div class="stat"><b>${ppsm.length ? nis(median(ppsm)) : '—'}</b><span>חציון ₪/מ"ר</span></div>
    <div class="stat"><b>${META.amenityCount || 0}</b><span>נקודות עניין</span></div>`;
  document.getElementById('metaLine').textContent =
    `${META.totalDeals ? META.totalDeals.toLocaleString('he-IL') : 0} עסקאות · ${META.dateFrom} עד ${META.dateTo}`;
}

function updateList(shown) {
  const tb = document.getElementById('dealRows');
  const rows = shown.slice(0, 400);
  tb.innerHTML = rows.map((d, i) =>
    `<tr data-i="${i}"><td>${d.a || '—'}</td><td>${fmtDate(d.dt)}</td><td>${nis(d.p)}</td><td>${d.r || '—'}</td><td>${d.ar || '—'}</td><td>${d.pm ? nis(d.pm) : '—'}</td></tr>`
  ).join('');
  tb.querySelectorAll('tr').forEach(tr => tr.addEventListener('click', () => {
    const d = rows[+tr.dataset.i];
    map.setView([d.lat, d.lon], 18, { animate: true });
    setTimeout(() => {
      let found;
      dealCluster.eachLayer(l => { const ll = l.getLatLng(); if (Math.abs(ll.lat - d.lat) < 1e-6 && Math.abs(ll.lng - d.lon) < 1e-6) found = l; });
      if (found) dealCluster.zoomToShowLayer(found, () => found.openPopup());
    }, 350);
  }));
}
