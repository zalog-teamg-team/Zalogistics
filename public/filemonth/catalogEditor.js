// /src/filemonth/catalogEditor.js
// Gộp 2 editor (final + mucluong) — dùng chung core openGridEditor
// - openFinalEditor(): 3 tab KH/NV/PT, load/save qua gasOps
// - openMucluongEditor(): 1 tab, đọc/ghi Mucluong.json trực tiếp
//
// Yêu cầu: căn trái tiêu đề & nội dung cột -> ensureLeftAlign()

import { openGridEditor } from './editorCore.js';
import { loadFinalPack, saveFinalPack } from './gasOps.js'; // final_data.json

function ensureLeftAlign() {
  if (document.getElementById('fe-left-align')) return;
  const st = document.createElement('style');
  st.id = 'fe-left-align';
  st.textContent = `
    /* Luôn căn trái cho header + cell */
    .fe-grid-light .fe-t th, .fe-grid-light .fe-t td { text-align: left; }
  `;
  document.head.appendChild(st);
}

/** ===== FINAL (KH/NV/PT) ===== */
export function openFinalEditor(opts = {}) {
  ensureLeftAlign();
  const onSaved = typeof opts.onSaved === 'function' ? opts.onSaved : () => {};

  return openGridEditor({
    title: 'Cập nhật KH/NV/PT',
    tabs: [
      { key: 'khachhang', label: 'Khách hàng' },
      { key: 'nhanvien',   label: 'Nhân viên' },
      { key: 'phuongtien', label: 'Phương tiện' }
    ],
    async load() {
      // Giữ chuẩn headers/data đồng bộ với gasOps
      const pack = await loadFinalPack();
      return {
        khachhang: pack.khachhang || { headers: [], data: [], fmt: {} },
        nhanvien:  pack.nhanvien   || { headers: [], data: [], fmt: {} },
        phuongtien:pack.phuongtien || { headers: [], data: [], fmt: {} }
      };
    },
    async save(store) {
      await saveFinalPack({
        khachhang: store.khachhang,
        nhanvien:  store.nhanvien,
        phuongtien:store.phuongtien
      });
    },
    onSaved
  });
}

/** ===== MUCLUONG (1 sheet) ===== */
export function openMucluongEditor(opts = {}) {
  ensureLeftAlign();
  const fileName = String(opts.file || 'Mucluong.json').trim();
  const onSaved  = typeof opts.onSaved === 'function' ? opts.onSaved : () => {};

  const DATA_BASE = (typeof window !== 'undefined' && window.DATA_BASE_URL) || '/filejson/';
  const SAVE_BASE = (typeof window !== 'undefined' && window.SAVE_URL_BASE) || '/api/filejson/';

  return openGridEditor({
    title: 'Chỉnh sửa Mức lương',
    tabs: [{ key: 'mucluong', label: 'Mức lương' }],

    async load() {
      const url = String(DATA_BASE).replace(/\/+$/,'/') + fileName + '?_=' + Date.now();
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      const json = await res.json();

      // Chuẩn hoá cho core (headers/data/fmt)
      const headers = Array.isArray(json.headers) ? json.headers : (Array.isArray(json.header) ? json.header : []);
      const data    = Array.isArray(json.data)    ? json.data    : (Array.isArray(json.rows)   ? json.rows   : []);
      const fmt     = (json.fmt && typeof json.fmt === 'object') ? json.fmt : {};
      return { mucluong: { headers, data, fmt } };
    },

    async save(store) {
      const sheet = store.mucluong || { headers: [], data: [], fmt: {} };
      if (!sheet.data?.length) throw new Error('Dữ liệu rỗng — không lưu để tránh ghi đè.');

      const url  = String(SAVE_BASE).replace(/\/+$/,'/') + fileName;
      const body = JSON.stringify({ headers: sheet.headers, data: sheet.data, fmt: sheet.fmt || {} }, null, 2);
      const res  = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body, cache: 'no-store', credentials: 'same-origin'
      });
      if (!res.ok) {
        const t = await res.text().catch(()=> '');
        throw new Error(`HTTP ${res.status} ${res.statusText} ${t}`);
      }
      await res.json().catch(()=> ({}));
    },

    onSaved
  });
}
