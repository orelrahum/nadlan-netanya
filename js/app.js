'use strict';

/* =========================================================================
   OPTIONAL: paste your Google Maps JavaScript API key here to use real
   Google Maps as the basemap (roadmap + satellite). Leave empty to use the
   free Google-style basemap (works with no key, e.g. on GitHub Pages).
   Restrict the key to your site's domain in the Google Cloud console.
   ========================================================================= */
const GOOGLE_MAPS_API_KEY = "";

/* ---------- property-type metadata ---------- */
const CAT_META = {
  apartment:  { ic: '🏢', color: '#0e7c86' },
  garden:     { ic: '🌿', color: '#2e9e6b' },
  penthouse:  { ic: '🏙️', color: '#8b5cf6' },
  house:      { ic: '🏡', color: '#d97706' },
  vacation:   { ic: '🏖️', color: '#0ea5e9' },
  commercial: { ic: '🏬', color: '#64748b' },
  parking:    { ic: '🅿️', color: '#475569' },
  storage:    { ic: '📦', color: '#92745b' },
  land:       { ic: '🌾', color: '#9a8c1e' },
  other:      { ic: '❓', color: '#94a3b8' }
};
const CAT_ORDER = ['apartment', 'garden', 'penthouse', 'house', 'vacation', 'commercial', 'parking', 'storage', 'land', 'other'];

/* ---------- amenity metadata ---------- */
const AM = {
  school:{he:'בתי ספר',ic:'🏫',color:'#3b82f6'}, kindergarten:{he:'גני ילדים',ic:'🧸',color:'#f59e0b'},
  college:{he:'מכללות',ic:'🎓',color:'#6366f1'}, supermarket:{he:'סופרמרקטים',ic:'🛒',color:'#16a34a'},
  minimarket:{he:'מינימרקטים',ic:'🏪',color:'#22c55e'}, grocery:{he:'ירקנים',ic:'🥬',color:'#65a30d'},
  bakery:{he:'מאפיות',ic:'🥐',color:'#d97706'}, butcher:{he:'אטליזים',ic:'🥩',color:'#dc2626'},
  mall:{he:'קניונים/שווקים',ic:'🛍️',color:'#db2777'}, pharmacy:{he:'בתי מרקחת',ic:'💊',color:'#ef4444'},
  clinic:{he:'מרפאות',ic:'🩺',color:'#0ea5e9'}, hospital:{he:'בתי חולים',ic:'🏥',color:'#e11d48'},
  park:{he:'פארקים',ic:'🌳',color:'#15803d'}, playground:{he:'גני משחקים',ic:'🛝',color:'#14b8a6'},
  worship:{he:'בתי כנסת',ic:'🕍',color:'#7c3aed'}, bank:{he:'בנקים',ic:'🏦',color:'#475569'},
  library:{he:'ספריות',ic:'📚',color:'#9333ea'}, bus_stop:{he:'תחנות אוטובוס',ic:'🚌',color:'#64748b'}
};
const AM_ORDER = ['school','kindergarten','college','supermarket','minimarket','grocery','bakery','butcher','mall','pharmacy','clinic','hospital','park','playground','worship','bank','library','bus_stop'];
const AM_DEFAULT = new Set(['school', 'kindergarten', 'minimarket', 'supermarket']);

/* ---------- colour scale (₪/m²) ---------- */
const STOPS = [[0,'#2c7bb6'],[.25,'#7fcdbb'],[.5,'#fed976'],[.75,'#fd8d3c'],[1,'#e31a1c']];
function hex(c){return [parseInt(c.slice(1,3),16),parseInt(c.slice(3,5),16),parseInt(c.slice(5,7),16)];}
function lerp(t){
  for(let i=1;i<STOPS.length;i++){ if(t<=STOPS[i][0]){ const [a,ca]=STOPS[i-1],[b,cb]=STOPS[i];
    const k=(t-a)/(b-a||1),A=hex(ca),B=hex(cb);
    return `rgb(${Math.round(A[0]+(B[0]-A[0])*k)},${Math.round(A[1]+(B[1]-A[1])*k)},${Math.round(A[2]+(B[2]-A[2])*k)})`; } }
  return STOPS[STOPS.length-1][1];
}
function priceColor(pm){ if(!pm) return '#aab4c0'; const t=Math.max(0,Math.min(1,(pm-META.pmLow)/((META.pmHigh-META.pmLow)||1))); return lerp(t); }

