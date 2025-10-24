// map/vehMarkers.js — Lớp hiển thị xe: icon tối giản (chấm + mũi hướng), không ảnh, giữ nguyên API
// Yêu cầu: đã có Leaflet (L) trong trang.
import { VehState } from './vehStateTracker.js';

function injectStyle() {
  if (document.getElementById('veh-style')) return;
  const st = document.createElement('style');
  st.id = 'veh-style';
  st.textContent = `
    .veh-pin {
      position: relative;
      width: 0; height: 0;
      transform: rotate(var(--deg,0deg));
      filter: drop-shadow(0 1px 1px rgba(0,0,0,.25));
    }
    .veh-dir {
      position: absolute; left: 50%; top: -12px; transform: translateX(-50%);
      width: 0; height: 0;
      border-left: 6px solid transparent; border-right: 6px solid transparent;
      border-bottom: 10px solid var(--veh-color, #1f2937);
    }
    .veh-dot {
      position: absolute; left: 50%; top: -2px; transform: translate(-50%, -50%);
      width: 14px; height: 14px; border-radius: 50%;
      background: var(--veh-color, #1f2937);
      box-shadow: 0 0 0 2px #fff, 0 1px 3px rgba(0,0,0,.35);
    }
    .veh-label-wrap{ position:relative; transform: translate(-50%, -28px); }
    .veh-label{
      position:relative; display:inline-block; padding:2px 6px; border-radius:12px;
      font:600 12px/1.2 system-ui,Segoe UI,Roboto,Arial; background:#fff; color:#111;
      border:1px solid rgba(0,0,0,.15); box-shadow: 0 2px 6px rgba(0,0,0,.15);
      white-space:nowrap; pointer-events:auto; user-select:none;
    }
    .veh-label::after{
      content:""; position:absolute; left:14px; top:100%;
      border-left:6px solid transparent; border-right:6px solid transparent; border-top:6px solid #fff;
      filter: drop-shadow(0 -1px 0 rgba(0,0,0,.15));
    }
  `;
  document.head.appendChild(st);
}

function normalizePlate(p){ return String(p||'').toUpperCase().replace(/[^A-Z0-9]/g,''); }

// Kept for compatibility with older code (not used anymore but name preserved)
function carSVG(){ return ''; }

