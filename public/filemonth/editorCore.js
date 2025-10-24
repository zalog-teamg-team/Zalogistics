// /filemonth/editorCore.js
// Core editor (grid light) dùng chung cho mọi JSON {headers[], data[][], fmt?}
// - Hỗ trợ nhiều tab (khóa/key & nhãn/label)
// - Filter, thêm/xoá dòng, sửa trực tiếp, Ctrl+S/Ctrl+F, Esc đóng
// Cách dùng xem finalEditor.js & mucluongEditor.js

export async function openGridEditor({
  title = 'Editor',
  tabs = [{ key: 'sheet', label: 'Sheet' }],
  load,           // async () => { [key]: {headers, data, fmt?}, ... }
  save,           // async (store) => void  (store có dạng tương tự load())
  onSaved = () => {}
} = {}) {
  if (typeof load !== 'function' || typeof save !== 'function') {
    throw new Error('openGridEditor: thiếu load/save hàm.');
  }

  ensureStyles();

  const ov  = el('<div class="fe-ov" tabindex="-1"></div>');
  const box = el('<div class="fe"></div>');
  ov.appendChild(box);

  const showTabs = Array.isArray(tabs) && tabs.length > 1;
  box.innerHTML = `
    <div class="fe-h">
      <div class="fe-title">${escapeHtml(title)}</div>
      <div class="fe-tabs" ${showTabs ? '' : 'style="display:none"'}></div>
      <div class="fe-actions">
	 <input class="fe-coltitle" type="text" placeholder="ĐVT lương (Enter để ghi / thêm)">
        <input class="fe-filter" type="search" placeholder="Lọc (Ctrl+F)">
        <button class="fe-btn" data-act="add">+ Thêm dòng</button>
        <button class="fe-btn" data-act="del">Xoá dòng</button>
        <button class="fe-btn primary" data-act="save">Lưu (Ctrl+S)</button>
        <button class="fe-btn" data-act="close">Đóng (Esc)</button>
      </div>
    </div>
    <div class="fe-body">
      <div class="fe-tablewrap fe-grid-light">
        <table class="fe-t fe--nowrap">
          <thead></thead>
          <tbody></tbody>
        </table>
      </div>
      <div class="fe-foot">
        <div class="fe-note">Sửa trực tiếp trong ô. Khuyên giữ nguyên tiêu đề cột.</div>
        <div class="fe-count"></div>
      </div>
    </div>
  `;
  document.body.appendChild(ov);

  const tabHost = box.querySelector('.fe-tabs');
  const thead   = box.querySelector('thead');
  const tbody   = box.querySelector('tbody');
  const filter  = box.querySelector('.fe-filter');
  const count   = box.querySelector('.fe-count');
  const wrap    = box.querySelector('.fe-tablewrap');
  const colInput = box.querySelector('.fe-coltitle');   // ô nhập tiêu đề cột
let currentCol = null;
function selectHeader(i){
  // i: index cột dữ liệu (bỏ qua cột checkbox)
  if (Number.isInteger(i) && i >= 0 && i < (store[active]?.headers?.length || 0)){
    currentCol = i;
  } else {
    currentCol = null;
  }
  if (colInput){
    colInput.value = currentCol != null ? (store[active].headers[currentCol] ?? '') : '';
    colInput.placeholder = currentCol != null
      ? 'Sửa tiêu đề cột (Enter để lưu)'
      : 'Tiêu đề cột (Enter để thêm cột)';
  }
  // tô sáng th đang chọn (bỏ th .fe-chk)
  const ths = Array.from(thead.querySelectorAll('th:not(.fe-chk)'));
  ths.forEach((th, idx)=> th.classList.toggle('fe-th-active', idx === currentCol));
}

colInput?.addEventListener('keydown', (e)=>{
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const name = (colInput.value || '').trim();

  // Đổi tên cột đang chọn
  if (currentCol != null){
    store[active].headers[currentCol] = name;
    render();                 // vẽ lại head/body
    selectHeader(currentCol); // giữ trạng thái chọn
    return;
  }

  // Thêm cột mới nếu chưa chọn cột
  if (name){
    store[active].headers.push(name);
    (store[active].data || []).forEach(r => r.push(''));
    render();
    const newIdx = store[active].headers.length - 1;
    selectHeader(newIdx);
    // focus ô đầu của cột mới (nếu có hàng)
    const firstCell = tbody.querySelector(`td[data-vr="0"][data-c="${newIdx}"]`);
    firstCell?.focus();
  }
});


  let store = {};               // { key: { headers, data, fmt? } }
  let active = tabs[0].key;
  let viewIdx = [];
  let filterText = '';

  // Tabs
  if (showTabs) {
    tabHost.innerHTML = tabs.map(t => `<button class="fe-tab" data-key="${t.key}">${escapeHtml(t.label)}</button>`).join('');
  }
  const tabBtns = Array.from(box.querySelectorAll('.fe-tab'));
  function setActive(k) {
    active = k;
    tabBtns.forEach(b => b.classList.toggle('active', b.dataset.key === k));
    render();
  }
  tabBtns.forEach(b => b.addEventListener('click', () => setActive(b.dataset.key)));

  // Actions
  const esc = () => ov.remove();
  box.querySelector('[data-act="add"]').addEventListener('click', addRow);
  box.querySelector('[data-act="del"]').addEventListener('click', delRows);
  box.querySelector('[data-act="save"]').addEventListener('click', doSave);
  box.querySelector('[data-act="close"]').addEventListener('click', esc);

  ov.addEventListener('keydown', (e)=>{
    if (e.key==='Escape') { e.preventDefault(); esc(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase()==='f') { e.preventDefault(); filter.focus(); filter.select(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase()==='s') { e.preventDefault(); doSave(); }
  });
  filter.addEventListener('input', debounce(() => { filterText = String(filter.value||''); renderBodyOnly(); }, 80));

  // Load
  try {
    const loaded = await load();
    // chuẩn hoá keys
    store = {};
    tabs.forEach(t => {
      const s = loaded?.[t.key] || {};
      store[t.key] = {
        headers: Array.isArray(s.headers) ? s.headers : [],
        data: Array.isArray(s.data) ? s.data : [],
        fmt: s.fmt && typeof s.fmt === 'object' ? s.fmt : {}
      };
    });
    setActive(active);
  } catch(err) {
    console.error('[editorCore] Load error:', err);
    alert('Không tải được dữ liệu: ' + err.message);
    esc();
    return;
  }

  // ===== Render =====
function render(){
  const sheet = store[active] || { headers: [], data: [] };
  const headers = sheet.headers;
  const head = ['<tr><th class="fe-chk"><input type="checkbox" class="fe-all"></th>']
    .concat(headers.map(h => `<th>${escapeHtml(h)}</th>`))
    .join('') + '</tr>';
  thead.innerHTML = head;
  thead.querySelector('.fe-all')?.addEventListener('change', (e)=>{
    tbody.querySelectorAll('.fe-row').forEach(ch=>{ ch.checked = e.target.checked; });
  });

  // ⬇️ NEW: bật edit tiêu đề
  bindHeaderEditing();

  renderBodyOnly();
}

// NEW: cho th tiêu đề sửa được & ghi vào store[active].headers
// Mới: Cho phép sửa tiêu đề cột
function bindHeaderEditing() {
  const sheet = store[active] || { headers: [] };
  const ths = Array.from(thead.querySelectorAll('th:not(.fe-chk)'));  // Lọc các th không phải checkbox
  ths.forEach((th, i) => {
    const idx = i; // i ứng với cột headers[idx]
    th.setAttribute('contenteditable', 'plaintext-only');  // Cho phép chỉnh sửa tiêu đề
    if (!('plaintext-only' in document.createElement('div'))) {
      th.setAttribute('contenteditable', 'true'); // fallback nếu trình duyệt không hỗ trợ
    }
    th.dataset.hidx = String(idx);

    // Lưu lại giá trị gốc để có thể hoàn tác khi nhấn Esc
    let original = sheet.headers[idx] ?? '';
    th.addEventListener('focus', () => { original = sheet.headers[idx] ?? ''; });

    th.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); th.blur(); } // Nhấn Enter sẽ mất focus
      if (e.key === 'Tab') {
        e.preventDefault();
        const next = ths[idx + (e.shiftKey ? -1 : 1)];
        (next || th).focus();  // Chuyển focus tới cột tiếp theo
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        th.textContent = original; // Hoàn tác thay đổi nếu nhấn Escape
        th.blur();
      }
    });

    th.addEventListener('input', () => {
      // Loại bỏ xuống dòng trong th
      const txt = (th.textContent || '').replace(/\r?\n/g, ' ').trim();
      sheet.headers[idx] = txt; // Lưu tiêu đề mới vào store
    });
  });
}
  function renderBodyOnly(){
    const sheet = store[active] || { headers: [], data: [] };
    const headers = sheet.headers;
    const rows    = sheet.data;

    const needle = fold(filterText);
    viewIdx = [];
    let html = '';

    for (let i=0;i<rows.length;i++){
      const r = rows[i];
      if (needle && !rowMatch(r, needle)) continue;
      viewIdx.push(i);
      const cells = r.map((v,j)=>`<td contenteditable="true" spellcheck="false" data-vr="${viewIdx.length-1}" data-c="${j}">${escapeHtml(v)}</td>`).join('');
      html += `<tr><td class="fe-chk"><input type="checkbox" class="fe-row" data-vr="${viewIdx.length-1}"></td>${cells}</tr>`;
    }
    tbody.innerHTML = html;

    tbody.querySelectorAll('td[contenteditable="true"]').forEach(td=>{
      td.addEventListener('input', ()=>{
        const vr = +td.dataset.vr, c = +td.dataset.c;
        const real = viewIdx[vr];
        store[active].data[real][c] = td.textContent;
      });
      td.addEventListener('keydown', (e)=>{
        if (e.key==='Enter'){ e.preventDefault(); moveDown(td); }
      });
    });

    count.textContent = `${viewIdx.length} / ${rows.length} dòng • ${headers.length} cột`;
  }

  // ===== Actions =====
  function addRow(){
    const cols = (store[active]?.headers || []).length;
    const row = Array(Math.max(cols,1)).fill('');
    store[active].data.push(row);
    filterText = ''; filter.value = '';
    render();
    const last = tbody.querySelector(`td[data-vr="${viewIdx.length-1}"][data-c="0"]`);
    if (last) { last.focus(); scrollCellIntoView(last); }
  }

  function delRows(){
    const checks = Array.from(tbody.querySelectorAll('.fe-row:checked')).map(ch=>+ch.dataset.vr);
    if (!checks.length) return;
    const realIdx = new Set(checks.map(vr => viewIdx[vr]).filter(i => i != null));
    store[active].data = store[active].data.filter((_,idx)=>!realIdx.has(idx));
    render();
  }

  async function doSave(){
    try{
      const saveBtn = box.querySelector('[data-act="save"]');
      saveBtn.disabled = true;
      await save(store);
      onSaved();
      ov.remove();
    }catch(err){
      console.error('[editorCore] Save error:', err);
      alert('Lỗi lưu: ' + err.message);
    }finally{
      const btn = box.querySelector('[data-act="save"]');
      if (btn) btn.disabled = false;
    }
  }

  // ===== Utils (di chuyển trong lưới + scroll) =====
  function moveDown(td){
    const vr = +td.dataset.vr, c = +td.dataset.c;
    const next = tbody.querySelector(`td[data-vr="${vr+1}"][data-c="${c}"]`);
    if (next) { next.focus(); scrollCellIntoView(next); }
    else { td.focus(); scrollCellIntoView(td); }
  }
  function scrollCellIntoView(cell){
    cell.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    if (wrap && wrap.scrollTo) {
      const r = cell.getBoundingClientRect();
      const rw = wrap.getBoundingClientRect();
      if (r.right > rw.right) wrap.scrollLeft += (r.right - rw.right) + 40;
      if (r.left < rw.left)   wrap.scrollLeft -= (rw.left - r.left) + 40;
    }
  }
}

