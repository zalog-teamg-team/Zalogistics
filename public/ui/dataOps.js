// ui/dataOps.js - Panel "Dữ liệu ▾": Cập nhật KH/NV/PT, Update final_data.json, Tạo file tháng
export function initDataOps({ bus, reader, store, engine, setStatus, getState, loadCurrent } = {}) {
  const btn = document.getElementById('dataOpsBtn');
  const modal = document.getElementById('dataOpsModal');
  if (!btn || !modal) return;

  const $ = sel => modal.querySelector(sel);
  
  // DOM elements
  const els = {
    closeBtn: $('[data-close]'),
    tabs: modal.querySelectorAll('nav.tabs button'),
    
    // Cập nhật KH/NV/PT
    sheetSel: $('#refSheetSelect'),
    modeSel: $('#refMode'),
    idxWrap: $('#refIndexWrap'),
    idxInput: $('#refIndex'),
    fieldsBox: $('#refFormFields'),
    loadRowBtn: $('#refLoadRow'),
    saveBtn: $('#refSaveBtn'),
    
    // Update final_data.json
    finalInput: $('#finalUpload'),
    finalBtn: $('#finalUploadBtn'),
    
    // Tạo file tháng
    typeSel: $('#newType'),
    monthInp: $('#newMonth'),
    tmplInp: $('#tmplFile'),
    createBtn: $('#createFileBtn')
  };

  // Modal control
  const open = () => {
    bus?.act?.('edit.commit');
    modal.classList.add('open');
    switchPane('capnhat');
    renderRefFields();
  };
  
  const close = () => modal.classList.remove('open');

  // Helper functions
  const sheetsClone = () => JSON.parse(JSON.stringify(store.exportRefJSON() || {}));
  const getSheet = name => store.getRefSheet(name || 'khachhang');
  
  // Event handlers
  btn.addEventListener('click', open);
  els.closeBtn.addEventListener('click', close);
  modal.addEventListener('click', e => { if (e.target === modal) close(); });

  // Tab switching
  els.tabs.forEach(b => {
    b.addEventListener('click', () => {
      els.tabs.forEach(x => x.classList.toggle('active', x === b));
      switchPane(b.dataset.pane);
    });
  });
  
  function switchPane(name) {
    modal.querySelectorAll('section.pane').forEach(p => 
      p.classList.toggle('active', p.id === 'pane-' + name)
    );
  }

  // ===== (1) Cập nhật KH/NV/PT =====
  function renderRefFields() {
    const sh = getSheet(els.sheetSel.value);
    els.fieldsBox.innerHTML = '';
    
    const fragment = document.createDocumentFragment();
    
    (sh.header || []).forEach((h, i) => {
      const wrap = document.createElement('label');
      wrap.className = 'ff';
      
      const span = document.createElement('span');
      span.textContent = h || `C${i+1}`;
      
      const input = document.createElement('input');
      input.type = 'text';
      input.dataset.idx = i;
      
      wrap.append(span, input);
      fragment.append(wrap);
    });
    
    els.fieldsBox.append(fragment);
    toggleIndex();
  }
  
  function toggleIndex() {
    const isEdit = els.modeSel.value === 'edit';
    els.idxWrap.classList.toggle('hidden', !isEdit);
    els.loadRowBtn.classList.toggle('hidden', !isEdit);
  }
  
  async function saveRefData() {
    try {
      const sheets = sheetsClone();
      const name = els.sheetSel.value;
      const sh = sheets[name] || { header: [], rows: [] };
      const row = Array.from(els.fieldsBox.querySelectorAll('input')).map(inp => inp.value || '');

      if (els.modeSel.value === 'edit') {
        const i = Math.max(1, parseInt(els.idxInput.value || '1', 10)) - 1;
        while (sh.rows.length <= i) sh.rows.push(Array(sh.header.length).fill(''));
        sh.rows[i] = row;
      } else {
        sh.rows.push(row);
      }
      sheets[name] = sh;

      setStatus('Đang lưu final_data.json…');
      await reader.saveFinal(sheets);
      
      // Cập nhật cache + gợi ý
      store.setReference(reader.buildUrl('final'), sheets);
      engine?.rebuildFromRefSheets?.(sheets);
      setStatus('Đã cập nhật final_data.json.');
    } catch (err) {
      console.error(err);
      setStatus('Lỗi lưu final_data.json: ' + err.message);
    }
  }
  
  // ===== (2) Update final_data.json từ tệp =====
  function normalizeFinal(obj) {
    const out = {
      khachhang: {headers: [], data: []},
      nhanvien: {headers: [], data: []},
      phuongtien: {headers: [], data: []}
    };
    
    const norm = s => String(s || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
      
    const keyOf = name => {
      const n = norm(name);
      if (['khach hang', 'khachhang', 'kh', 'customer', 'customers'].includes(n)) return 'khachhang';
      if (['nhan vien', 'nhanvien', 'nv', 'employee', 'employees', 'nhan su', 'nhansu'].includes(n)) return 'nhanvien';
      if (['phuong tien', 'phuongtien', 'vehicle', 'vehicles', 'xe', 'phuong tien'].includes(n)) return 'phuongtien';
      return null;
    };
    
    const toSheet = sh => {
      const headers = Array.isArray(sh.headers) ? sh.headers : (Array.isArray(sh.header) ? sh.header : []);
      const data = Array.isArray(sh.data) ? sh.data : (Array.isArray(sh.rows) ? sh.rows : []);
      const cols = Math.max(headers.length, ...data.map(r => r.length));
      
      const H = [...headers];
      while (H.length < cols) H.push('');
      
      const R = data.map(r => {
        const rr = r.slice(0, cols);
        while (rr.length < cols) rr.push('');
        return rr;
      });
      
      return { headers: H, data: R };
    };
    
    if (obj && Array.isArray(obj.sheets)) {
      for (const sh of obj.sheets) {
        const k = keyOf(sh?.name || '');
        if (!k) continue;
        out[k] = toSheet(sh);
      }
    } else if (obj && typeof obj === 'object') {
      for (const k of Object.keys(obj)) {
        const kk = keyOf(k);
        if (!kk) continue;
        out[kk] = toSheet(obj[k]);
      }
    } else {
      throw new Error('Tệp không đúng cấu trúc final_data.json');
    }
    
    return out;
  }
  
  async function uploadFinalJson() {
    const file = els.finalInput.files?.[0];
    if (!file) {
      alert('Chọn một file .json');
      return;
    }
    
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const norm = normalizeFinal(json);

      setStatus('Đang cập nhật final_data.json…');
      await reader.saveFinal(norm);

      // Convert sang shape Store
      const sheets = {};
      for (const [k, v] of Object.entries(norm)) {
        sheets[k] = { header: v.headers, rows: v.data };
      }
      
      store.setReference(reader.buildUrl('final'), sheets);
      engine?.rebuildFromRefSheets?.(sheets);
      setStatus('Đã cập nhật final_data.json từ tệp.');
    } catch (err) {
      console.error(err);
      setStatus('Lỗi cập nhật: ' + err.message);
    }
  }
  
  // ===== (3) Tạo file tháng từ file mẫu =====
  function parseCSV(text) {
    const out = [];
    let row = [], cur = '';
    let q = false;
    const s = text.replace(/\r/g, '');
    
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (q) {
        if (ch === '"') {
          if (s[i+1] === '"') {
            cur += '"';
            i++;
          } else {
            q = false;
          }
        } else {
          cur += ch;
        }
      } else {
        if (ch === '"') {
          q = true;
        } else if (ch === ',') {
          row.push(cur);
          cur = '';
        } else if (ch === '\n') {
          row.push(cur);
          out.push(row);
          row = [];
          cur = '';
        } else {
          cur += ch;
        }
      }
    }
    
    row.push(cur);
    out.push(row);
    
    return out;
  }
  
  function payloadFromFile(file) {
    return file.text().then(text => {
      if (file.name.toLowerCase().endsWith('.csv')) {
        const rows = parseCSV(text);
        const header = rows[0] || [];
        const data = rows.slice(1);
        return { headers: header, data };
      } else {
        const j = JSON.parse(text);
        
        if (Array.isArray(j.headers) && Array.isArray(j.data)) {
          return { headers: j.headers, data: j.data };
        }
        
        if (Array.isArray(j.header) && Array.isArray(j.rows)) {
          return { headers: j.header, data: j.rows };
        }
        
        throw new Error('File JSON phải có {headers, data} hoặc {header, rows}.');
      }
    });
  }
  
  async function createMonthFile() {
    const file = els.tmplInp.files?.[0];
    if (!file) {
      alert('Chọn file mẫu (.json/.csv). Nếu .xlsx → vui lòng Export CSV trước.');
      return;
    }
    
    const type = els.typeSel.value;
    const mval = els.monthInp.value; // yyyy-mm
    
    let date;
    if (mval && /^\d{4}-\d{2}$/.test(mval)) {
      const [y, m] = mval.split('-').map(Number);
      date = new Date(y, m-1, 1);
    } else {
      date = new Date();
    }

    try {
      const exists = await reader.exists(type, date);
      if (exists) {
        setStatus('File tháng đã tồn tại — không tạo lại.');
        return;
      }

      const payload = await payloadFromFile(file);
      setStatus('Đang tạo file tháng…');
      const res = await reader.save(type, date, payload, { force: true });
      setStatus(`Đã tạo: ${res.file} • v${res.version || 0}`);

      const st = getState?.() || {};
      if (st.kind === type &&
          st.date && 
          st.date.getMonth() === date.getMonth() &&
          st.date.getFullYear() === date.getFullYear()) {
        await loadCurrent?.();
      }
    } catch (err) {
      console.error(err);
      setStatus('Lỗi tạo file: ' + err.message);
    }
  }

  // Event listeners
  els.sheetSel.addEventListener('change', renderRefFields);
  els.modeSel.addEventListener('change', toggleIndex);
  
  els.loadRowBtn.addEventListener('click', () => {
    const sh = getSheet(els.sheetSel.value);
    const i = Math.max(1, parseInt(els.idxInput.value || '1', 10)) - 1;
    const row = sh.rows[i] || [];
    
    els.fieldsBox.querySelectorAll('input').forEach(inp => {
      const k = parseInt(inp.dataset.idx, 10);
      inp.value = row[k] != null ? row[k] : '';
    });
  });
  
  els.saveBtn.addEventListener('click', saveRefData);
  els.finalBtn.addEventListener('click', uploadFinalJson);
  els.createBtn.addEventListener('click', createMonthFile);

  // Default tháng hiện tại
  const now = new Date();
  els.monthInp.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}