export function createVehiclesLayer(map){
  if (!map || !L) { console.error('[vehMarkers] Map/Leaflet chưa sẵn sàng'); return null; }

  injectStyle();

  const iconLayer  = L.layerGroup().addTo(map);
  const labelLayer = L.layerGroup().addTo(map);
  const byKey = new Map(); // plateKey -> { icon:Marker, label:Marker, meta:{} }

  function gridKey(lat, lng){ return `${lat.toFixed(5)},${lng.toFixed(5)}`; } // ~1m
  function stackOffsetPx(idx){ return 18 * idx; }

  function makeCarMarker(lat, lng, dirDeg, statusColor){
    const html = `<div class="veh-pin" style="--deg:${dirDeg||0}deg;--veh-color:${statusColor||'#1f2937'}">
        <div class="veh-dir"></div>
        <div class="veh-dot"></div>
      </div>`;
    return L.marker([lat,lng], {
      zIndexOffset: 120,
      icon: L.divIcon({ className:'', html, iconSize:[0,0], iconAnchor:[0,0] })
    });
  }

  function makeLabelMarker(lat, lng, text, stackIdx){
    const dy = 28 + stackOffsetPx(stackIdx||0);
    const html = `<div class="veh-label-wrap" style="transform:translate(-50%,-${dy}px)">
        <div class="veh-label" title="${text}">${text}</div>
      </div>`;
    return L.marker([lat,lng], {
      zIndexOffset: 300, interactive: true,
      icon: L.divIcon({ className:'', html, iconSize:[0,0], iconAnchor:[0,0] })
    });
  }

  function syncOne(v, stacks, seenSet){
    const plate = v.plate ?? (v.VehicleNo || v.vehicleNo || '');
    const plateKey = normalizePlate(plate);
    const lat = Number(v.lat ?? v.Latitude ?? v.latitude);
    const lng = Number(v.lng ?? v.Longitude ?? v.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !plateKey) return null;

    const gk = gridKey(lat,lng);
    const stackIdx = (stacks.get(gk) || 0);
    stacks.set(gk, stackIdx + 1);

    const dir = Number(v.dir ?? v.Direction ?? v.direction ?? 0);
    const speed = Number(v.speed ?? v.Speed ?? 0);
    const time  = v.time ?? v.OperateDate ?? v.operateDate ?? '';
    const statusColor = v.status?.color || "#1f2937";
    const statusText  = v.status?.text || "Không xác định";
    const address = v.address || '';

    let rec = byKey.get(plateKey);
    if (!rec){
      const icon  = makeCarMarker(lat,lng,dir,statusColor).addTo(iconLayer);
      const label = makeLabelMarker(lat,lng,plate,stackIdx).addTo(labelLayer);
      label.on('click', ()=> { icon.openPopup(); });
      icon.bindPopup(`<div style="min-width:200px">
          <div><b>Xe:</b> ${plate}</div>
          <div><b>Tốc độ:</b> ${speed} km/h</div>
          <div><b>Trạng thái:</b> <span style="color:${statusColor}">${statusText}</span></div>
          <div><b>Vị trí:</b> ${address || '—'}</div>
          <div style="color:#666;font-size:12px"><b>Cập nhật:</b> ${time}</div>
        </div>`);
      rec = { icon, label, meta:{} };
      byKey.set(plateKey, rec);
    } else {
      rec.icon.setLatLng([lat,lng]);
      const el = rec.icon.getElement();
      if (el){
        const pin = el.querySelector('.veh-pin');
        if (pin){
          pin.style.setProperty('--deg', `${dir||0}deg`);
          pin.style.setProperty('--veh-color', statusColor);
        }
      }
      const lblEl = rec.label.getElement();
      if (lblEl){
        const wrap = lblEl.querySelector('.veh-label-wrap');
        if (wrap) wrap.style.transform = `translate(-50%, -${28 + stackOffsetPx(stackIdx)}px)`;
        const textDiv = lblEl.querySelector('.veh-label');
        if (textDiv) textDiv.textContent = plate;
      }
      rec.label.setLatLng([lat,lng]);
      rec.icon.getPopup()?.setContent(`<div style="min-width:200px">
          <div><b>Xe:</b> ${plate}</div>
          <div><b>Tốc độ:</b> ${speed} km/h</div>
          <div><b>Trạng thái:</b> <span style="color:${statusColor}">${statusText}</span></div>
          <div><b>Vị trí:</b> ${address || '—'}</div>
          <div style="color:#666;font-size:12px"><b>Cập nhật:</b> ${time}</div>
        </div>`);
    }

    rec.meta = { plate, plateKey, lat, lng, speed, time, status: statusText, statusCode: v.statusCode, statusColor, dir, address };
    seenSet.add(plateKey);
    return [lat,lng];
  }

  function getBounds(){
    const ll = Array.from(byKey.values()).map(r => r.icon.getLatLng());
    return ll.length ? L.latLngBounds(ll) : null;
  }

  function clearMissing(seenSet){
    for (const [k, rec] of byKey){
      if (!seenSet.has(k)){ rec.icon.remove(); rec.label.remove(); byKey.delete(k); }
    }
  }

  /** Cập nhật từ mảng realtime (EUP hoặc chuẩn hóa) */
  function upsertFromRealtime(arr){
    if (!arr || !Array.isArray(arr)) return [];
    const stacks = new Map();
    const seen = new Set();
    const points = [];
    for (const v of arr){
      const pt = syncOne(v, stacks, seen);
      if (pt) points.push(pt);
    }
    clearMissing(seen);
    return points;
  }

  function getList(){
    return Array.from(byKey.values()).map(({meta}) => ({ ...meta })).sort((a,b)=> a.plate.localeCompare(b.plate));
  }

  function focus(plate, zoom=15){
    const key = normalizePlate(plate || '');
    const rec = byKey.get(key);
    if (!rec) return false;
    const ll = rec.icon.getLatLng();
    map.flyTo(ll, zoom, {animate:true, duration:0.4});
    rec.icon.openPopup();
    return true;
  }

  function clear(){
    byKey.forEach(rec => { rec.icon.remove(); rec.label.remove(); });
    byKey.clear();
  }

  // Optional helpers retained for compatibility with previous version
  function filterByStatus(statusCode){
    if (statusCode === undefined || statusCode === null){
      byKey.forEach(rec => { rec.icon.addTo(iconLayer); rec.label.addTo(labelLayer); });
      return Array.from(byKey.values()).map(r => r.meta);
    }
    const filtered = [];
    byKey.forEach(rec => {
      if (rec.meta.statusCode == statusCode){ rec.icon.addTo(iconLayer); rec.label.addTo(labelLayer); filtered.push(rec.meta); }
      else { rec.icon.remove(); rec.label.remove(); }
    });
    return filtered;
  }

  function getStatusStats(){
    const stats = {}; byKey.forEach(rec => { const code = rec.meta.statusCode; stats[code] = (stats[code] || 0) + 1; });
    return stats;
  }

  return { upsertFromRealtime, getList, focus, clear, getBounds, filterByStatus, getStatusStats };
}
