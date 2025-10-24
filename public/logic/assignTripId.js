// logic/assignTripId.js
// YÊU CẦU:
// - Region mode (chọn > 1 ô):
//   • Gom HÀNG THEO (Ngày + Ca) trong vùng chọn.
//   • Mỗi (Ngày+Ca) => 1 nhóm => gán CÙNG 1 ID.
//   • Chọn ID cho mỗi nhóm = "khoảng trống nhỏ nhất" TRONG NGÀY,
//     tính trên TOÀN BẢNG nhưng *KHÔNG TÍNH các hàng đang chọn* (vì sẽ bị ghi đè).
//   • Sau đó TẠO LẠI TOÀN BỘ dãy ID của NGÀY đó để LIÊN TỤC (0001…000N),
//     trong đó các NHÓM đã gán ở trên được GIỮ NGUYÊN (vẫn cùng 1 ID, cùng suffix).
//   • KHÁC CA KHÔNG CHUNG ID (gom theo ngày+ca, mỗi ca 1 ID riêng).
//
// - Global mode (≤ 1 ô được chọn):
//   • Quét toàn bảng, chỉ điền ID cho hàng RỖNG ID & đủ dữ liệu (Ngày/Khách hàng/Số lượng/Ca).
//   • Mỗi ngày vẫn đảm bảo không trùng số, dùng "khoảng trống nhỏ nhất" cho từng hàng.
//
// ID format: dd.mm.yy.####

import { SetCells } from '../core/commands.js';

const norm = (s) =>
  String(s ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '');

function findHeader(headers, candidates){
  const hs = headers.map(h => norm(h));
  for (const cand of candidates){
    const c = norm(cand);
    let i = hs.indexOf(c);
    if (i >= 0) return i;
    i = hs.findIndex(x => x.includes(c));
    if (i >= 0) return i;
  }
  return -1;
}

