// /src/luong/chuyen.compute.js
// Từ cache Logchuyen → tạo bảng Chuyến (1 dòng / nhân sự),
// MAP Note từ Khách hàng (final_data.json) → rồi tính #1 (Trip/Điểm ghép)
// và cuối cùng gán "Mức lương" vào #2 theo (Chức vụ, #1).
// Action: bus.act('chuyen.compute')

import { computeTripColumn1 } from './trip.counter.js';
import { applyMucluongToChuyen } from './mucluong.mapper.js';

export function registerChuyenCompute({ bus, store, reader, model, renderer, sel, setStatus } = {}) {
  if (!bus || !store || !reader || !model || !renderer || !sel) {
    throw new Error('registerChuyenCompute: thiếu dependency (bus/store/reader/model/renderer/sel)');
  }

  // ========= Utils =========
  const norm = (s) =>
    String(s ?? '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s*\)\s*/g, ')')
      .replace(/\s+/g, ' ')
      .trim();

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const pick  = (row, i) => (i >= 0 ? (row[i] ?? '') : '');

  function parseMonthFromUI() {
    const el = document.getElementById('monthDisplay');
    const s  = (el?.textContent || '').trim();            // "MM/YYYY"
    const m  = s.match(/^(\d{2})\/(\d{4})$/);
    if (!m) throw new Error('Không đọc được tháng (MM/YYYY) từ #monthDisplay.');
    return new Date(Number(m[2]), Number(m[1]) - 1, 1);
  }

  async function waitForLogChuyen(date, timeoutMs = 10000) {
    const ok = (d) => {
      const h = d?.header || d?.headers;
      const r = d?.rows   || d?.data;
      return Array.isArray(h) && h.length > 0 && Array.isArray(r) && r.length > 0;
    };
    const t0 = Date.now();
    let { doc } = await store.getOrFetch(reader, 'logchuyen', date);
    if (ok(doc)) return doc;

    while (Date.now() - t0 < timeoutMs) {
      await sleep(120);
      ({ doc } = await store.getOrFetch(reader, 'logchuyen', date));
      if (ok(doc)) return doc;
    }
    console.warn('[Chuyen.compute] waitForLogChuyen: TIMEOUT');
    return doc;
  }

  async function ensureChuyenKey(date) {
    try {
      const tmp = await store.getOrFetch(reader, 'chuyen', date);
      return tmp.key;
    } catch {
      const mm = String(date.getMonth()+1).padStart(2,'0');
      const yy = date.getFullYear();
      return `chuyen:${mm}-${yy}`;
    }
  }

  // ========= Header index helper =========
  const ALIAS = {
    id:    ['id chuyến','id chuyen','id','mã chuyến','ma chuyen'],
    ngay:  ['ngày','ngay','date','ngày đi','ngay di'],
    kh:    ['khách hàng','khach hang','khachhang','kh'],
    sl:    ['số lượng','so luong','sl'],
    ca:    ['ca','shift'],
    sharp: ['#','hash','flag'],         // NEW: cột "#" sẽ ghi đè "Ca" nếu có
    soxe:  ['số xe','so xe','bs','biển số','bien so'],
    taixe: ['tên tài xế','tai xe','tài xế','ten nhan vien','tên nhân viên','lai xe'],
    phuxe: ['tên phụ xe','phu xe','phụ xe'],
    ma_tx: ['mã nv (tx)','ma nv (tx)','mã tx','ma tx'],
    ma_px: ['mã nv (px)','ma nv (px)','mã px','ma px'],
    m1:    ['#1','m1'], m2: ['#2','m2'], m3: ['#3','m3'], m4: ['#4','m4'],
  };

  function buildIndex(headers) {
    const Hn = headers.map(h => norm(h));                // normalized
    const Hr = headers.map(h => String(h ?? '').trim()); // raw
    const map = new Map(Hn.map((h,i)=>[h,i]));
    const idx = {};
    for (const [k, aliases] of Object.entries(ALIAS)) {
      idx[k] = -1;

      // Đặc biệt cho cột "#": ưu tiên khớp RAW chính xác để không dính "#1/#2/…"
      if (k === 'sharp') {
        const j = Hr.findIndex(x => x === '#');
        if (j >= 0) { idx[k] = j; continue; }
      }

      // exact by normalized text
      for (const a of aliases) {
        const key = norm(a);
        if (map.has(key)) { idx[k] = map.get(key); break; }
      }
      if (idx[k] < 0) {
        // contains-fallback (bỏ qua 'sharp' vì dễ match nhầm '#1')
        if (k === 'sharp') continue;
        const toks = aliases[0].split(/\s+/);
        for (let i=0;i<Hn.length;i++){
          const h = Hn[i]; if (toks.every(t=>h.includes(t))) { idx[k]=i; break; }
        }
      }
    }
    return idx;
  }

  // ========= Output header =========
  const CHUYEN_HEADERS = [
    'ID chuyến','Ngày','Mã NV','Tên nhân viên','Chức vụ','Số xe',
    'Khách hàng','Số lượng','Ca','#1','#2','#3','#4','Note'
  ];

  function toChuyenRows(logDoc) {
    const headers = logDoc.header || logDoc.headers || [];
    const rows    = logDoc.rows   || logDoc.data    || [];
    const idx     = buildIndex(headers);

    const out = [];
    for (const r of rows) {
      const tx   = idx.taixe >= 0 ? String(r[idx.taixe] ?? '').trim() : '';
      const px   = idx.phuxe >= 0 ? String(r[idx.phuxe] ?? '').trim() : '';
      const maTX = idx.ma_tx >= 0 ? String(r[idx.ma_tx] ?? '').trim() : '';
      const maPX = idx.ma_px >= 0 ? String(r[idx.ma_px] ?? '').trim() : '';

      // NEW: Ưu tiên lấy "Ca" từ cột "#", nếu trống thì dùng cột "Ca" như cũ
      const caFromSharp = idx.sharp >= 0 ? String(r[idx.sharp] ?? '').trim() : '';
      const caValue     = caFromSharp || (idx.ca >= 0 ? String(r[idx.ca] ?? '').trim() : '');

      if (!tx && !px) continue;

      if (tx) {
        out.push([
          pick(r, idx.id), pick(r, idx.ngay),
          maTX, tx, 'Tài xế',
          pick(r, idx.soxe), pick(r, idx.kh),
          pick(r, idx.sl), caValue,
          pick(r, idx.m1), pick(r, idx.m2), pick(r, idx.m3), pick(r, idx.m4),
          '' // Note
        ]);
      }
      if (px) {
        out.push([
          pick(r, idx.id), pick(r, idx.ngay),
          maPX, px, 'Phụ xe',
          pick(r, idx.soxe), pick(r, idx.kh),
          pick(r, idx.sl), caValue,
          pick(r, idx.m1), pick(r, idx.m2), pick(r, idx.m3), pick(r, idx.m4),
          '' // Note
        ]);
      }
    }
    return out;
  }

  // ====== NOTE MAPPING ======
  async function getKhachHangNoteMap() {
    let ref = null;
    try {
      ref = (store.getReference && store.getReference()) ||
            store.refSheets || store.reference || store.refs || null;
    } catch(_) {}
    const sheets = ref?.sheets || ref || null;
    let khSheet = sheets?.khachhang || null;

    if (!khSheet) {
      try {
        const { sheets: s2 } = await reader.loadFinal();
        khSheet = s2?.khachhang || null;
      } catch(err) {
        console.warn('[Chuyen.compute] Không lấy được final_data:', err);
      }
    }
    if (!khSheet) return new Map();

    const headers = khSheet.headers || khSheet.header || [];
    const rows    = khSheet.data    || khSheet.rows   || [];

    let khIdx = -1, noteIdx = -1;
    headers.forEach((h,i)=>{
      const n = norm(h);
      if (khIdx   < 0 && (n.includes('khach') && n.includes('hang'))) khIdx = i;
      if (noteIdx < 0 && (n === 'note' || (n.includes('ghi') && n.includes('chu')))) noteIdx = i;
    });
    if (khIdx < 0 || noteIdx < 0) return new Map();

    const map = new Map();
    for (const r of rows) {
      const kh = norm(r[khIdx]);
      const nt = String(r[noteIdx] ?? '').trim();
      if (!kh || !nt) continue;
      if (!map.has(kh)) map.set(kh, nt); // giữ ghi chú đầu tiên
    }
    return map;
  }

  function ensureCol(header, rows, name) {
    let i = header.findIndex(h => norm(h) === norm(name));
    if (i >= 0) return i;
    header.push(name);
    i = header.length - 1;
    for (const r of rows) r[i] = r[i] ?? '';
    return i;
  }

  // ========= Core flow =========
  let running = false;

  async function computeAndShow() {
    if (running) { console.warn('[Chuyen.compute] đang chạy, bỏ qua lần gọi thêm'); return; }
    running = true;
    try {
      const date = parseMonthFromUI();
      setStatus && setStatus('Đang tải Logchuyen...');

      // 1) Chắc chắn có Logchuyen
      const logDoc = await waitForLogChuyen(date);

      // 2) Logchuyen → Chuyến (1 dòng/nhân sự)
      const rows = toChuyenRows(logDoc);
      const payload = { headers: CHUYEN_HEADERS.slice(), data: rows };

      // 3) MAP "Note" từ Khách hàng (final_data.json) — CHẠY TRƯỚC
      setStatus && setStatus('Đang map Note từ Khách hàng…');
      const noteMap = await getKhachHangNoteMap();
      const khIdx   = payload.headers.findIndex(h => norm(h).includes('khach') && norm(h).includes('hang'));
      const noteIdx = ensureCol(payload.headers, payload.data, 'Note');

      let noteHits = 0;
      if (khIdx >= 0 && noteMap.size) {
        for (const r of payload.data) {
          const nt = noteMap.get(norm(r[khIdx]));
          if (nt && r[noteIdx] !== nt) { r[noteIdx] = nt; noteHits++; }
        }
      }

      // 4) Tính #1 (Trip/Điểm ghép) — ưu tiên Note/Tăng cường
      const trip = computeTripColumn1({
        header: payload.headers,
        rows:   payload.data,
        outColumnName: '#1'
      });
      payload.headers = trip.header;
      payload.data    = trip.rows;

      // 5) Gán Mức lương (#2) theo (Chức vụ, #1) từ Mucluong
      setStatus && setStatus('Đang gán Mức lương (#2)…');
      await applyMucluongToChuyen({
        reader,
        payload,              // { headers, data } — cập nhật trực tiếp
        colRole: 'Chức vụ',
        colTrip: '#1',
        colWage: '#2'
      });

      // 6) Đẩy vào grid & render
      const key = await ensureChuyenKey(date);
      store.docs.set(key, { header: payload.headers, rows: payload.data, fmt: {}, dirty: false, version: 0 });
      store.toModel(key, model, renderer);
      renderer.render();

      // focus cột #1 để thấy kết quả ngay
      const outCol = trip.indexes?.outIdx ?? payload.headers.findIndex(h => String(h).trim() === '#1');
      if (outCol >= 0) sel.setActive(0, outCol);
      bus.emit('selection.changed');

      setStatus && setStatus(
        `Chuyến: ${payload.data.length} dòng • Trip=${trip.stats?.trips ?? 0}, TC=${trip.stats?.tangCuong ?? 0} • Note map=${noteHits}`
      );
    } catch (e) {
      console.error('[Chuyen.compute] Lỗi:', e);
      setStatus && setStatus('Lỗi tính chuyến – xem console');
    } finally {
      running = false;
    }
  }

  // ===== Action & Console API =====
  bus.registerAction?.('chuyen.compute', () => computeAndShow());
  window.LuongCalc = Object.assign(window.LuongCalc || {}, {
    chuyenCompute: () => computeAndShow()
  });
}
