// src/luong/mucluong.mapper.js
// Gán đơn giá vào cột #2 theo (Chức vụ, #1).
// Mới: Bám theo tiêu đề thực tế của bảng Mức lương (header linh hoạt, hỗ trợ cột tuỳ biến như "xx").
// Sử dụng chung trong chuyen.compute.js (bước 5).

export async function applyMucluongToChuyen({
  reader,
  payload,             // { headers, data }
  colRole = 'Chức vụ', // cột chức vụ trên bảng Chuyến
  colTrip = '#1',      // cột đã tính Trip/TC/CX/... (hoặc nhãn tuỳ biến)
  colWage = '#2'       // cột output
} = {}) {
  if (!reader || !payload || !Array.isArray(payload.headers) || !Array.isArray(payload.data)) {
    throw new Error('applyMucluongToChuyen: thiếu reader hoặc payload {headers, data}');
  }

  const H = payload.headers;
  const rows = payload.data;

  const roleIdx = findColIndex(H, [colRole, 'chuc vu', 'role', 'vi tri', 'position']);
  const tripIdx = findColIndex(H, [colTrip, 'm1']);
  const wageIdx = ensureCol(H, rows, colWage);

  if (roleIdx < 0 || tripIdx < 0) return 0;

  const lookup = await buildMucluongLookup(reader);
  let hits = 0;

  for (const r of rows) {
    const roleKey = norm(r[roleIdx]);
    const key = canonKeyFromTripCell(r[tripIdx]);   // '' nếu không hợp lệ / "Điểm ghép"
    const rec = lookup.get(roleKey);
    const val = rec && key ? (rec[key] || 0) : 0;
    r[wageIdx] = val ? String(val) : '';            // giữ dạng chuỗi cho đồng nhất grid
    if (val) hits++;
  }
  return hits;
}

/* ========================= Helpers ========================= */

function norm(s) {
  return String(s ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ').trim().toLowerCase();
}

function findColIndex(header, namesOrAliases) {
  const H = header.map(norm);
  // exact
  for (const n of namesOrAliases) {
    const i = H.findIndex(h => h === norm(n));
    if (i >= 0) return i;
  }
  // contains
  for (const n of namesOrAliases) {
    const i = H.findIndex(h => h.includes(norm(n)));
    if (i >= 0) return i;
  }
  return -1;
}

function ensureCol(header, rows, name) {
  let i = header.findIndex(h => norm(h) === norm(name));
  if (i >= 0) return i;
  header.push(name);
  i = header.length - 1;
  for (const r of rows) r[i] = r[i] ?? '';
  return i;
}

/** Chuẩn hoá KEY dùng cho tiêu đề trong bảng Mức lương.
 *  - Nhận dạng Trip1..n (trip, t, m)  → "trip n"
 *  - "tc"/"tăng cường"               → "tang cuong"
 *  - "cx"/"chuyến xa"                → "chuyen xa"
 *  - Các cột khác (ví dụ "xx")       → trả về chính tên cột (sau khi norm)
 *  - Loại bỏ các cột không phải đơn giá (chức vụ, mức lương, ghi chú, …) → ''
 */
function canonKeyFromHeader(h) {
  const n = norm(h);
  if (!n) return '';

  // loại các cột không phải đơn giá
  const blacklist = [
    'chuc vu', 'chucvu', 'muc luong', 'muc luong co ban', 'luong', 'ghi chu', 'ghi chu 1', 'ghi chu 2'
  ];
  if (blacklist.includes(n)) return '';

  // Trip N (không giới hạn N)
  const m = n.match(/(?:^|\s)(?:trip|t|m)\s*([0-9]+)\b/);
  if (m) return `trip ${m[1]}`;
  if (n === 'trip') return 'trip 1';

  if (n === 'tc' || n.includes('tang cuong') || n.includes('tang-cuong')) return 'tang cuong';
  if (n === 'cx' || n.includes('chuyen xa') || n.includes('chuyen-xa')) return 'chuyen xa';

  // cột tuỳ biến -> giữ nguyên
  return n;
}

/** Chuẩn hoá KEY lấy từ ô #1 bên bảng Chuyến. */
function canonKeyFromTripCell(v) {
  const n = norm(v);
  if (!n) return '';
  if (n.includes('diem ghep')) return ''; // Điểm ghép -> không tính

  // Trip N (không giới hạn N)
  const m = n.match(/(?:^|\s)(?:trip|t|m)\s*([0-9]+)\b/);
  if (m) return `trip ${m[1]}`;
  if (n === 'trip') return 'trip 1';

  if (n === 'tc' || n.includes('tang cuong') || n.includes('tang-cuong')) return 'tang cuong';
  if (n === 'cx' || n.includes('chuyen xa') || n.includes('chuyen-xa')) return 'chuyen xa';

  // nhãn tuỳ biến (vd: "xx") -> dùng nguyên văn
  return n;
}

// Chuyển chuỗi số về số (hỗ trợ 1.234.567 / 1,234,567 / "120k" / "120 000")
function toNumber(x) {
  const s0 = String(x ?? '').toLowerCase().trim();
  if (!s0) return 0;
  if (/k$/.test(s0)) {
    const n = Number(s0.slice(0, -1).replace(/[^\d.\-]/g, ''));
    return Number.isFinite(n) ? Math.round(n * 1000) : 0;
  }
  const s = s0.replace(/[.\s](?=\d{3}\b)/g, '').replace(/,/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

/** Đọc bảng Mức lương từ final_data và build Map<roleNorm, {key: value}>.
 *  key = canonKeyFromHeader(tiêu đề cột), value = số tiền.
 */
async function buildMucluongLookup(reader) {
  const { sheets } = await reader.loadFinal();
  const ml = sheets?.mucluong || {};
  const headers = ml.headers || ml.header || [];
  const data = ml.data || ml.rows || [];

  const roleIdx = findColIndex(headers, ['Chức vụ', 'chuc vu', 'role', 'vi tri', 'position']);
  const colKeys = new Map(); // Map<canonKey, colIndex>

  // Lập map cột theo tiêu đề thực tế
  for (let j = 0; j < headers.length; j++) {
    if (j === roleIdx) continue;
    const key = canonKeyFromHeader(headers[j]);
    if (!key) continue;
    colKeys.set(key, j); // tiêu đề trùng -> cột sau cùng sẽ ghi đè
  }

  const table = new Map();
  if (roleIdx < 0 || data.length === 0) return table;

  for (const r of data) {
    const roleKey = norm(r[roleIdx]);
    if (!roleKey) continue;

    const rec = {};
    for (const [k, col] of colKeys) {
      rec[k] = toNumber(r[col]);
    }
    table.set(roleKey, rec);
  }
  return table;
}