// yyyy-mm-dd (linh hoạt)
function toISO(v){
  const s = String(v ?? '').trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s; // yyyy-mm-dd
  let m = s.match(/^(\d{1,2})[\/.\- ](\d{1,2})[\/.\- ](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`; // dd/mm/yyyy
  m = s.match(/^(\d{4})[\/.\- ](\d{1,2})[\/.\- ](\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`; // yyyy/mm/dd
  const d = new Date(s);
  return isNaN(d) ? '' :
    `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

const idPrefix = (iso) =>
  (iso || '').replace(/^(\d{4})-(\d{2})-(\d{2})$/, (_,y,m,d)=> `${d}.${m}.${String(y).slice(-2)}`);

const pad4 = (n) => String(n).padStart(4,'0');
const reId  = /^(\d{2}\.\d{2}\.\d{2})\.(\d{1,})$/;

function parseSuffixIfPrefix(idStr, pfx){
  const m = reId.exec(String(idStr || '').trim());
  if (!m || m[1] !== pfx) return null;
  const n = Number(m[2]); return Number.isFinite(n) ? n : null;
}

const hasText = (v)=> String(v ?? '').trim() !== '';
function eligible(model, r, cDate, cCust, cQty, cShift){
  const iso = toISO(model.get(r, cDate));
  const cust = String(model.get(r, cCust)  ?? '').trim();
  const qty  = String(model.get(r, cQty)   ?? '').trim();
  const sh   = String(model.get(r, cShift) ?? '').trim();
  return !!(iso && cust && qty && sh);
}

// Tập suffix đã dùng THEO NGÀY, có thể loại trừ một tập hàng (excludeRows)
function usedSuffixSetForDay(model, cId, cDate, isoDay, excludeRows=null){
  const pfx = idPrefix(isoDay); const used = new Set();
  const isEx = excludeRows instanceof Set ? (r)=> excludeRows.has(r) : ()=> false;
  for (let r=0; r<model.rows; r++){
    if (isEx(r)) continue;
    const iso = toISO(model.get(r, cDate));
    if (iso !== isoDay) continue;
    const suf = parseSuffixIfPrefix(model.get(r, cId), pfx);
    if (suf != null) used.add(suf);
  }
  return used;
}
function smallestGap(set){
  let n = 1; while(set.has(n)) n++; return n;
}

// Gom nhóm tự do (không thuộc selection) theo (ID hiện tại nếu hợp lệ, + Ca)
// để bảo toàn nhóm cũ, đồng thời tách theo Ca để "khác ca không chung ID"
function buildFreeGroupsForDay(model, rows, cId, cShift, pfx){
  /** @type {Map<string, {rows:number[], curSuffix:number|null, minRow:number}>} */
  const map = new Map();
  for (const r of rows){
    const shift = norm(model.get(r, cShift));
    const suf   = parseSuffixIfPrefix(model.get(r, cId), pfx);
    const key   = (suf != null) ? `id:${suf}|ca:${shift}` : `row:${r}|ca:${shift}`;
    let g = map.get(key);
    if (!g) { g = { rows:[], curSuffix: (suf!=null?suf:null), minRow: r }; map.set(key, g); }
    g.rows.push(r); if (r < g.minRow) g.minRow = r;
  }
  return Array.from(map.values());
}

// Đánh lại toàn bộ dãy ID trong 1 ngày (LIÊN TỤC) với:
// - lockedGroups: các nhóm đã được ấn định suffix (từ selection)
// - freeGroups:   các nhóm còn lại (không thuộc selection)
function renumberOneDay({ pfx, lockedGroups, freeGroups }){
  const locked = lockedGroups.slice().sort((a,b)=> a.minRow - b.minRow);
  const free   = freeGroups.slice().sort((a,b)=>{
    const sa = a.curSuffix ?? Infinity, sb = b.curSuffix ?? Infinity;
    if (sa !== sb) return sa - sb;
    return a.minRow - b.minRow;
  });

  const reserved = new Set(locked.map(g=> g.suffix));
  // K là tổng nhóm; đảm bảo bao phủ được các suffix đã khóa
  let K = locked.length + free.length;
  const maxLocked = Math.max(0, ...reserved);
  if (K < maxLocked) K = maxLocked;

  // Tạo danh sách số sẵn có (1..K) loại trừ số đã khóa
  const available = [];
  for (let i=1; i<=K; i++){ if (!reserved.has(i)) available.push(i); }

  // Gán số cho freeGroups theo thứ tự ổn định
  const assigned = [];
  let idx = 0;
  for (const g of free){
    const suf = available[idx] ?? (K + (idx - available.length) + 1);
    assigned.push({ group:g, suffix:suf });
    idx++;
  }

  // Xuất: row -> suffix
  /** @type {Map<number, number>} */
  const rowToSuf = new Map();
  for (const g of locked){ for (const r of g.rows) rowToSuf.set(r, g.suffix); }
  for (const a of assigned){ for (const r of a.group.rows) rowToSuf.set(r, a.suffix); }

  return rowToSuf;
}

export function assignTripId({ model, sel, renderer, cmdMgr } = {}){
  if (!model || !sel || !renderer || !cmdMgr) {
    throw new Error('assignTripId: thiếu tham số (model/sel/renderer/cmdMgr)');
  }

  const headers = renderer.headers || [];
  const cId    = findHeader(headers, ['id chuyến','id chuyen','idchuyen','trip id','id']);
  const cDate  = findHeader(headers, ['ngày','ngay','date','ngay chuyen','ngay giao','ngay di']);
  const cCust  = findHeader(headers, ['khach hang','khachhang','kh','customer','nguoi nhan','nguoinhan']);
  const cQty   = findHeader(headers, ['so luong','số lượng','soluong','sl','quantity','qty']);
  const cShift = findHeader(headers, ['ca','shift','ca lam','ca làm','ca lam viec']);
  if ([cId, cDate, cCust, cQty, cShift].some(i => i < 0)){
    console.warn('[assignTripId] Thiếu cột bắt buộc: Ngày/Khách hàng/Số lượng/Ca hoặc cột ID.');
    return;
  }

  // Tính số ô đang chọn (hỗ trợ selection.getAllRanges())
  const ranges = typeof sel.getAllRanges === 'function' ? sel.getAllRanges() : [sel.range]; // API có sẵn trong Selection. :contentReference[oaicite:3]{index=3}
  let selectedCells = 0;
  for (const R of ranges) selectedCells += (R.r1 - R.r0 + 1) * (R.c1 - R.c0 + 1);

  // Xác định rows mục tiêu
  let targetRows = [];
  if (selectedCells > 1){
    const set = new Set();
    for (const R of ranges){ for (let r=R.r0; r<=R.r1; r++) set.add(r); }
    targetRows = Array.from(set).filter(r => r>=0 && r<model.rows).sort((a,b)=>a-b);
  } else {
    targetRows = Array.from({length:model.rows}, (_,r)=> r);
  }
  if (!targetRows.length) return;

  // Chuẩn bị commit cho nhiều ngày: gom toàn bộ hàng sẽ bị tác động
  const affected = new Set();

  // Bộ đệm before/after sẽ tính sau khi biết min/max row
  // ====== REGION MODE: chọn > 1 ô ======
  if (selectedCells > 1){
    // 1) Nhóm các hàng TRONG VÙNG theo (Ngày+Ca) — chỉ lấy hàng đủ dữ liệu
    /** @type {Map<string, number[]>} */ // key = `${iso}|${shiftKey}`
    const selectedGroups = new Map();
    for (const r of targetRows){
      if (!eligible(model, r, cDate, cCust, cQty, cShift)) continue;
      const iso = toISO(model.get(r, cDate));
      const shiftKey = norm(model.get(r, cShift));
      const key = `${iso}|${shiftKey}`;
      if (!selectedGroups.has(key)) selectedGroups.set(key, []);
      selectedGroups.get(key).push(r);
    }

    // 2) Với mỗi NGÀY có ít nhất 1 nhóm được chọn: gán trước suffix cho các nhóm được chọn
    //    theo "khoảng trống nhỏ nhất" của NGÀY đó, KHÔNG tính các hàng trong vùng.
    /** @type {Map<string, { locked: {rows:number[], suffix:number, minRow:number}[], dayRows:number[] }>} */
    const planByDay = new Map(); // key = iso

    // Xây tập các ngày xuất hiện trong selection
    const days = new Set(Array.from(selectedGroups.keys()).map(k => k.split('|')[0]));

    for (const isoDay of days){
      const pfx = idPrefix(isoDay);
      if (!pfx) continue;

      // Tất cả rows trong NGÀY (đủ dữ liệu) — để renumber full day
      const rowsInDay = [];
      for (let r=0; r<model.rows; r++){
        if (!eligible(model, r, cDate, cCust, cQty, cShift)) continue;
        if (toISO(model.get(r, cDate)) === isoDay) rowsInDay.push(r);
      }
      if (!rowsInDay.length) continue;

      // Nhóm đã chọn trong NGÀY này, tách theo Ca: key `${iso}|${shiftKey}`
      const locked = [];
      const excludeSet = new Set(targetRows); // loại trừ toàn selection khi tính used
      const usedSet = usedSuffixSetForDay(model, cId, cDate, isoDay, excludeSet);
      // Duyệt nhóm theo thứ tự ổn định (minRow)
      const selGroupsThisDay = Array.from(selectedGroups.entries())
        .filter(([k]) => k.startsWith(`${isoDay}|`))
        .map(([k, arr]) => ({ key:k, rows: arr.slice().sort((a,b)=>a-b), minRow: Math.min(...arr) }))
        .sort((a,b)=> a.minRow - b.minRow);

      for (const g of selGroupsThisDay){
        const suf = smallestGap(usedSet);
        usedSet.add(suf);
        locked.push({ rows: g.rows, suffix: suf, minRow: g.minRow });
      }

      planByDay.set(isoDay, { locked, dayRows: rowsInDay });
      for (const r of rowsInDay) affected.add(r);
    }

    // 3) Renumber TOÀN BỘ dãy trong từng NGÀY để LIÊN TỤC, giữ các nhóm locked
    /** @type {Map<number, string>} */ // row -> newId
    const rowToId = new Map();

    for (const [isoDay, info] of planByDay){
      const pfx = idPrefix(isoDay);
      const locked = info.locked;

      // Free groups = các nhóm không thuộc selection (tách theo id cũ + Ca)
      const dayRowSet = new Set(info.dayRows);
      const selRowSet = new Set(locked.flatMap(g => g.rows));
      const freeRows = info.dayRows.filter(r => !selRowSet.has(r));
      const freeGroups = buildFreeGroupsForDay(model, freeRows, cId, cShift, pfx);

      // Tính suffix cuối cùng cho toàn ngày
      const rowToSuf = renumberOneDay({ pfx, lockedGroups: locked, freeGroups });

      // Ghi map row -> ID
      for (const r of info.dayRows){
        const suf = rowToSuf.get(r);
        if (suf != null){
          rowToId.set(r, `${pfx}.${pad4(suf)}`);
        }
      }
    }

    // 4) Commit: tạo before/after trên cột ID cho toàn bộ hàng affected
    if (!affected.size) return;
    const rowsAll = Array.from(affected).sort((a,b)=>a-b);
    const minR = rowsAll[0], maxR = rowsAll[rowsAll.length-1];
    const rngCommit = { r0:minR, c0:cId, r1:maxR, c1:cId };
    const before = model.getRange(rngCommit);
    const after  = before.map((row)=> [row?.[0] ?? '']);

    let changed = false;
    for (const r of rowsAll){
      const newId = rowToId.get(r);
      if (!newId) continue;
      const idx = r - minR;
      if ((before[idx]?.[0] ?? '') !== newId){
        after[idx] = [newId];
        changed = true;
      }
    }
    if (!changed) return;
    cmdMgr.execute(SetCells(model, rngCommit, before, after));
    return;
  }

  // ====== GLOBAL MODE: ≤ 1 ô ======
  // Chỉ điền cho hàng RỖNG ID & đủ dữ liệu, dùng khoảng trống nhỏ nhất THEO NGÀY.
  // (vẫn đảm bảo không trùng giữa các ca vì toàn ngày không trùng số)
  /** @type {Map<string, Set<number>>} */ // iso -> used suffix set
  const usedByDay = new Map();

  // Chuẩn bị commit: ta sẽ chỉ đụng tới các hàng thực sự được gán
  const touch = [];
  for (const r of targetRows){
    const idNow = String(model.get(r, cId) ?? '').trim();
    if (idNow) continue;
    if (!eligible(model, r, cDate, cCust, cQty, cShift)) continue;

    const iso = toISO(model.get(r, cDate));
    const pfx = idPrefix(iso);
    if (!pfx) continue;

    if (!usedByDay.has(iso)){
      // Khởi tạo from toàn bảng (không exclude)
      const set = usedSuffixSetForDay(model, cId, cDate, iso, null);
      usedByDay.set(iso, set);
    }
    const set = usedByDay.get(iso);
    const suf = smallestGap(set);
    set.add(suf);

    touch.push({ r, id: `${pfx}.${pad4(suf)}` });
    affected.add(r);
  }

  if (!touch.length) return;

  const rowsAll = Array.from(affected).sort((a,b)=>a-b);
  const minR = rowsAll[0], maxR = rowsAll[rowsAll.length-1];
  const rngCommit = { r0:minR, c0:cId, r1:maxR, c1:cId };
  const before = model.getRange(rngCommit);
  const after  = before.map((row)=> [row?.[0] ?? '']);

  let changed = false;
  for (const { r, id } of touch){
    const idx = r - minR;
    if ((before[idx]?.[0] ?? '') !== id){
      after[idx] = [id];
      changed = true;
    }
  }
  if (!changed) return;
  cmdMgr.execute(SetCells(model, rngCommit, before, after));
}