const nis = n => n ? '₪' + Number(n).toLocaleString('he-IL') : '—';
const nisK = n => '₪' + Math.round(n/1000).toLocaleString('he-IL') + 'k';
const fmtDate = s => { const [y,m,d] = s.split('-'); return `${d}/${m}/${y}`; };

/* ---------- state ---------- */
let DEALS = [], META = {}, map, dealCluster;
const amenityLayers = {};
const filters = { from:null, to:null, rooms:new Set(), pmin:null, pmax:null, cats:new Set() };

/* ---------- init ---------- */
(async function init(){
  try{
    const [deals, amen, meta] = await Promise.all([
      fetch('data/deals.json').then(r=>r.json()),
      fetch('data/amenities.json').then(r=>r.json()),
      fetch('data/meta.json').then(r=>r.json())
    ]);
    DEALS = deals.filter(d => d.lat != null); META = meta;
    // residential categories on by default
    for(const c of Object.keys(META.catResidential||{})) if(META.catResidential[c]) filters.cats.add(c);
    buildMap();
    buildAmenities(amen);
    buildCategories();
    buildControls();
    buildLegend();
    setCoverage();
    applyFilters();
    document.getElementById('loader').classList.add('done');
  }catch(e){
    document.getElementById('loader').innerHTML = '<span style="color:#c00">שגיאה בטעינת הנתונים<br>'+e.message+'</span>';
    console.error(e);
  }
})();

/* ---------- map + basemaps ---------- */
function freeBaseLayers(){
  return {
    'מפה': L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
      { attribution:'&copy; OpenStreetMap &copy; CARTO', maxZoom:20, subdomains:'abcd' }),
    'לוויין': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { attribution:'&copy; Esri', maxZoom:20 })
  };
}
function loadGoogle(key){
  return new Promise((res,rej)=>{
    if(window.google && window.google.maps) return res();
    window.__gmReady = ()=>res();
    const s=document.createElement('script');
    s.src=`https://maps.googleapis.com/maps/api/js?key=${key}&callback=__gmReady&loading=async`;
    s.async=true; s.onerror=rej; document.head.appendChild(s);
  });
}
function buildMap(){
  map = L.map('map', { zoomControl:true, preferCanvas:true, zoomSnap:.5 }).setView([32.321,34.853], 13);
  const free = freeBaseLayers();
  free['מפה'].addTo(map);
  const ctrl = L.control.layers(free, {}, { position:'topleft', collapsed:true }).addTo(map);

  if(GOOGLE_MAPS_API_KEY && L.gridLayer && L.gridLayer.googleMutant){
    loadGoogle(GOOGLE_MAPS_API_KEY).then(()=>{
      const g = {
        'Google מפה': L.gridLayer.googleMutant({ type:'roadmap' }),
        'Google לוויין': L.gridLayer.googleMutant({ type:'hybrid' })
      };
      map.removeLayer(free['מפה']);
      g['Google מפה'].addTo(map);
      Object.entries(g).forEach(([n,l])=>ctrl.addBaseLayer(l,n));
    }).catch(()=>{/* keep free basemap */});
  }

  dealCluster = L.markerClusterGroup({ chunkedLoading:true, maxClusterRadius:48, spiderfyOnMaxZoom:true, disableClusteringAtZoom:17 });
  map.addLayer(dealCluster);
  window._map = map;
}

