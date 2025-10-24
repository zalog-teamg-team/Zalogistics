export function initFilter({ bus, renderer, model, sel } = {}) {
  const $ = id => document.getElementById(id);
  const els = {
    col: $('filterCol'),
    text: $('filterText'),
    clear: $('filterClear'),
    list: $('filterVals'),
    status: $('status'),
    sortAZ: $('sortAZ'),
    sortZA: $('sortZA'),
    sortClear: $('sortClear')
  };
  
  if (!renderer || !model || !sel || (!els.col && !els.text)) return;
  
  // Các hàm utility
  const setStatus = msg => { if (els.status) els.status.textContent = msg || ''; };
  const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const colName = c => (String(renderer.headers?.[c] ?? '').trim() || `Cột ${c + 1}`);
  
  // Lấy danh sách cột có header
  const headerCols = () => {
    const H = renderer.headers || [];
    return Array.from({ length: H.length }, (_, c) => 
      String(H[c] ?? '').trim() ? c : null
    ).filter(c => c !== null);
  };
  
  // Xây dựng danh sách options cho dropdown cột
  function buildColOptions() {
    if (!els.col) return;
    
    const cols = headerCols();
    els.col.innerHTML = '';
    
    const fragment = document.createDocumentFragment();
    const optAll = document.createElement('option');
    optAll.value = '-1';
    optAll.textContent = 'Tất cả cột';
    fragment.append(optAll);
    
    for (const c of cols) {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = String(renderer.headers?.[c] ?? '').trim();
      fragment.append(opt);
    }
    
    els.col.append(fragment);
    
    try {
      const saved = localStorage.getItem('gridFilterCol');
      if (saved != null && (saved === '-1' || cols.includes(+saved))) {
        els.col.value = saved;
      }
    } catch {}
  }
  
  // Xây dựng danh sách giá trị cho datalist
  function rebuildValueList() {
    if (!els.list || !els.col) return;
    
    els.list.innerHTML = '';
    const col = +els.col.value;
    if (col < 0) return;
    
    const map = new Map();
    const keyOf = s => norm(s);
    
    // Thu thập giá trị duy nhất và số lần xuất hiện
    for (let r = 0; r < model.rows; r++) {
      const raw = String(model.get(r, col) ?? '').trim();
      if (!raw) continue;
      
      const k = keyOf(raw);
      const rec = map.get(k);
      rec ? rec.cnt++ : map.set(k, { val: raw, cnt: 1 });
    }
    
    // Sắp xếp theo tần suất giảm dần, ABC nếu bằng nhau
    const fragment = document.createDocumentFragment();
    Array.from(map.values())
      .sort((a, b) => b.cnt - a.cnt || a.val.localeCompare(b.val))
      .slice(0, 300)
      .forEach(it => {
        const opt = document.createElement('option');
        opt.value = it.val;
        fragment.append(opt);
      });
    
    els.list.append(fragment);
  }
  
  const hasActiveFilter = () => !!(els.text && norm(els.text.value));
  
  // Tính toán các hàng phù hợp với bộ lọc
  function computeFilteredRows() {
    if (!hasActiveFilter()) return Array.from({ length: model.rows }, (_, i) => i);
    
    const col = els.col ? +els.col.value : -1;
    const q = norm(els.text.value);
    const colsH = headerCols();
    const scanCols = col >= 0 ? [col] : (colsH.length ? colsH : Array.from({ length: model.cols }, (_, i) => i));
    
    return Array.from({ length: model.rows }, (_, r) => {
      for (const c of scanCols) {
        if (norm(model.get(r, c)).includes(q)) return r;
      }
      return -1;
    }).filter(r => r >= 0);
  }
  
  // Hiển thị tất cả hàng
  function showAll() {
    renderer.setRowIndexList(null);
    renderer.requestRender ? renderer.requestRender() : renderer.render();
    
    if (!renderer.cellEl(sel.active.r, sel.active.c) && model.rows > 0) {
      sel.setActive(0, 0);
      bus.emit('selection.changed');
    }
    
    setStatus('');
  }
  
  // Áp dụng bộ lọc
  function applyFilter() {
    const q = els.text ? norm(els.text.value) : '';
    
    try {
      if (els.col) localStorage.setItem('gridFilterCol', String(els.col.value || '-1'));
      if (els.text) localStorage.setItem('gridFilterText', els.text.value || '');
    } catch {}
    
    if (!q) {
      showAll();
      return;
    }
    
    const rows = computeFilteredRows();
    renderer.setRowIndexList(rows);
    renderer.requestRender ? renderer.requestRender() : renderer.render();
    
    if (!renderer.cellEl(sel.active.r, sel.active.c) && rows.length) {
      sel.setActive(rows[0], Math.min(sel.active.c, model.cols - 1));
      sel.clearExtras?.();
      bus.emit('selection.changed');
    }
    
    setStatus(`Filter: ${rows.length}/${model.rows} hàng`);
  }
  
  // Debounce function
  const debounce = (fn, ms = 160) => {
    let timer = 0;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), ms);
    };
  };
  
  const applyFilterDebounced = debounce(applyFilter, 160);
  
  // Hàm so sánh văn bản
  const viCollator = new Intl.Collator('vi', { sensitivity: 'base' });
  
  function cmpText(a, b) {
    const sa = String(a ?? '').trim();
    const sb = String(b ?? '').trim();
    const ea = !sa, eb = !sb;
    
    if (ea && eb) return 0;
    if (ea) return 1;
    if (eb) return -1;
    
    return viCollator.compare(sa, sb);
  }
  
  const isEmptyAt = (row, col) => String(model.get(row, col) ?? '').trim() === '';
  
  const activeColumn = () => {
    if (els.col && els.col.value != null && els.col.value !== '' && +els.col.value >= 0) {
      return +els.col.value;
    }
    return Math.min(Math.max(sel?.active?.c ?? 0, 0), model.cols - 1);
  };
  
  // Sắp xếp dữ liệu
  function sortBy(col, dir = 'asc') {
    const base = computeFilteredRows();
    const isDesc = dir === 'desc';
    let removed = 0;
    
    const rowsForSort = isDesc
      ? base.filter(r => {
          const empty = isEmptyAt(r, col);
          if (empty) removed++;
          return !empty;
        })
      : base;
    
    rowsForSort.sort((ra, rb) => {
      const d = cmpText(model.get(ra, col), model.get(rb, col));
      return isDesc ? -d : d;
    });
    
    renderer.setRowIndexList(rowsForSort);
    renderer.requestRender ? renderer.requestRender() : renderer.render();
    
    if (rowsForSort.length) {
      sel.setActive(rowsForSort[0], Math.min(sel.active.c, model.cols - 1));
      bus.emit('selection.changed');
    }
    
    setStatus(
      isDesc && removed > 0
        ? `Sắp xếp Z→A theo "${colName(col)}" (ẩn ${removed} hàng rỗng).`
        : `Sắp xếp ${isDesc ? 'Z→A' : 'A→Z'} theo "${colName(col)}".`
    );
  }
  
  // Đăng ký các event handlers
  els.col?.addEventListener('change', () => {
    rebuildValueList();
    applyFilterDebounced();
  });
  
  els.text?.addEventListener('input', applyFilterDebounced);
  els.text?.addEventListener('search', applyFilterDebounced);
  els.text?.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      e.target.value = '';
      applyFilter();
    }
  });
  
  els.clear?.addEventListener('click', () => {
    if (els.text) els.text.value = '';
    applyFilter();
  });
  
  els.sortAZ?.addEventListener('click', () => sortBy(activeColumn(), 'asc'));
  els.sortZA?.addEventListener('click', () => sortBy(activeColumn(), 'desc'));
  els.sortClear?.addEventListener('click', showAll);
  
  document.addEventListener('keydown', e => {
    if (e.altKey) {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        sortBy(activeColumn(), 'asc');
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        sortBy(activeColumn(), 'desc');
      }
    }
  });
  
  // Đăng ký các bus listeners
  bus.on?.('data:select', () => {
    buildColOptions();
    try {
      if (els.text) els.text.value = localStorage.getItem('gridFilterText') || '';
    } catch {}
    rebuildValueList();
    applyFilter();
  });
  
  bus.on?.('data:doc:dirty', () => {
    rebuildValueList();
    hasActiveFilter() ? applyFilterDebounced() : showAll();
  });
  
  // Khởi tạo
  buildColOptions();
  try {
    if (els.text) els.text.value = localStorage.getItem('gridFilterText') || '';
  } catch {}
  rebuildValueList();
}