// ===== Helpers dùng chung =====
function el(html){ const d=document.createElement('div'); d.innerHTML=html.trim(); return d.firstChild; }
function escapeHtml(s){ return String(s==null?'':s).replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m])); }
function fold(s){ return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(); }
function rowMatch(arr, needle){ if (!needle) return true; for (let i=0;i<arr.length;i++) if (fold(arr[i]).includes(needle)) return true; return false; }
function debounce(fn, ms){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; }

function ensureStyles(){
  if (document.getElementById('fe-style')) return;
  const css = `
/* ========= Core tokens ========= */
.fe{
  --fe-font: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Inter, Arial, "Noto Sans", sans-serif;
  --fe-bg: #f8fafc;
  --fe-surface: #ffffff;
  --fe-text: #0f172a;
  --fe-muted: #64748b;
  --fe-border: #e5e7eb;
  --fe-hover: #f1f5f9;
  --fe-accent: #0ea5e9;
  --fe-radius: 12px;
  --fe-pad: 10px;
}
@media (prefers-color-scheme: dark){
  .fe{
    --fe-bg: #0b1220;
    --fe-surface: #0f1526;
    --fe-text: #e5e7eb;
    --fe-muted: #94a3b8;
    --fe-border: #1f2937;
    --fe-hover: #111827;
  }
}

/* ========= Layout ========= */
.fe-ov{position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:99999}
.fe{
  width:min(1200px,94vw);height:min(86vh,900px);
  background:var(--fe-surface);color:var(--fe-text);
  border:1px solid var(--fe-border);border-radius:var(--fe-radius);
  box-shadow:0 10px 30px rgba(0,0,0,.15);
  display:flex;flex-direction:column;overflow:hidden;
}
.fe *{font-family:var(--fe-font)}

.fe-h{
  display:flex;align-items:center;gap:8px;justify-content:space-between;
  padding:12px 14px;border-bottom:1px solid var(--fe-border);background:var(--fe-surface)
}
.fe-title{font-weight:600}
.fe-tabs{display:flex;gap:6px;flex-wrap:wrap}
.fe-tab{
  padding:6px 10px;border:1px solid var(--fe-border);border-radius:999px;
  background:var(--fe-bg);cursor:pointer
}
.fe-tab.active{background:var(--fe-accent);color:#fff;border-color:transparent}
.fe-actions{display:flex;gap:8px;flex-wrap:wrap}

.fe-filter,.fe-coltitle{
  min-width:220px;padding:7px 10px;border:1px solid var(--fe-border);
  border-radius:8px;background:#fff;outline:none
}
.fe-btn{
  padding:8px 12px;border-radius:8px;border:1px solid var(--fe-border);
  background:var(--fe-bg);cursor:pointer
}
.fe-btn.primary{background:#10b981;color:#fff;border-color:transparent}
:where(.fe-btn,.fe-filter,.fe-coltitle):focus-visible{
  outline:2px solid var(--fe-accent);outline-offset:2px
}

.fe-body{display:flex;flex-direction:column;gap:8px;padding:var(--fe-pad);height:100%;overflow:hidden}
.fe-tablewrap{flex:1;overflow:auto;border:1px solid var(--fe-border);border-radius:8px;background:var(--fe-surface)}

/* ========= Table (grid-light) ========= */
.fe-grid-light table.fe-t{width:100%;border-collapse:separate;border-spacing:0;table-layout:auto}
.fe-grid-light .fe-t thead th,
.fe-grid-light .fe-t tbody td{
  padding:6px 8px;border-bottom:1px solid var(--fe-border);vertical-align:top;text-align:left
}
.fe-grid-light .fe-t thead th{position:sticky;top:0;background:var(--fe-bg);z-index:1}
.fe-grid-light .fe-t tbody td{color:var(--fe-text)}
.fe-grid-light .fe-t tr:hover td{background:var(--fe-hover)}
.fe-grid-light .fe-t td[contenteditable="true"]{outline:none}
.fe-grid-light .fe-chk{width:28px}
.fe-grid-light input[type="checkbox"]{accent-color:var(--fe-accent)}
.fe--nowrap th,.fe--nowrap td{white-space:nowrap;word-break:keep-all}

/* ========= Footer ========= */
.fe-foot{
  display:flex;justify-content:space-between;align-items:center;
  padding:8px 10px;border-top:1px solid var(--fe-border)
}
.fe-note{opacity:.75;font-size:.9em}

/* ========= Selection highlight (đổi tiêu đề cột) ========= */
.fe-th-active{outline:2px solid var(--fe-accent)}
`;
  const st = document.createElement('style');
  st.id = 'fe-style';
  st.textContent = css;
  document.head.appendChild(st);
}