function dealColor(d){
  const res = META.catResidential[d.cat];
  if(res) return d.pm ? priceColor(d.pm) : '#aab4c0';
  return (CAT_META[d.cat]||CAT_META.other).color;
}
function dealMarker(d){
  const res = META.catResidential[d.cat];
  const m = L.circleMarker([d.lat,d.lon], {
    radius: res ? 6.5 : 6, weight:1.5, color:'#fff', fillColor:dealColor(d), fillOpacity:.92
  });
  m.bindPopup(()=>popupHtml(d), { maxWidth:300 });
  return m;
}
function catLabel(c){ return (META.catLabels && META.catLabels[c]) || c; }
function popupHtml(d){
  const meta = CAT_META[d.cat]||CAT_META.other;
  return `<div class="pp-cat" style="background:${meta.color}">${meta.ic} ${catLabel(d.cat)}</div>
    <div class="pp-addr">${d.a || 'כתובת לא ידועה'}${d.nb && d.nb!==d.a ? ` · <span style="color:var(--muted);font-weight:500">${d.nb}</span>`:''}</div>
    <div class="pp-price">${nis(d.p)}</div>
    <div class="pp-grid">
      <span><b>תאריך:</b> ${fmtDate(d.dt)}</span>
      <span><b>חדרים:</b> ${d.r||'—'}</span>
      <span><b>שטח:</b> ${d.ar?d.ar+' מ"ר':'—'}</span>
      <span><b>קומה:</b> ${d.fl||'—'}</span>
      <span><b>שנת בנייה:</b> ${d.y||'—'}</span>
      <span><b>₪ למ"ר:</b> ${d.pm?nis(d.pm):'—'}</span>
    </div>
    ${d.ap ? `<div class="pp-approx">📍 מיקום משוער (מרכז השכונה — אין כתובת מדויקת)</div>`:''}`;
}

/* ---------- amenities ---------- */
function buildAmenities(list){
  const byCat = {};
  for(const a of list) (byCat[a.cat]=byCat[a.cat]||[]).push(a);
  const host = document.getElementById('amenityList');
  for(const cat of AM_ORDER){
    const items = byCat[cat]; if(!items||!items.length) continue;
    const meta = AM[cat];
    const lg = L.layerGroup();
    for(const a of items){
      L.marker([a.lat,a.lon], { icon:L.divIcon({ className:'', html:`<div class="am-marker" style="border-color:${meta.color}">${meta.ic}</div>`, iconSize:[30,30], iconAnchor:[15,15] }) })
       .bindPopup(`<div class="pp-cat" style="background:${meta.color}">${meta.ic} ${meta.he}</div><div class="pp-addr">${a.name}</div>`).addTo(lg);
    }
    amenityLayers[cat] = lg;
    const on = AM_DEFAULT.has(cat); if(on) map.addLayer(lg);
    const row = document.createElement('label'); row.className='am-row';
    row.innerHTML = `<input type="checkbox" ${on?'checked':''}/><span class="am-ic">${meta.ic}</span><span class="am-name">${meta.he}</span><span class="am-cnt">${items.length}</span>`;
    row.querySelector('input').addEventListener('change', e=>{ if(e.target.checked) map.addLayer(lg); else map.removeLayer(lg); });
    host.appendChild(row);
  }
}

/* ---------- categories ---------- */
function buildCategories(){
  const host = document.getElementById('catList');
  const counts = META.catCounts||{};
  let lastWasRes = true;
  for(const cat of CAT_ORDER){
    if(!counts[cat]) continue;
    const res = META.catResidential[cat];
    if(lastWasRes && !res){ const sep=document.createElement('div'); sep.className='cat-sep'; host.appendChild(sep); }
    lastWasRes = res;
    const meta = CAT_META[cat]||CAT_META.other;
    const on = filters.cats.has(cat);
    const row = document.createElement('label'); row.className='cat-row'; row.dataset.cat = cat;
    const dot = res ? `background:linear-gradient(90deg,#2c7bb6,#fed976,#e31a1c)` : `background:${meta.color}`;
    row.innerHTML = `<input type="checkbox" ${on?'checked':''}/><span class="cat-dot" style="${dot}"></span><span class="cat-name">${meta.ic} ${catLabel(cat)}</span><span class="cat-cnt">${counts[cat]}</span>`;
    row.querySelector('input').addEventListener('change', e=>{ if(e.target.checked) filters.cats.add(cat); else filters.cats.delete(cat); applyFilters(); });
    host.appendChild(row);
  }
}

