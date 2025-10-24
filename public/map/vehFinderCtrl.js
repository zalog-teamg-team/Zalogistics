// vehFinderCtrl.js — Control tìm xe + nút Tải + nút Bảng (UI tối giản)
/* global L */
export function attachVehFinderControl(map, vehLayer, opts = {}) {
  const {
    onRefresh,
    onShowTable,        // callback mở bảng xe
    onToggleAuto,       // chỉ dùng nếu bạn cho hiển thị checkbox Auto
    showAuto  = false,  // mặc định ẩn
    showCount = false   // mặc định ẩn
  } = opts;

  const ctrl = L.control({ position: 'topright' });

  ctrl.onAdd = function () {
    const box = L.DomUtil.create('div', 'map-ctrl');
    Object.assign(box.style, {
      display: 'flex', gap: '6px', alignItems: 'center',
      background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px',
      boxShadow: '0 2px 8px rgba(0,0,0,.08)', padding: '6px'
    });

    // Input + datalist
    const datalistId = 'vehList_' + Math.random().toString(36).slice(2, 7);
    const input = L.DomUtil.create('input', '', box);
    input.type = 'text';
    input.placeholder = 'Nhập biển số…';
    input.setAttribute('list', datalistId);
    Object.assign(input.style, {
      padding: '6px 8px', border: '1px solid #e5e7eb',
      borderRadius: '8px', width: '180px'
    });

    const list = L.DomUtil.create('datalist', '', box);
    list.id = datalistId;

    // Nút Tìm
    const btnFind = L.DomUtil.create('button', '', box);
    btnFind.textContent = 'Tìm';
    btnFind.style.cssText = 'cursor:pointer;border:1px solid #e5e7eb;border-radius:8px;background:#f8fafc;padding:4px 10px';

    // Nút Tải
    const btnLoad = L.DomUtil.create('button', '', box);
    btnLoad.textContent = 'Tải';
    btnLoad.style.cssText = 'cursor:pointer;border:1px solid #e5e7eb;border-radius:8px;background:#f8fafc;padding:4px 10px';

    // Nút Bảng
    const btnTable = L.DomUtil.create('button', '', box);
    btnTable.textContent = 'Bảng';
    btnTable.title = 'Hiển thị danh sách xe';
    btnTable.style.cssText = 'cursor:pointer;border:1px solid #e5e7eb;border-radius:8px;background:#f8fafc;padding:4px 10px';

    // (tùy chọn) Auto 20s
    let chk = null;
    if (showAuto) {
      const lab = L.DomUtil.create('label', '', box);
      Object.assign(lab.style, { display: 'flex', alignItems: 'center', gap: '4px' });
      chk = L.DomUtil.create('input', '', lab); chk.type = 'checkbox'; chk.checked = true;
      L.DomUtil.create('span', '', lab).textContent = 'Auto 20s';
      L.DomEvent.on(chk, 'change', () => onToggleAuto?.(chk.checked));
    }

    // (tùy chọn) đếm xe
    let badge = null;
    if (showCount) {
      badge = L.DomUtil.create('span', '', box);
      badge.textContent = 'Xe:0';
      badge.style.cssText = 'font-size:12px;color:#334155;background:#f1f5f9;border:1px solid #e5e7eb;border-radius:8px;padding:4px 8px';
    }

    function updateList() {
      try {
        const arr = vehLayer?.getList?.() || [];
        if (badge) badge.textContent = 'Xe:' + arr.length;
        const plates = new Set();
        list.innerHTML = '';
        arr.forEach(v => {
          const p = v.plate || v.Plate || v.VehicleNo || '';
          if (!p || plates.has(p)) return;
          plates.add(p);
          const opt = document.createElement('option');
          opt.value = p;
          list.appendChild(opt);
        });
      } catch {}
    }

    function fallbackFocus(plate) {
      const items = vehLayer?.getList?.() || [];
      const key = String(plate).replace(/[^A-Z0-9]/gi, '').toUpperCase();
      const v = items.find(x =>
        (x.plateKey && x.plateKey === key) ||
        String(x.plate || '').toUpperCase() === String(plate).toUpperCase()
      );
      if (v && Number.isFinite(v.lat) && Number.isFinite(v.lng)) {
        map.setView([v.lat, v.lng], Math.max(map.getZoom(), 16));
        return true;
      }
      return false;
    }

    function doFind() {
      const plate = (input.value || '').trim();
      if (!plate) { input.focus(); return; }
      if (vehLayer?.focus?.(plate)) return;
      if (!fallbackFocus(plate)) alert('Không tìm thấy xe: ' + plate);
    }

    L.DomEvent.on(btnFind,  'click', (e)=>{ L.DomEvent.stop(e); doFind(); });
    L.DomEvent.on(input,    'keydown', (e)=>{ if (e.key === 'Enter'){ L.DomEvent.stop(e); doFind(); }});
    L.DomEvent.on(btnLoad,  'click', (e)=>{
      L.DomEvent.stop(e);
      btnLoad.disabled = true; btnLoad.textContent = 'Đang tải…';
      Promise.resolve(onRefresh?.()).finally(()=>{ btnLoad.disabled=false; btnLoad.textContent='Tải'; });
    });
    L.DomEvent.on(btnTable, 'click', (e)=>{ L.DomEvent.stop(e); onShowTable?.(); });

    L.DomEvent.disableClickPropagation(box);
    L.DomEvent.disableScrollPropagation(box);

    ctrl._updateList = updateList;
    return box;
  };

  ctrl.addTo(map);

  // Cập nhật dropdown khi có dữ liệu mới
  const onVeh = () => { ctrl._updateList?.(); };
  window.addEventListener('map:vehicles', onVeh);
  setTimeout(()=> ctrl._updateList?.(), 0);

  return {
    destroy(){
      window.removeEventListener('map:vehicles', onVeh);
      try { map.removeControl(ctrl); } catch {}
    }
  };
}
