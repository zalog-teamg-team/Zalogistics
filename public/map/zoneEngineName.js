// zoneEngineName.js — Fallback "khu vực theo TÊN" (cột mốc/địa danh từ realtime)
// Nghe 'map:vehicles:raw' (mỗi record đã có v.zoneName) → phát 'geozone:events' & 'geozone:summary'
export function createZoneNameEngine(opts = {}) {
  const STOP_SET = new Set([2, 3, 10]); // dừng/đỗ/dừng không tắt máy

  const S = {
    zones: new Map(),      // id -> {id, name}
    members: new Map(),    // id -> Set(plateKey)
    stopped: new Map(),    // id -> Set(plateKey)
    lastZoneOf: new Map(), // plateKey -> zoneId | ''
    lastList: []
  };

  const keyOf  = s => String(s||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  const hasStop= v => STOP_SET.has(Number(v.statusCode)) || Number(v.speed) <= 3;
  const slug   = s => (s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
                    .replace(/[^\w]+/g,'_').replace(/^_|_$/g,'').toUpperCase() || 'NO_NAME';

  const ensureZone = (name)=>{
    const id = slug(name);
    if (!S.zones.has(id)) { S.zones.set(id,{id,name}); S.members.set(id,new Set()); S.stopped.set(id,new Set()); }
    return id;
  };
  const getCounts = ()=>{
    const total = (S.lastList||[]).length, out = {};
    for (const [id,z] of S.zones){
      const inside = S.members.get(id)?.size || 0;
      const stop   = S.stopped.get(id)?.size || 0;
      out[id] = { name: z.name, inside, stopped: stop, outside: Math.max(0, total - inside) };
    }
    return out;
  };

  function process(list){
    S.lastList = Array.isArray(list) ? list : [];
    const curM = new Map(), curS = new Map(), inAgg = new Map(), outAgg = new Map(), now = Date.now();

    for (const v of S.lastList){
      const plateKey = keyOf(v.plateKey || v.plate); if (!plateKey) continue;
      const name = (v.zoneName || '').trim();        const prev = S.lastZoneOf.get(plateKey) || '';
      if (name){
        const id = ensureZone(name);
        if (!curM.has(id)){ curM.set(id,new Set()); curS.set(id,new Set()); }
        curM.get(id).add(plateKey); if (hasStop(v)) curS.get(id).add(plateKey);
        if (prev !== id){
          if (prev){ (outAgg.get(prev) || outAgg.set(prev,new Set()).get(prev)).add(plateKey); }
          (inAgg.get(id) || inAgg.set(id,new Set()).get(id)).add(plateKey);
        }
        S.lastZoneOf.set(plateKey, id);
      } else {
        if (prev){ (outAgg.get(prev) || outAgg.set(prev,new Set()).get(prev)).add(plateKey); }
        S.lastZoneOf.set(plateKey, '');
      }
    }

    const messages = [];
    for (const [id,set] of inAgg ) messages.push({ zoneId:id, name:S.zones.get(id)?.name||id, type:'in',  count:set.size, vehicles:[...set], at:now });
    for (const [id,set] of outAgg) messages.push({ zoneId:id, name:S.zones.get(id)?.name||id, type:'out', count:set.size, vehicles:[...set], at:now });
    for (const [id,z] of S.zones){
      const prevStop = S.stopped.get(id) || new Set();
      const curStop  = curS.get(id) || new Set();
      if (curStop.size !== prevStop.size) messages.push({ zoneId:id, name:z.name, type:'stop', count:curStop.size, vehicles:[...curStop], at:now });
      S.members.set(id, curM.get(id) || new Set());
      S.stopped.set(id, curStop);
    }

    if (messages.length){
      const text = messages.map(m => m.type==='in' ? `${m.count} xe vào ${m.name}`
                                : m.type==='out'? `${m.count} xe ra khỏi ${m.name}`
                                                : `${m.count} xe đỗ/dừng ${m.name}`);
      window.dispatchEvent(new CustomEvent('geozone:events',  { detail:{ messages, text } }));
    }
    const counts = getCounts();
    const summary = Object.entries(counts).map(([zoneId,c])=>({zoneId,...c}));
    window.dispatchEvent(new CustomEvent('geozone:summary', { detail:{ counts, summary } }));
  }

  const onRaw = (e)=> process(Array.isArray(e?.detail) ? e.detail : (e?.detail?.list||[]));
  window.addEventListener('map:vehicles:raw', onRaw);

  const api = { getZones:()=>[...S.zones.values()], getCounts, process, destroy:()=>window.removeEventListener('map:vehicles:raw', onRaw) };
  if (opts.attachToWindow) window.GeoZonesByName = api;
  return api;
}