/* ---------- controls ---------- */
function buildControls(){
  const from=document.getElementById('dateFrom'), to=document.getElementById('dateTo');
  from.min=to.min=(META.dateFrom||'2023-06-21').slice(0,7);
  from.max=to.max=(META.dateTo||'').slice(0,7);
  from.value=from.min; to.value=to.max; filters.from=from.value; filters.to=to.value;
  from.addEventListener('change',()=>{filters.from=from.value;applyFilters();});
  to.addEventListener('change',()=>{filters.to=to.value;applyFilters();});

  const rc=document.getElementById('roomChips');
  [['1','1'],['2','2'],['3','3'],['4','4'],['5','5'],['6+','6']].forEach(([lab,val])=>{
    const c=document.createElement('div'); c.className='chip'; c.textContent=lab;
    c.addEventListener('click',()=>{ c.classList.toggle('on'); if(filters.rooms.has(val))filters.rooms.delete(val);else filters.rooms.add(val); applyFilters(); });
    rc.appendChild(c);
  });

  const pmin=document.getElementById('priceMin'), pmax=document.getElementById('priceMax');
  pmin.addEventListener('input',()=>{filters.pmin=+pmin.value||null;applyFilters();});
  pmax.addEventListener('input',()=>{filters.pmax=+pmax.value||null;applyFilters();});

  document.getElementById('resetFilters').addEventListener('click',()=>{
    filters.rooms.clear(); filters.pmin=filters.pmax=null;
    filters.cats.clear(); for(const c of Object.keys(META.catResidential||{})) if(META.catResidential[c]) filters.cats.add(c);
    document.querySelectorAll('#roomChips .chip').forEach(c=>c.classList.remove('on'));
    document.querySelectorAll('#catList .cat-row').forEach(row=>{ row.querySelector('input').checked = filters.cats.has(row.dataset.cat); });
    pmin.value=''; pmax.value=''; from.value=from.min; to.value=to.max; filters.from=from.min; filters.to=to.max;
    applyFilters();
  });

  const panel=document.getElementById('dealPanel');
  document.getElementById('listToggle').addEventListener('click',()=>panel.classList.toggle('hidden'));
  document.getElementById('listClose').addEventListener('click',()=>panel.classList.add('hidden'));
  document.getElementById('menuToggle').addEventListener('click',()=>document.getElementById('sidebar').classList.toggle('open'));

  const modal=document.getElementById('infoModal');
  const fmtHe=s=>{ if(!s)return'—'; const[y,m,d]=s.split('-'); return `${d}/${m}/${y}`; };
  document.getElementById('infoStats').innerHTML =
    `<li>סה"כ עסקאות: <b>${(META.totalDeals||0).toLocaleString('he-IL')}</b></li>
     <li>למגורים: <b>${(META.residentialDeals||0).toLocaleString('he-IL')}</b></li>
     <li>על המפה: <b>${(META.mappedDeals||0).toLocaleString('he-IL')}</b></li>
     <li>נקודות עניין: <b>${(META.amenityCount||0).toLocaleString('he-IL')}</b></li>
     <li>טווח: <b>${fmtHe(META.dateFrom)} – ${fmtHe(META.dateTo)}</b></li>`;
  document.getElementById('infoBtn').addEventListener('click',()=>modal.classList.remove('hidden'));
  document.getElementById('infoClose').addEventListener('click',()=>modal.classList.add('hidden'));
  modal.addEventListener('click',e=>{ if(e.target===modal) modal.classList.add('hidden'); });
}

