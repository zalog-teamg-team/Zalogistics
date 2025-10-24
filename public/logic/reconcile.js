// src/logic/reconcile.js
// VLOOKUP Chấm công -> Log chuyến theo (Ngày + Số xe + Ca)
// Kết quả: Tên tài xế, Tên Phụ xe, Mã NV (tx), Mã NV (px), # — luôn ghi đè; không khớp => rỗng

// ===== helpers =====
const norm = (s) => String(s ?? '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .replace(/[^\w\s]/g,' ').replace(/\s+/g,' ')
  .trim().toLowerCase();

const normPlate = (s) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g,'');
const normShift = (s) => norm(s);

// dd/mm/yyyy | dd-mm-yyyy | dd.mm.yyyy | yyyy-mm-dd[ HH:MM:SS]
function normYMD(s){
  if (!s) return '';
  const str = String(s).trim();
  let m = str.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = str.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
  if (m) return `${m[3]}-${String(m[2]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`;
  const d = new Date(str);
  if (!isNaN(d)) return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  return '';
}

// Tìm cột theo danh sách "ứng viên", so sánh cả bản normalized lẫn raw (để bắt trường hợp tiêu đề là "#")
function findColIdx(header, candidates){
  const Hn = header.map(norm);
  const Hr = header.map(h => String(h ?? '').trim());
  for (const candRaw of candidates){
    const candNorm = norm(candRaw);
    if (candNorm){
      const i = Hn.indexOf(candNorm);
      if (i !== -1) return i;
    }
    const j = Hr.findIndex(x => x === candRaw);
    if (j !== -1) return j;
  }
  return -1;
}

