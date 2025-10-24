// /src/luong/trip.counter.js
// Tính cột #1 cho bảng Chuyến:
// - Nhãn = Note (nếu có) hoặc Ca (Ca đã ưu tiên lấy từ # nếu có trong bước chuyen.compute).
// - Số thứ tự = đếm ổn định theo (Tên NV + Ngày + Nhãn), khóa theo ID chuyến.
// - Đồng thời, nếu Note có nội dung thì thêm cùng số thứ tự vào cuối Note (tránh trùng số đã có).
// - Ghép: cùng (ID + Ngày + Tên NV) nhưng KH khác nhau -> giữ 1 dòng keeper (STT nhỏ nhất), còn lại = "Điểm ghép".

/* ===== Helpers ===== */
const vnNorm = (s) =>
  String(s ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim();

const eq = (a, b) => vnNorm(a) === vnNorm(b);

const indexOfHeader = (header, name) => {
  for (let i = 0; i < header.length; i++) if (eq(header[i], name)) return i;
  return -1;
};
const indexOfOneOf = (header, names = []) => {
  for (let i = 0; i < header.length; i++) {
    const h = header[i];
    for (const n of names) if (eq(h, n)) return i;
  }
  return -1;
};

const ensureCol = (header, rows, name) => {
  let i = indexOfHeader(header, name);
  if (i >= 0) return i;
  header.push(name);
  i = header.length - 1;
  for (const r of rows) r[i] = r[i] ?? '';
  return i;
};

const dayKeyOf = (v) => String(v ?? '').trim();   // không ép parse, giữ nguyên theo nguồn
const trimStr   = (v) => String(v ?? '').trim();

const parseOrdinal = (s) => {
  const m = String(s ?? '').trim().match(/(\d+)\s*$/);
  return m ? Number(m[1]) : Number.POSITIVE_INFINITY;
};

const noteWithOrdinal = (note, ord) => {
  const t = trimStr(note);
  if (!t) return '';
  // nếu Note đã kết thúc bằng số thì giữ nguyên
  if (/\d+\s*$/.test(t)) return t;
  return `${t} ${ord}`;
};

/* ===== Core ===== */
export function computeTripColumn1({
  header = [],
  rows = [],
  outColumnName = '#1',
} = {}) {
  // ---- Tìm các cột cần dùng ----
  const idIdx    = indexOfHeader(header, 'ID chuyến');
  const nameIdx  = indexOfHeader(header, 'Tên nhân viên');
  const dayIdx   = indexOfHeader(header, 'Ngày');
  const caIdx    = indexOfHeader(header, 'Ca');
  const khIdx    = indexOfHeader(header, 'Khách hàng');
  const noteIdx  = indexOfOneOf(header, ['Note', 'Ghi chú', 'Ghi chu', 'NOTE']);
  const outIdx   = ensureCol(header, rows, outColumnName);

  if (idIdx < 0 || nameIdx < 0) {
    console.warn('[TripCounter] Thiếu cột "ID chuyến" hoặc "Tên nhân viên". Header:', header);
    return {
      header, rows,
      indexes: { idIdx, nameIdx, dayIdx, caIdx, khIdx, noteIdx, outIdx },
      stats: { total: rows.length, assigned: 0, missingId: rows.length, ghepChanged: 0 }
    };
  }

  const stats = { total: rows.length, assigned: 0, missingId: 0, ghepChanged: 0 };

  // groups: nameKey -> dayKey -> labelKey -> Map(ID -> ordinal)
  const groups = new Map();
  const ordinals = new Array(rows.length).fill(null); // lưu STT từng dòng để thêm vào Note ở cuối

  // ===== PASS 1: Gán "#1" = "<LABEL> <STT>" =====
  for (let i = 0; i < rows.length; i++) {
    const r    = rows[i];
    const id   = trimStr(r[idIdx]);
    const name = r[nameIdx];
    const dayV = dayIdx >= 0 ? dayKeyOf(r[dayIdx]) : '';
    const caV  = caIdx  >= 0 ? trimStr(r[caIdx]) : '';
    const noteV= noteIdx>= 0 ? trimStr(r[noteIdx]) : '';

    if (!id) {
      r[outIdx] = ''; // thiếu ID -> không gán để tránh nhảy số sai
      stats.missingId++;
      continue;
    }

    // Nhãn: Note (nếu có) hoặc Ca (Ca đã được ưu tiên từ # ở bước chuyen.compute)
    const labelRaw = noteV || caV || 'Trip';
    const labelKey = vnNorm(labelRaw);
    const nameKey  = vnNorm(name);
    const dayKey   = dayV;

    let byDay = groups.get(nameKey);
    if (!byDay) { byDay = new Map(); groups.set(nameKey, byDay); }

    let byLabel = byDay.get(dayKey);
    if (!byLabel) { byLabel = new Map(); byDay.set(dayKey, byLabel); }

    let idMap = byLabel.get(labelKey);
    if (!idMap) { idMap = new Map(); byLabel.set(labelKey, idMap); }

    if (!idMap.has(id)) idMap.set(id, idMap.size + 1);
    const stt = idMap.get(id);

    r[outIdx]      = `${labelRaw} ${stt}`;
    ordinals[i]    = stt;
    stats.assigned++;

    // Nếu Note có nội dung, thêm cùng STT vào cuối Note (nếu chưa có số)
    if (noteIdx >= 0 && noteV) {
      r[noteIdx] = noteWithOrdinal(noteV, stt);
    }
  }

  // ===== PASS 2: Ghép theo (ID + Ngày + Tên NV) nếu có ≥ 2 KH khác nhau =====
  if (khIdx >= 0 && dayIdx >= 0) {
    const ghGroups = new Map(); // gkey -> { idxs:number[], customers:Set<string> }
    for (let i = 0; i < rows.length; i++) {
      const id   = trimStr(rows[i]?.[idIdx]);
      const day  = dayKeyOf(rows[i]?.[dayIdx]);
      const name = vnNorm(rows[i]?.[nameIdx] ?? '');
      if (!id || !day || !name) continue;

      const gkey = `${id}|||${day}|||${name}`;
      const kh   = vnNorm(rows[i]?.[khIdx] ?? '');
      const g = ghGroups.get(gkey) || { idxs: [], customers: new Set() };
      g.idxs.push(i);
      if (kh) g.customers.add(kh);
      ghGroups.set(gkey, g);
    }

    for (const [, g] of ghGroups.entries()) {
      if (g.customers.size <= 1) continue; // chỉ 1 KH -> không ghép

      // keeper = dòng có STT nhỏ nhất; nếu không có số thì lấy dòng đầu
      let keeperIdx = null, best = { idx: null, ord: Number.POSITIVE_INFINITY };
      for (const idx of g.idxs) {
        const ord = parseOrdinal(rows[idx]?.[outIdx]);
        if (ord < best.ord) best = { idx, ord };
      }
      keeperIdx = best.idx ?? g.idxs[0];

      const keeperKH = vnNorm(rows[keeperIdx]?.[khIdx] ?? '');
      for (const idx of g.idxs) {
        if (vnNorm(rows[idx]?.[khIdx] ?? '') === keeperKH) continue; // cùng KH với keeper -> giữ nguyên
        if (rows[idx][outIdx] !== 'Điểm ghép') {
          rows[idx][outIdx] = 'Điểm ghép';
          stats.ghepChanged++;
        }
      }
    }
  }

  // Debug gọn
  if (typeof console !== 'undefined') {
    const sample = rows.slice(0, 8).map((row) => ({
      Ngay: dayIdx>=0 ? row[dayIdx] : '',
      Ten:  row[nameIdx],
      KH:   khIdx>=0 ? row[khIdx] : '',
      ID:   row[idIdx],
      Ca:   caIdx>=0 ? row[caIdx] : '',
      Note: noteIdx>=0 ? row[noteIdx] : '',
      _1:   row[outIdx]
    }));
    console.log('[TripCounter] idx:', { idIdx, nameIdx, dayIdx, caIdx, khIdx, noteIdx, outIdx });
    console.log('[TripCounter] stats:', stats);
    console.table(sample);
  }

  return { header, rows, indexes: { idIdx, nameIdx, dayIdx, caIdx, khIdx, noteIdx, outIdx }, stats };
}