function buildLegend(){
  document.getElementById('priceLegend').innerHTML =
    `<div class="bar" style="background:linear-gradient(90deg,${STOPS.map(s=>s[1]).join(',')})"></div>
     <div class="ticks"><span>${nisK(META.pmLow)}</span><span>${nisK((META.pmLow+META.pmHigh)/2)}</span><span>${nisK(META.pmHigh)}</span></div>`;
  document.getElementById('legendNote').textContent = 'דירות נצבעות לפי מחיר למ"ר. נכסים שאינם למגורים מסומנים בצבע אחיד.';
}
function setCoverage(){
  const mon=s=>{ if(!s)return''; const[y,m]=s.split('-'); return `${m}/${y}`; };
  const el=document.getElementById('coverage');
  if(META.dateFrom&&META.dateTo) el.textContent=`עסקאות רשמיות · ${mon(META.dateFrom)} – ${mon(META.dateTo)}`;
}

/* ---------- filtering ---------- */
function matches(d){
  if(!filters.cats.has(d.cat)) return false;
  const mon=d.dt.slice(0,7);
  if(filters.from&&mon<filters.from) return false;
  if(filters.to&&mon>filters.to) return false;
  if(filters.rooms.size){ const r=Math.floor(d.r||0); const key=r>=6?'6':String(r); if(!filters.rooms.has(key)) return false; }
  if(filters.pmin&&d.p<filters.pmin) return false;
  if(filters.pmax&&d.p>filters.pmax) return false;
  return true;
}
let renderTimer;
function applyFilters(){ clearTimeout(renderTimer); renderTimer=setTimeout(render,60); }
function render(){
  const shown = DEALS.filter(matches);
  dealCluster.clearLayers();
  dealCluster.addLayers(shown.map(dealMarker));
  updateStats(shown);
  updateList(shown);
}
function median(a){ if(!a.length)return 0; const s=[...a].sort((x,y)=>x-y); const m=s.length>>1; return s.length%2?s[m]:Math.round((s[m-1]+s[m])/2); }
function updateStats(shown){
  const res = shown.filter(d=>META.catResidential[d.cat]);
  const prices = res.map(d=>d.p).filter(Boolean);
  const ppsm = res.map(d=>d.pm).filter(Boolean);
  document.getElementById('listCount').textContent = shown.length.toLocaleString('he-IL');
  document.getElementById('topstats').innerHTML = `
    <div class="stat"><b>${shown.length.toLocaleString('he-IL')}</b><span>עסקאות מוצגות</span></div>
    <div class="stat"><b>${prices.length?nis(median(prices)):'—'}</b><span>מחיר חציוני (מגורים)</span></div>
    <div class="stat"><b>${ppsm.length?nis(median(ppsm)):'—'}</b><span>חציון ₪/מ"ר</span></div>
    <div class="stat"><b>${(META.amenityCount||0).toLocaleString('he-IL')}</b><span>נקודות עניין</span></div>`;
  document.getElementById('metaLine').textContent = `${(META.totalDeals||0).toLocaleString('he-IL')} עסקאות · ${META.dateFrom} עד ${META.dateTo}`;
}
function updateList(shown){
  const tb=document.getElementById('dealRows');
  const rows=shown.slice(0,500);
  tb.innerHTML = rows.map((d,i)=>{
    const m=CAT_META[d.cat]||CAT_META.other;
    return `<tr data-i="${i}"><td>${d.a||'—'}</td><td><span class="tag" style="background:${m.color}">${m.ic} ${catLabel(d.cat)}</span></td><td>${fmtDate(d.dt)}</td><td>${nis(d.p)}</td><td>${d.r||'—'}</td><td>${d.ar||'—'}</td><td>${d.pm?nis(d.pm):'—'}</td></tr>`;
  }).join('');
  tb.querySelectorAll('tr').forEach(tr=>tr.addEventListener('click',()=>{
    const d=rows[+tr.dataset.i];
    map.setView([d.lat,d.lon],18,{animate:true});
    setTimeout(()=>{ let found; dealCluster.eachLayer(l=>{ const ll=l.getLatLng(); if(Math.abs(ll.lat-d.lat)<1e-6&&Math.abs(ll.lng-d.lon)<1e-6) found=l; }); if(found) dealCluster.zoomToShowLayer(found,()=>found.openPopup()); },350);
  }));
}
