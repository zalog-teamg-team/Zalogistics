// vehTablePanel.js — Panel hiển thị toàn bộ xe dạng bảng
// ƯU TIÊN hiển thị tên KHU VỰC ở cột "Địa chỉ"; nếu ngoài vùng → hiển thị địa chỉ.
// Trạng thái luôn đúng: ưu tiên statusCode; fallback statusText/speed.
import { VehState } from './vehStateTracker.js';
import { pointInZone } from './geoMath.js';

export function attachVehTablePanel(map, vehLayer) {
  // ===== CSS nội tuyến (không cần sửa file css) =====
  if (!document.getElementById('veh-table-panel-css')) {
    const css = document.createElement('style');
    css.id = 'veh-table-panel-css';
    css.textContent = `
      .veh-table-panel{position:fixed;right:12px;top:86px;bottom:12px;width:520px;background:#fff;border:1px solid #e5e7eb;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.15);z-index:4000;display:flex;flex-direction:column}
      .veh-table-panel.hidden{display:none}
      .veh-panel-header{position:sticky;top:0;background:#fff;z-index:1;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;border-bottom:1px solid #e5e7eb}
      .veh-panel-header .tools{display:flex;align-items:center;gap:8px}
      .veh-panel-header input{padding:6px 8px;border:1px solid #e5e7eb;border-radius:8px;width:240px;font-size:13px}
      .veh-panel-header button{padding:6px 10px;border:1px solid #e5e7eb;background:#f8fafc;border-radius:8px;cursor:pointer}
      .veh-rows{overflow:auto;height:100%}
      .veh-table{width:100%;border-collapse:separate;border-spacing:0;font-size:12px}
      .veh-table thead th{position:sticky;top:0;background:#f8fafc;border-bottom:1px solid #e5e7eb;text-align:left;padding:8px}
      .veh-table tbody td{border-bottom:1px solid #f1f5f9;padding:6px 8px;vertical-align:top}
      .veh-table tbody tr:hover{background:#f8fafc;cursor:pointer}
      .veh-table td.status{white-space:nowrap}
      .veh-table td.status i{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:6px;vertical-align:middle}
      .veh-table td.addr{max-width:300px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .veh-table td.empty{text-align:center;color:#64748b;padding:16px}
      .veh-table td.num{white-space:nowrap}
      .zone-tag{display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600;background:#e0f2fe;color:#075985;border:1px solid #bae6fd}
    `;
    document.head.appendChild(css);
  }

  // ===== Helper vùng (dò xe thuộc vùng nào) =====
  function zoneNameOf(lat,lng){
    const api = window.GeoZones;
    const zones = api?.getZones?.() || [];
    for(const z of zones){
      if (pointInZone(lat, lng, z)) return z.name||z.id;
    }
    return ''; // ngoài vùng
  }

  // ===== Helper trạng thái (chuẩn hoá hiển thị) =====
  const STATUS = {
    0:{text:'Đang chạy', color:'#28a745'},
    1:{text:'Bật máy', color:'#20c997'},
    2:{text:'Dừng xe', color:'#dc3545'},
    3:{text:'Đỗ xe', color:'#6c757d'},
    4:{text:'Quá tốc độ', color:'#dc3545'},
    5:{text:'Mất tín hiệu', color:'#fd7e14'},
    6:{text:'SOS', color:'#dc3545'},
    7:{text:'Lệch tuyến', color:'#fd7e14'},
    8:{text:'Vào khu vực', color:'#17a2b8'},
    9:{text:'Ra khỏi khu vực', color:'#17a2b8'},
    10:{text:'Dừng không tắt máy', color:'#007bff'}
  };
  function asStatus(v){
    // 1) có code số → dùng bảng chuẩn
    const code = Number(v.statusCode);
    if (Number.isFinite(code) && STATUS[code]) return STATUS[code];

    // 2) có text → map màu theo từ khoá
    const t = (v.status?.text || v.statusText || '').toLowerCase();
    if (t){
      if (t.includes('chạy'))   return { text: 'Đang chạy', color:'#28a745' };
      if (t.includes('bật máy'))return { text: 'Bật máy', color:'#20c997' };
      if (t.includes('quá tốc'))return { text: 'Quá tốc độ', color:'#dc3545' };
      if (t.includes('mất tín'))return { text: 'Mất tín hiệu', color:'#fd7e14' };
      if (t.includes('sos'))    return { text: 'SOS', color:'#dc3545' };
      if (t.includes('lệch'))   return { text: 'Lệch tuyến', color:'#fd7e14' };
      if (t.includes('không tắt')) return { text:'Dừng không tắt máy', color:'#007bff' };
      if (t.includes('đỗ') || t.includes('dừng')) return { text:'Đỗ/Dừng', color:'#6c757d' };
    }
    // 3) fallback: dựa vào tốc độ
    return Number(v.speed) > 3 ? { text:'Đang chạy', color:'#28a745' }
                               : { text:'Đỗ/Dừng',  color:'#6c757d' };
  }

  // ===== DOM panel =====
  const host = document.body;
  const panel = document.createElement('div');
  panel.className = 'veh-table-panel hidden';
  panel.innerHTML = `
    <div class="veh-panel-header">
      <strong>Danh sách xe</strong>
      <div class="tools">
        <input id="vehFilter" placeholder="Lọc biển số/địa chỉ..."/>
        <button id="vehClose" title="Đóng">✕</button>
      </div>
    </div>
    <div class="veh-rows">
      <table class="veh-table">
        <thead>
          <tr>
            <th>Biển số</th>
            <th>Trạng thái</th>
            <th>Tốc độ</th>
            <th>Thời gian</th>
            <th>Địa chỉ / Khu vực</th>
          </tr>
        </thead>
        <tbody></tbody>
      </table>
    </div>`;
  host.appendChild(panel);

  const tbody  = panel.querySelector('tbody');
  const filter = panel.querySelector('#vehFilter');
  const btnX   = panel.querySelector('#vehClose');

  let latest = [];
  const fmt = (n)=> Number.isFinite(n) ? Math.round(n) : 0;

  function render(list){
    latest = Array.isArray(list) ? list.slice() : [];
    const q = (filter.value||'').trim().toUpperCase();

    let rows = latest;
    if (q) {
      rows = latest.filter(v =>
        (String(v.plate||'').toUpperCase().includes(q)) ||
        (String(v.address||'').toUpperCase().includes(q)) ||
        (zoneNameOf(v.lat, v.lng) || '').toUpperCase().includes(q)
      );
    }

    rows.sort((a,b)=> String(a.plate).localeCompare(String(b.plate), 'vi'));
    let html = '';
    for (const v of rows){
      const st = asStatus(v);
      const zname = (Number.isFinite(v.lat) && Number.isFinite(v.lng)) ? zoneNameOf(v.lat, v.lng) : '';
      const addrCell = zname
        ? `<span class="zone-tag" title="Trong khu vực">${zname}</span>`
        : `<span class="addr" title="${(v.address||'').replace(/"/g,'&quot;')}">${v.address||''}</span>`;

      html += `
        <tr data-plate="${String(v.plate).replace(/"/g,'&quot;')}" title="Bấm để phóng tới xe">
          <td class="plate">${v.plate||''}</td>
          <td class="status"><i style="background:${st.color}"></i><span>${st.text}</span></td>
          <td class="num">${fmt(v.speed)} km/h</td>
          <td class="time">${v.time||''}</td>
          <td>${addrCell}</td>
        </tr>`;
    }
    tbody.innerHTML = html || `<tr><td colspan="5" class="empty">Không có dữ liệu.</td></tr>`;
  }

  // Click 1 dòng → focus xe
  tbody.addEventListener('click', (e)=>{
    const tr = e.target.closest('tr[data-plate]'); if (!tr) return;
    const plate = tr.getAttribute('data-plate');
    if (vehLayer?.focus?.(plate)) return;

    // Fallback center nếu layer chưa hỗ trợ focus
    const list = vehLayer?.getList?.() || [];
    const key = String(plate).replace(/[^A-Z0-9]/gi,'').toUpperCase();
    const v = list.find(x =>
      (x.plateKey && x.plateKey === key) ||
      String(x.plate || '').toUpperCase() === String(plate).toUpperCase()
    );
    if (v && Number.isFinite(v.lat) && Number.isFinite(v.lng)) {
      map.setView([v.lat, v.lng], Math.max(map.getZoom(), 16));
    }
  });

  filter.addEventListener('input', ()=> render(latest));
  btnX.addEventListener('click', ()=> close());

  // Cập nhật khi có dữ liệu mới
  const onVeh = ()=>{ if (!panel.classList.contains('hidden')) render(vehLayer?.getList?.() || []); };
  window.addEventListener('map:vehicles', onVeh);

  function open(){ panel.classList.remove('hidden'); render(vehLayer?.getList?.() || []); }
  function close(){ panel.classList.add('hidden'); }
  function toggle(){ panel.classList.contains('hidden') ? open() : close(); }

  return { open, close, toggle };
}