// ===== core =====
// Trả về: { rows, changedCells, matchedRows }
export function vlookupChamcongToLog(logDoc, chamDoc){
  if (!logDoc || !chamDoc) return { rows: logDoc?.rows ?? [], changedCells: 0, matchedRows: 0 };

  // Columns in Chấm công (+ Mã NV, # là optional)
  const ch = chamDoc.header || [];
  const cIdx = {
    ngay:  findColIdx(ch, ['ngày','ngay','date']),
    soxe:  findColIdx(ch, ['số xe','so xe','biển số','bien so','bien so xe','bsx','xe']),
    ca:    findColIdx(ch, ['ca','ca làm','ca lam','ca lam viec','shift']),
    ten:   findColIdx(ch, ['tên nhân viên','ten nhan vien','nhan vien','ten nv','họ và tên','ho va ten']),
    vu:    findColIdx(ch, ['chức vụ','chuc vu','vai tro','role','position']),
    manv:  findColIdx(ch, ['mã nv','ma nv','mã nhân viên','ma nhan vien','employee id','employee code','nv id']),
    sharp: findColIdx(ch, ['#','hash','flag'])
  };
  if (cIdx.ngay<0 || cIdx.soxe<0 || cIdx.ca<0 || cIdx.ten<0 || cIdx.vu<0){
    return { rows: logDoc.rows, changedCells: 0, matchedRows: 0 };
  }

  // Build index từ Chấm công
  /** @type {Map<string,{driver:string, assistant:string, driverCode:string, assistantCode:string, sharp:string}>} */
  const index = new Map();
  for (const row of (chamDoc.rows || [])){
    const d = normYMD(row[cIdx.ngay]);
    const p = normPlate(row[cIdx.soxe]);
    const ca = normShift(row[cIdx.ca]);
    const name = String(row[cIdx.ten] ?? '').trim();
    const role = norm(row[cIdx.vu]);
    const code = (cIdx.manv>=0) ? String(row[cIdx.manv] ?? '').trim() : '';
    const sharp = (cIdx.sharp>=0) ? String(row[cIdx.sharp] ?? '').trim() : '';
    if (!d || !p || !ca || !name) continue;

    const key = `${d}|${p}|${ca}`;
    let rec = index.get(key);
    if (!rec) rec = { driver:'', assistant:'', driverCode:'', assistantCode:'', sharp:'' };

    if (role.includes('tai') && role.includes('xe')) {
      if (!rec.driver) rec.driver = name;                 // lấy lần xuất hiện đầu tiên
      if (!rec.driverCode && code) rec.driverCode = code; // kèm mã NV
    } else if (role.includes('phu') && role.includes('xe')) {
      if (!rec.assistant) rec.assistant = name;
      if (!rec.assistantCode && code) rec.assistantCode = code;
    }
    if (!rec.sharp && sharp) rec.sharp = sharp;           // cột #
    index.set(key, rec);
  }

  // Columns in Log chuyến (+ cột Mã NV (tx), Mã NV (px), # là optional)
  const lh = logDoc.header || [];
  const lIdx = {
    ngay:    findColIdx(lh, ['ngày','ngay','date']),
    soxe:    findColIdx(lh, ['số xe','so xe','biển số','bien so','bien so xe','bsx','xe']),
    ca:      findColIdx(lh, ['ca','shift','ca làm','ca lam']),
    laixe:   findColIdx(lh, ['tên tài xế','ten tai xe','tai xe','lái xe','lai xe']),
    phuxe:   findColIdx(lh, ['tên phụ xe','ten phu xe','phu xe']),
    manv_tx: findColIdx(lh, ['mã nv (tx)','ma nv (tx)','mã nv tx','ma nv tx','mã nv tài xế','ma nv tai xe','ma nv laixe']),
    manv_px: findColIdx(lh, ['mã nv (px)','ma nv (px)','mã nv px','ma nv px','mã nv phụ xe','ma nv phu xe']),
    sharp:   findColIdx(lh, ['#','hash','flag'])
  };
  if (lIdx.ngay<0 || lIdx.soxe<0 || lIdx.ca<0 || (lIdx.laixe<0 && lIdx.phuxe<0 && lIdx.manv_tx<0 && lIdx.manv_px<0 && lIdx.sharp<0)){
    return { rows: logDoc.rows, changedCells: 0, matchedRows: 0 };
  }

  // Apply (STRICT overwrite: luôn ghi đè; nếu không tìm thấy => rỗng)
  let changedCells = 0, matchedRows = 0;
  const out = logDoc.rows.map((r)=>{
    const row = r.slice();
    const d = normYMD(row[lIdx.ngay]);
    const p = normPlate(row[lIdx.soxe]);
    const ca = normShift(row[lIdx.ca]);

    const key = (d && p && ca) ? `${d}|${p}|${ca}` : null;
    const rec = key ? index.get(key) : null;
    if (rec) matchedRows++;

    if (lIdx.laixe >= 0){
      const next = rec?.driver ?? '';
      if ((row[lIdx.laixe] ?? '') !== next){ row[lIdx.laixe] = next; changedCells++; }
    }
    if (lIdx.phuxe >= 0){
      const next = rec?.assistant ?? '';
      if ((row[lIdx.phuxe] ?? '') !== next){ row[lIdx.phuxe] = next; changedCells++; }
    }
    if (lIdx.manv_tx >= 0){
      const next = rec?.driverCode ?? '';
      if ((row[lIdx.manv_tx] ?? '') !== next){ row[lIdx.manv_tx] = next; changedCells++; }
    }
    if (lIdx.manv_px >= 0){
      const next = rec?.assistantCode ?? '';
      if ((row[lIdx.manv_px] ?? '') !== next){ row[lIdx.manv_px] = next; changedCells++; }
    }
    if (lIdx.sharp >= 0){
      const next = rec?.sharp ?? '';
      if ((row[lIdx.sharp] ?? '') !== next){ row[lIdx.sharp] = next; changedCells++; }
    }
    return row;
  });

  return { rows: out, changedCells, matchedRows };
}

// (giữ tên cũ để ai đã import vẫn chạy)
export const autoMapChamcongToLog = (logDoc, chamDoc, _opts={}) => vlookupChamcongToLog(logDoc, chamDoc);
