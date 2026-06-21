const fs=require('fs');
const raw=JSON.parse(fs.readFileSync('osm_raw.json'));
function cat(t){
  if(t.amenity==='school') return ['school','בית ספר'];
  if(t.amenity==='kindergarten') return ['kindergarten','גן ילדים'];
  if(t.amenity==='college'||t.amenity==='university') return ['college','מכללה/אוניברסיטה'];
  if(t.shop==='supermarket') return ['supermarket','סופרמרקט'];
  if(t.shop==='convenience') return ['minimarket','מינימרקט'];
  if(t.shop==='greengrocer') return ['grocery','ירקן'];
  if(t.shop==='bakery') return ['bakery','מאפייה'];
  if(t.shop==='butcher') return ['butcher','אטליז'];
  if(t.shop==='mall'||t.amenity==='marketplace') return ['mall','קניון/שוק'];
  if(t.amenity==='pharmacy') return ['pharmacy','בית מרקחת'];
  if(t.amenity==='clinic'||t.amenity==='doctors') return ['clinic','מרפאה'];
  if(t.amenity==='hospital') return ['hospital','בית חולים'];
  if(t.leisure==='park') return ['park','פארק'];
  if(t.leisure==='playground') return ['playground','גן משחקים'];
  if(t.amenity==='place_of_worship') return ['worship','בית כנסת/תפילה'];
  if(t.amenity==='bank') return ['bank','בנק'];
  if(t.amenity==='library') return ['library','ספרייה'];
  if(t.highway==='bus_stop') return ['bus_stop','תחנת אוטובוס'];
  return null;
}
const out=[]; const counts={};
for(const el of raw.elements){
  const t=el.tags||{}; const c=cat(t); if(!c) continue;
  const lat = el.lat || (el.center&&el.center.lat); const lon = el.lon || (el.center&&el.center.lon);
  if(!lat||!lon) continue;
  out.push({ id:el.type[0]+el.id, cat:c[0], catHe:c[1], name:t['name:he']||t.name||c[1], lat:+lat.toFixed(6), lon:+lon.toFixed(6) });
  counts[c[0]]=(counts[c[0]]||0)+1;
}
fs.writeFileSync('netanya_amenities.json', JSON.stringify(out));
console.log('amenities:', out.length);
console.log(JSON.stringify(counts,null,0));
