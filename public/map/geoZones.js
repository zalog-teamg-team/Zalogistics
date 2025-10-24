// map/geoZones.js — Quản lý khu vực + ra/vào + ĐỖ/DỪNG (dùng geoMath)
/* global L */
import { pointInZone } from './geoMath.js';

// API: createGeoZones({ attachToWindow }) -> { setZones, addZone, getZones, processVehicles,
//       getCounts, getLastEvents, attachMap, detachMap, startDraw, stopDraw }

export function createGeoZones(opts = {}) {
  const STOP_SET = new Set([2, 3, 10]); // Dừng xe, Đỗ xe, Dừng không tắt máy

  const state = {
    zones: [],                 // [{id,name,type:'polygon'|'circle', coords|center,radius}]
    byId: new Map(),           // id -> zone
    members: new Map(),        // id -> Set(plateKey) đang ở trong vùng
    stoppedMembers: new Map(), // id -> Set(plateKey) đang dừng trong vùng
    lastEvents: [],            // [{zoneId,type:'in'|'out'|'stop',count,vehicles,name,at}]
    map: null,                 // Leaflet map (khi attachMap)
    layer: null,               // layerGroup vẽ zone
    draw: null, drawPts: [], drawH: null,
    _lastList: []              // danh sách xe lần gần nhất
  };

  // ====== CHUẨN HOÁ & STATE ======
  function normalizeZone(z) {
    const id = String(z.id || z.name || ('Z' + Math.random().toString(36).slice(2,8)));
    const name = String(z.name || id);
    if (z.type === 'circle' || (z.radius && z.center)) {
      const center = [Number(z.center[0]), Number(z.center[1])];
      const radius = Number(z.radius || 0);
      return { id, name, type: 'circle', center, radius };
    }
    const coords = (z.coords || z.path || [])
      .map(p => [Number(p[0]), Number(p[1])])
      .filter(p => Number.isFinite(p[0]) && Number.isFinite(p[1]));
    return { id, name, type: 'polygon', coords };
  }
  function keyOfVehicle(v) {
    return (v.plateKey || v.plate || v.VehicleNo || v.vehicleNo || '')
      .toString().toUpperCase().replace(/[^A-Z0-9]/g,'');
  }

  // ====== COUNTS / EVENTS ======
  function diffSet(a, b) { const o = new Set(); a.forEach(x => { if (!b.has(x)) o.add(x); }); return o; }
  function getCounts() {
    const counts = {};
    const total = (state._lastList || []).length;
    for (const z of state.zones) {
      const inside = state.members.get(z.id)?.size || 0;
      const stopped = state.stoppedMembers.get(z.id)?.size || 0;
      counts[z.id] = { inside, stopped, outside: Math.max(0, total - inside), name: z.name };
    }
    return counts;
  }
  function getLastEvents(clear = false) {
    const out = state.lastEvents.slice();
    if (clear) state.lastEvents.length = 0;
    return out;
  }

  // == NEW: phát summary ngay khi thay đổi danh sách vùng ==
  function emitSummary(){
    const counts = getCounts();
    const summary = Object.entries(counts).map(([id, c]) => ({ zoneId: id, ...c }));
    window.dispatchEvent(new CustomEvent('geozone:summary', { detail: { counts, summary } }));
  }

  function setZones(list) {
    if (!Array.isArray(list)) return;
    state.zones = list.map(normalizeZone);
    state.byId.clear();
    state.members.clear();
    state.stoppedMembers.clear();
    state.zones.forEach(z => {
      state.byId.set(z.id, z);
      state.members.set(z.id, new Set());
      state.stoppedMembers.set(z.id, new Set());
    });
    drawZones();
    emitSummary(); // NEW
  }
  function addZone(z) {
    const nz = normalizeZone(z);
    const i = state.zones.findIndex(s => s.id === nz.id);
    if (i >= 0) state.zones[i] = nz; else state.zones.push(nz);
    state.byId.set(nz.id, nz);
    if (!state.members.has(nz.id)) state.members.set(nz.id, new Set());
    if (!state.stoppedMembers.has(nz.id)) state.stoppedMembers.set(nz.id, new Set());
    drawZones();
    emitSummary(); // NEW
    return nz;
  }
  const getZones = () => state.zones.map(z => ({ ...z }));

  function processVehicles(list) {
    // Lưu danh sách hiện tại để getCounts() dùng
    state._lastList = Array.isArray(list) ? list : [];
    if (!Array.isArray(list)) return { messages: [], counts: getCounts() };

    // Tính tập "đang ở trong vùng" & "đang dừng trong vùng" tại thời điểm hiện tại
    const curr = new Map();       // zoneId -> Set(plateKey)
    const currStopped = new Map();// zoneId -> Set(plateKey)
    for (const z of state.zones) { curr.set(z.id, new Set()); currStopped.set(z.id, new Set()); }

    for (const v of list) {
      const key = keyOfVehicle(v);
      const lat = Number(v.lat); const lng = Number(v.lng);
      if (!key || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      const isStopped = STOP_SET.has(Number(v.statusCode)) || (Number(v.speed) <= 3);
      for (const z of state.zones) {
        if (pointInZone(lat, lng, z)) {
          curr.get(z.id).add(key);
          if (isStopped) currStopped.get(z.id).add(key);
        }
      }
    }

    const messages = [];
    const now = Date.now();

    for (const z of state.zones) {
      const prevSet   = state.members.get(z.id)        || new Set();
      const prevStop  = state.stoppedMembers.get(z.id) || new Set();
      const curSet    = curr.get(z.id)                 || new Set();
      const curStop   = currStopped.get(z.id)          || new Set();

      const entered = diffSet(curSet, prevSet);
      const exited  = diffSet(prevSet, curSet);

      if (entered.size) messages.push({ zoneId: z.id, name: z.name, type: 'in',  count: entered.size, vehicles: [...entered], at: now });
      if (exited.size)  messages.push({ zoneId: z.id, name: z.name, type: 'out', count: exited.size,  vehicles: [...exited],  at: now });

      // Thông báo ĐỖ/DỪNG: khi tổng số xe dừng trong vùng thay đổi, báo số hiện tại
      if (curStop.size !== prevStop.size) {
        messages.push({ zoneId: z.id, name: z.name, type: 'stop', count: curStop.size, vehicles: [...curStop], at: now });
      }

      // Cập nhật state
      state.members.set(z.id, curSet);
      state.stoppedMembers.set(z.id, curStop);
    }

    // Bắn event nếu có thay đổi
    if (messages.length) {
      state.lastEvents.push(...messages);
      const human = messages.map(m => {
        if (m.type === 'in')   return `${m.count} xe vào ${m.name}`;
        if (m.type === 'out')  return `${m.count} xe ra khỏi ${m.name}`;
        if (m.type === 'stop') return `${m.count} xe đỗ/dừng ${m.name}`;
        return '';
      }).filter(Boolean);
      window.dispatchEvent(new CustomEvent('geozone:events', { detail: { messages, text: human } }));
    }

    // Luôn bắn summary (để UI vẽ bảng thống kê nếu muốn)
    const counts = getCounts();
    const summary = Object.entries(counts).map(([id, c]) => ({ zoneId: id, ...c }));
    window.dispatchEvent(new CustomEvent('geozone:summary', { detail: { counts, summary } }));

    return { messages, counts };
  }

  // Tự nghe từ map.js
  window.addEventListener('map:vehicles', (e) => {
    const list = Array.isArray(e?.detail) ? e.detail : (e?.detail?.list || []);
    processVehicles(list);
  });

  // ====== VẼ KHU VỰC (tuỳ chọn) ======
  function attachMap(map) {
    if (!map || typeof map.addLayer !== 'function') return;
    state.map = map;
    state.layer = state.layer || L.layerGroup().addTo(map);
    drawZones();
  }
  function detachMap() {
    if (state.layer) { state.layer.remove(); state.layer = null; }
    state.map = null;
  }
  function drawZones() {
    if (!state.layer || !L) return;
    state.layer.clearLayers();
    for (const z of state.zones) {
      if (z.type === 'circle') {
        L.circle(z.center, { radius: z.radius, color: '#2563eb', weight: 1.5, fillColor: '#3b82f6', fillOpacity: .08 })
          .addTo(state.layer).bindTooltip(z.name, { permanent: true, direction: 'top', opacity: .8 });
      } else if (Array.isArray(z.coords) && z.coords.length >= 3) {
        L.polygon(z.coords, { color: '#2563eb', weight: 1.5, fillColor: '#3b82f6', fillOpacity: .08 })
          .addTo(state.layer).bindTooltip(z.name, { permanent: true, direction: 'top', opacity: .8 });
      }
    }
  }

  // Vẽ polygon nhẹ (không dùng plugin)
  function startDraw(meta = { id: '', name: '' }) {
    if (!state.map) return;
    stopDraw();
    state.drawPts = [];
    state.draw = L.polyline([], { color: '#ef4444', weight: 2 }).addTo(state.map);
    const tip = L.tooltip({ permanent: true, direction: 'right', opacity: .9 })
      .setLatLng(state.map.getCenter()).setContent('Nhấp để thêm đỉnh, double-click kết thúc, ESC huỷ');
    tip.addTo(state.map);

    const onClick = (e) => { state.drawPts.push([e.latlng.lat, e.latlng.lng]); state.draw.setLatLngs(state.drawPts); };
    const onDblClick = () => {
      state.map.off('click', onClick); state.map.off('dblclick', onDblClick); state.map.off('keydown', onKey);
      tip.remove(); state.draw.remove(); state.draw = null;
      if (state.drawPts.length >= 3) addZone({ ...meta, type: 'polygon', coords: state.drawPts.slice() });
      state.drawPts = []; state.drawH = null;
    };
    const onKey = (e) => {
      if (e.originalEvent && e.originalEvent.key === 'Escape') {
        state.map.off('click', onClick); state.map.off('dblclick', onDblClick); state.map.off('keydown', onKey);
        tip.remove(); state.draw.remove(); state.draw = null; state.drawPts = []; state.drawH = null;
      }
    };

    state.map.on('click', onClick);
    state.map.on('dblclick', onDblClick);
    state.map.on('keydown', onKey);
    state.drawH = { onClick, onDblClick, onKey };
  }
  function stopDraw() {
    if (!state.map || !state.drawH) return;
    const { onClick, onDblClick, onKey } = state.drawH;
    state.map.off('click', onClick);
    state.map.off('dblclick', onDblClick);
    state.map.off('keydown', onKey);
    if (state.draw) { state.draw.remove(); state.draw = null; }
    state.drawPts = []; state.drawH = null;
  }

  const api = { setZones, addZone, getZones, processVehicles, getCounts, getLastEvents,
                attachMap, detachMap, startDraw, stopDraw };

  if (opts.attachToWindow) window.GeoZones = api;
  return api;
}
