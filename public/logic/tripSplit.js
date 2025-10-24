// logic/tripSplit.js
// splitLogRows(headers, rows, { sel:{r0,c0,r1,c1}, cap }) -> rows mới
const EPS = 1e-9;

// ---- parse số lượng chắc chắn ----
const firstNumberRe = /[-+]?\d+(?:[.,]\d+)?/;
const parseQty = (v)=>{
  const s = String(v ?? '').trim();
  const m = s.match(firstNumberRe);
  if (!m) return NaN;
  const t = m[0].replace(',', '.');
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
};
const isNumeric = (v)=> Number.isFinite(parseQty(v));

// ---- ngày & ID helpers ----
const todayISO = ()=>{
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).toString().padStart(2,'0')}`;
};
const toISO = (s)=>{
  if (!s) return '';
  const t = String(s).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  const d = new Date(t);
  return isNaN(d) ? '' : `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getDate().toString().padStart(2,'0')}`;
};
const fmtDMY = (iso)=> (iso||'').replace(/^(\d{4})-(\d{2})-(\d{2})$/, (_,y,m,d)=>`${d}/${m}/${y}`);
const idPrefix = (iso)=> (iso||'').replace(/^(\d{4})-(\d{2})-(\d{2})$/, (_,y,m,d)=>`${d}.${m}.${String(y).slice(-2)}`);

// ---- header helpers (linh hoạt) ----
const norm = s => String(s ?? '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .toLowerCase().replace(/[^a-z0-9]+/g,'');
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

// ---- cách chia (exact + chia nhỏ phần lẻ, xoay vòng, gộp theo khách trong 1 chuyến) ----
function buildPlan(items, cap){
  if (!(cap > 0)) throw new Error('cap phải > 0');
  const groups = new Map();
  const G = (date,shift)=> {
    const k = `${date}|${shift}`;
    if (!groups.has(k)) groups.set(k, {date,shift,exact:[],pieces:[],specials:[]});
    return groups.get(k);
  };

  // tách exact / pieces / specials theo thứ tự input
  for (const x of items){
    const date  = x?.date  ?? '';
    const shift = x?.shift ?? '';
    const cust  = (x?.customer ?? '').toString();
    const qtyS  = x?.qtyStr;

    const g = G(date, shift);
    if (!isNumeric(qtyS)) { g.specials.push({customer:cust, qty:qtyS}); continue; }

    let q = parseQty(qtyS);
    if (!(q > 0)) continue;

    // đủ cap -> 1 chuyến/đủ phần
    while (q >= cap - EPS) { g.exact.push({customer:cust, qty:cap}); q -= cap; }
    // phần lẻ -> giữ đúng THỨ TỰ để xoay vòng
    if (q > EPS) g.pieces.push({ key: cust.toLowerCase(), display: cust, qty: q });
  }

  const inserts = [];
  let seq = 0; const tmpId = ()=> `tmp.${++seq}`;

  for (const [,g] of groups){
    // 1) exact trước
    g.exact.forEach(e => inserts.push({ tripId: tmpId(), date:g.date, shift:g.shift, customer:e.customer, sl:e.qty }));

    // 2) residuals: CHIA NHỎ để lấp bin, xoay vòng, bắt đầu từ phần lẻ CUỐI CÙNG
    if (g.pieces.length){
      const res = g.pieces.map(r => ({...r})); // clone qty
      let total = res.reduce((s,a)=> s + a.qty, 0);
      let start = res.length - 1; // bắt đầu từ phần lẻ cuối cùng

      while (total > EPS){
        let capLeft = cap;
        const id = tmpId();

        const sumByKey = new Map();     // key -> qty
        const displayByKey = new Map(); // key -> tên gốc đầu tiên gặp
        let lastTouched = -1;
        let took = 0;

        // một vòng đi qua tất cả residual, CHO PHÉP lấy một phần để lấp đầy
        for (let step = 0; step < res.length && capLeft > EPS; step++){
          const idx = (start + step) % res.length;
          const r = res[idx];
          if (r.qty > EPS){
            const take = Math.min(capLeft, r.qty);
            if (take > EPS){
              r.qty -= take;
              capLeft -= take;
              took += take;
              lastTouched = idx;

              if (!sumByKey.has(r.key)) { sumByKey.set(r.key, 0); displayByKey.set(r.key, r.display); }
              sumByKey.set(r.key, sumByKey.get(r.key) + take);
            }
          }
        }

        // nếu có lấy được gì -> kết sổ chuyến
        if (took > EPS){
          for (const [key, q] of sumByKey){
            inserts.push({
              tripId: id,
              date: g.date, shift: g.shift,
              customer: displayByKey.get(key),
              sl: q
            });
          }
          total -= took;
          // chuyến sau bắt đầu ngay SAU mục vừa lấy cuối cùng
          start = (lastTouched >= 0) ? (lastTouched + 1) % res.length : start;
        }else{
          // không thể lấy thêm (do hết hàng) -> thoát
          break;
        }
      }
    }

    // 3) specials: giữ chuỗi số lượng
    g.specials.forEach(s => inserts.push({ tripId: tmpId(), date:g.date, shift:g.shift, customer:s.customer, sl:String(s.qty) }));
  }

  return { inserts };
}

function scanIdCounters(rows, colId){
  const map = new Map(); if (colId < 0) return map;
  const re = /^(\d{2}\.\d{2}\.\d{2})\.(\d{4,})$/;
  for (let r=0; r<rows.length; r++){
    const id = String(rows[r]?.[colId] ?? '');
    const m = re.exec(id); if (m){ const p=m[1], n=+m[2]; map.set(p, Math.max(map.get(p)||0, n)); }
  }
  return map;
}

// ---- PUBLIC API ----
export function splitLogRows(headers, dataRows, { sel, cap } = {}){
  if (!Array.isArray(headers) || !Array.isArray(dataRows)) throw new Error('Input không hợp lệ');
  if (!sel || (sel.c1 - sel.c0) !== 1) throw new Error('Vùng chọn phải là 2 cột liền kề');
  if (!(cap > 0)) throw new Error('cap phải > 0');

  const W = headers.length;
  const rows = dataRows.map(r => {
    const a = Array.isArray(r) ? r.slice() : [];
    if (a.length < W) a.length = W;
    for (let i=0;i<W;i++) if (a[i]==null) a[i]='';
    return a;
  });

  const cCust = sel.c0, cQty = sel.c1;
  // đọc cột Ngày cho input (nếu có)
  const colDateIn = findHeader(headers, ['ngay','date']);

// 1) Thu thập items từ vùng (lấy Ngày ở mỗi dòng; rỗng -> today)
const items = [];
for (let r = sel.r0; r <= sel.r1; r++) {
  const cust = String(rows[r]?.[cCust] ?? '').trim();
  const qtyS = String(rows[r]?.[cQty]  ?? '').trim();
  const dateCell = colDateIn >= 0 ? rows[r]?.[colDateIn] : '';
  const dateISO  = toISO(dateCell) || todayISO();
  if (cust && qtyS) items.push({ customer: cust, qtyStr: qtyS, date: dateISO, shift: '' });
}


  // 2) Build plan
  const plan = buildPlan(items, cap);
  const inserts = plan.inserts || [];

  // 3) Tìm cột ghi theo header (chỉ ghi cột tìm được)
  const colId    = findHeader(headers, ['id chuyen','id chuyến','idchuyen','id chuyến']);
  const colDate  = findHeader(headers, ['ngay','date']);
  const colCustH = findHeader(headers, ['khach hang','khachhang','kh']);
  const colQtyH  = findHeader(headers, ['so luong','soluong','sl']);
  const colShift = findHeader(headers, ['ca','shift']);
  const writeCols = [colId,colDate,colCustH,colQtyH,colShift].filter(i=> i>=0);

  // 4) XÓA DÒNG trong vùng
  rows.splice(sel.r0, sel.r1 - sel.r0 + 1);

  if (!inserts.length || !writeCols.length) return rows;

  // 5) Quét chỗ trống ưu tiên từ ngay dưới vùng → cuối bảng → từ đầu; thiếu thì THÊM DÒNG
  const isBlank = (r)=> writeCols.every(c => !String(rows[r]?.[c] ?? '').trim());
  const targets = [];
  const need = inserts.length;

  function scan(rStart, rEndIncl){
    for (let r=rStart; r<=rEndIncl && targets.length<need; r++){
      if (!rows[r]) rows[r] = Array(W).fill('');
      if (isBlank(r)) targets.push(r);
    }
  }
  scan(sel.r0, rows.length-1);
  scan(0, sel.r0-1);
  while (targets.length < need){ rows.push(Array(W).fill('')); targets.push(rows.length-1); }

  // 6) Cấp ID dd.mm.yy.0001… (cùng tripId → chung 1 ID)
  const counters = scanIdCounters(rows, colId);
  const reuse = new Map();
  const allocId = (iso)=>{
    const pfx = idPrefix(iso);
    const cur = counters.get(pfx) || 0;
    const nxt = cur + 1; counters.set(pfx, nxt);
    return `${pfx}.${String(nxt).padStart(4,'0')}`;
  };

  // 7) Ghi kết quả
  for (let i=0; i<inserts.length; i++){
    const r = targets[i];
    const t = inserts[i];
    const iso = toISO(t.date) || todayISO();
    const id  = (colId >= 0) ? (reuse.get(t.tripId) || (reuse.set(t.tripId, allocId(iso)), reuse.get(t.tripId))) : '';

    if (colId    >=0) rows[r][colId]    = id;
    if (colDate  >=0) rows[r][colDate]  = fmtDMY(iso);
    if (colCustH >=0) rows[r][colCustH] = t.customer ?? '';
    if (colQtyH  >=0) rows[r][colQtyH]  = String(t.sl ?? '');
    if (colShift >=0) rows[r][colShift] = t.shift ?? '';
  }

  return rows;
}
