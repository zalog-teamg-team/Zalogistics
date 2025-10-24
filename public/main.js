// main.js — Core bootstrap: Loader -> Cache -> Render + VLOOKUP + Split + SAVE
// (Khớp cấu trúc import core/ui/input/logic/luong, tối ưu hiệu năng commit)

// ===== IMPORTS =====
import { EventBus } from './core/eventBus.js';
import { DataModel } from './core/model.js';
import { Selection } from './core/selection.js';
import { CommandManager } from './core/commands.js';
import { Renderer } from './ui/renderer.js';
import { InputLayer } from './ui/inputLayer.js';
import { Keyboard } from './input/keyboard.js';
import { Mouse } from './input/mouse.js';
import { Clipboard } from './input/clipboard.js';
import { registerActions } from './actions/actions.js';

import { DataReader } from './reader.js';
import { DataStore } from './dataStore.js';
import { SuggestionEngine } from './input/suggest.js';
import { vlookupChamcongToLog } from './logic/reconcile.js';
import { splitLogRows } from './logic/tripSplit.js';

import { initFilter } from './ui/filter.js';
import { initUIControls } from './ui/uiControls.js';

// === NEW: chỉ bind action chuyen.compute (không đụng CC→Log)
import { registerChuyenCompute } from './luong/chuyen.compute.js';
import { registerLuongInit } from './luong/luong.init.js';

// ===================================================================

function init() {
  // ===== DOM =====
  const app          = document.getElementById('sheet');
  const toolbar      = document.getElementById('toolbar');
  const tabsEl       = document.getElementById('tabs');
  const typeSelect   = document.getElementById('data-type');
  const monthDisplay = document.getElementById('monthDisplay');
  const prevBtn      = document.getElementById('prevMonth');
  const nextBtn      = document.getElementById('nextMonth');
  const sheetInfo    = document.getElementById('sheetInfo');
  const statusEl     = document.getElementById('status');
  const btnLoad      = document.getElementById('btn-load');

  if (!app) throw new Error('#sheet không tồn tại trong DOM');

  // ===== CORE =====
  const bus    = new EventBus();
  const model  = new DataModel();        // kích thước sẽ theo dữ liệu
  const sel    = new Selection(model);
  const cmdMgr = new CommandManager();

  const renderer   = new Renderer(app, model, sel, bus);
  const engine     = new SuggestionEngine();
  const inputLayer = new InputLayer(app, renderer, model, sel, cmdMgr, bus, engine);

  // Input handlers
  new Keyboard(app, model, sel, inputLayer, bus);       // theo chữ ký hiện tại của bạn
  new Mouse(app, renderer, model, sel, bus, cmdMgr);    // class Mouse (đã export named)
  new Clipboard(app, model, sel, cmdMgr, bus);

  registerActions(bus, model, sel, cmdMgr, renderer, inputLayer);

  // Data
  const BASE_URL = (typeof window !== 'undefined' && window.DATA_BASE_URL) || '/filejson/';
  const reader = new DataReader(BASE_URL);
  const store  = new DataStore(bus);

  // ===== STATE =====
  const state = {
    kind: (document.querySelector('#tabs .tab.active')?.dataset.tab) || 'logchuyen',
    date: new Date()
  };
  const fmtMonth = (d) => `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  const updMonthUI = () => { if (monthDisplay) monthDisplay.textContent = fmtMonth(state.date); };
  const setStatus  = (m) => { if (statusEl) statusEl.textContent = m || ''; };
  const getState   = () => state;

  // ===== Hiệu năng: chỉ render gộp sau mỗi command, KHÔNG capture ở đây =====
  cmdMgr.onChanged = () => {
    if (typeof renderer.requestRender === 'function') renderer.requestRender();
    else renderer.render();
  };

  // ===== Helper giữ viewport/selection =====
  function preserveViewAndSelection(mutator) {
    const prevSL = app.scrollLeft, prevST = app.scrollTop;
    const prevA = { ...sel.anchor }, prevB = { ...sel.active };
    const clamp = (v, max) => Math.max(0, Math.min(v, Math.max(1, max) - 1));

    mutator();
    renderer.render();

    const A = { r: clamp(prevA.r, model.rows), c: clamp(prevA.c, model.cols) };
    const B = { r: clamp(prevB.r, model.rows), c: clamp(prevB.c, model.cols) };
    sel.anchor = A; sel.active = B;
    bus.emit('selection.changed', { ensure: false });
    app.scrollLeft = prevSL; app.scrollTop = prevST;
  }

  // ===== LOAD hiện tại =====
  async function loadCurrent() {
    const { kind, date } = state;
    updMonthUI();
    setStatus(`Đang tải "${kind}" — ${fmtMonth(date)}…`);

    try {
      const { key, doc } = await store.getOrFetch(reader, kind, date);

      store.toModel(key, model, renderer);
      renderer.render();
      sel.setActive(0, 0);
      bus.emit('selection.changed');

      const rowsN = doc.rows.length;
      const colsN = Math.max(doc.header.length, ...doc.rows.map(r => r.length || 0), 1);
      const n = engine.countMatches(renderer.headers || []);
      setStatus(`${doc.dirty ? '• Chưa lưu — ' : ''}Đã tải: ${fmtMonth(date)} • ${rowsN} dòng × ${colsN} cột${n ? ` • ${n} cột có gợi ý` : ''}`);
      if (sheetInfo) sheetInfo.textContent = `${kind} — ${fmtMonth(date)} — ${rowsN}x${colsN}`;
    } catch (e) {
      setStatus(`Lỗi tải dữ liệu: ${e.message}`);
    }
  }

  // ===== SAVE =====
  async function saveCurrent() {
    try {
      bus.act?.('edit.commit');
      // capture MỘT LẦN khi lưu
      store.captureFromModel(model);

      const { kind, date } = state;
      const key = store.key(kind, date);
      const doc = store.docs.get(key) || {};
      const payload = { headers: doc.header || [], data: doc.rows || [], fmt: doc.fmt || {} };

      setStatus('Đang lưu…');
      const res = await reader.save(kind, date, payload, { force: true });
      store.markClean?.(key);
      store.setVersion?.(key, res?.version || 0);
      setStatus(`Đã lưu: ${res?.file || ''} • v${res?.version ?? 0}`);
    } catch (e) {
      setStatus(`Lỗi lưu: ${e.message}`);
    }
  }

  // ===== Tham chiếu (final_data.json) =====
  async function loadReference() {
    try {
      const { url, sheets } = await reader.loadFinal();
      store.setReference(url, sheets);
      engine.rebuildFromRefSheets(sheets);

      const kh = sheets.khachhang?.rows?.length || 0;
      const nv = sheets.nhanvien?.rows?.length || 0;
      const pt = sheets.phuongtien?.rows?.length || 0;
      const n  = engine.countMatches(renderer.headers || []);
      setStatus(`Tham chiếu: KH=${kh}, NV=${nv}, PT=${pt}${n ? ` • ${n} cột có gợi ý` : ''}`);
    } catch (e) {
      setStatus(`Lỗi tải tham chiếu: ${e.message}`);
    }
  }

  // ===== Nghiệp vụ: VLOOKUP CC→Log =====
  async function runMapFromChamcong() {
    if (state.kind !== 'logchuyen') { setStatus('Chỉ chạy ở tab "Log chuyến".'); return; }
    try {
      const [{ key: logKey, doc: logDoc }, { doc: ccDoc }] = await Promise.all([
        store.getOrFetch(reader, 'logchuyen', state.date),
        store.getOrFetch(reader, 'chamcong',  state.date).catch(() => ({ doc: null })),
      ]);
      if (!ccDoc) { setStatus('Không có dữ liệu "Chấm công" cùng tháng.'); return; }

      const { rows, changedCells, matchedRows } = vlookupChamcongToLog(logDoc, ccDoc);

      preserveViewAndSelection(() => {
        store.updateRows(logKey, rows, true);
        store.toModel(logKey, model, renderer);
      });

      const rowsN = rows.length;
      const colsN = Math.max(logDoc.header.length, ...rows.map(r => r.length || 0), 1);
      const n = engine.countMatches(renderer.headers || []);
      setStatus(`VLOOKUP CC→Log: ${changedCells} ô, ${matchedRows} dòng khớp • ${rowsN}×${colsN}${n ? ` • ${n} cột có gợi ý` : ''}`);
      if (sheetInfo) sheetInfo.textContent = `logchuyen — ${fmtMonth(state.date)} — ${rowsN}x${colsN}`;
    } catch (e) {
      setStatus(`Lỗi VLOOKUP: ${e.message}`);
    }
  }

  // ===== Nghiệp vụ: Split chuyến =====
  async function runTripSplit() {
    if (state.kind !== 'logchuyen') { setStatus('Chỉ tách ở tab "Log chuyến".'); return; }
    const rng = sel.range;
    if (rng.c1 - rng.c0 !== 1) { setStatus('Chọn đúng vùng 2 cột: trái=Khách hàng, phải=Số lượng.'); return; }

    const capStr = prompt('Nhập "Số chọn" (>=1):', window.tripCap ?? '');
    if (capStr == null) return;
    const cap = Number(String(capStr).trim().replace(',', '.'));
    if (!(cap > 0)) { setStatus('Số chọn phải > 0.'); return; }
    window.tripCap = cap;

    try {
      const { key: logKey, doc: logDoc } = await store.getOrFetch(reader, 'logchuyen', state.date);
      const rows = splitLogRows(logDoc.header, logDoc.rows, { sel: rng, cap });

      preserveViewAndSelection(() => {
        store.updateRows(logKey, rows, true);
        store.toModel(logKey, model, renderer);
      });

      const rowsN = rows.length;
      const colsN = Math.max(logDoc.header.length, ...rows.map(r => r.length || 0), 1);
      setStatus(`Split chuyến: cap=${cap} • ghi ${rowsN} dòng • ${rowsN}×${colsN}`);
      if (sheetInfo) sheetInfo.textContent = `logchuyen — ${fmtMonth(state.date)} — ${rowsN}x${colsN}`;
    } catch (e) {
      setStatus(`Lỗi Split: ${e.message}`);
    }
  }

  // ===== Gắn module Lương (nếu dùng) =====
  try {
    registerChuyenCompute({ bus, model, sel, cmdMgr, renderer, store, reader, getState, setStatus });
  } catch {}
  try {
    registerLuongInit({ bus, model, sel, cmdMgr, renderer, store, getState, setStatus });
  } catch {}

  // ===== Toolbar =====
  toolbar?.addEventListener('click', (e) => {
    const btn = e.target.closest('button,[data-action]');
    if (!btn) return;
    const act = btn.dataset.action;
    if (!act) return;

    bus.act?.('edit.commit');
    bus.emit('ui.dismiss');

    if (act === 'file.save')        { saveCurrent();        return; }
    if (act === 'file.reload')      { loadCurrent();        return; }
    if (act === 'file.reloadFinal') { loadReference();      return; }
    if (act === 'tools.cc2log')     { runMapFromChamcong(); return; }
    if (act === 'tools.tripSplit')  { runTripSplit();       return; }

    try { bus.act(act); } catch (err) { console.warn('Action not registered:', act, err); }
  });

  // ===== Tabs =====
  if (tabsEl) {
    tabsEl.addEventListener('click', (e) => {
      const btn = e.target.closest('.tab'); if (!btn) return;

      // commit & capture MỘT LẦN trước khi chuyển
      bus.act?.('edit.commit');
      try { store.captureFromModel(model); } catch {}

      document.querySelectorAll('#tabs .tab').forEach(b => b.classList.toggle('active', b === btn));
      state.kind = btn.dataset.tab || 'logchuyen';
      if (typeSelect) typeSelect.value = state.kind;
      loadCurrent();
    });
  }

  // ===== Month & Type =====
  typeSelect?.addEventListener('change', (e) => {
    bus.act?.('edit.commit'); try { store.captureFromModel(model); } catch {}
    state.kind = e.target.value; loadCurrent();
  });
  prevBtn?.addEventListener('click', () => {
    bus.act?.('edit.commit'); try { store.captureFromModel(model); } catch {}
    state.date.setMonth(state.date.getMonth() - 1); loadCurrent();
  });
  nextBtn?.addEventListener('click', () => {
    bus.act?.('edit.commit'); try { store.captureFromModel(model); } catch {}
    state.date.setMonth(state.date.getMonth() + 1); loadCurrent();
  });
  btnLoad?.addEventListener('click', () => loadCurrent());

  // ===== Init UI =====
  renderer.render();
  sel.setActive(0, 0);
  bus.emit('selection.changed');
  if (!app.hasAttribute('tabindex')) app.setAttribute('tabindex', '0');
  app.focus({ preventScroll: true });

  initFilter({ bus, renderer, model, sel });
  initUIControls({ bus, app, saveCurrent });

  // ===== Load dữ liệu =====
  loadCurrent();
  // Tham chiếu nạp “lười” để first paint nhanh hơn
  if ('requestIdleCallback' in window) requestIdleCallback(loadReference, { timeout: 1200 });
  else setTimeout(loadReference, 300);

  // ===== Public API =====
  window.__sheetApp = Object.assign(window.__sheetApp || {}, {
    switchTab: (kind) => {
      if (!kind) return false;

      // Commit & capture trước khi chuyển
      bus.act?.('edit.commit'); try { store.captureFromModel(model); } catch {}

      // Sync UI tab
      const btn = document.querySelector(`#tabs .tab[data-tab="${kind}"]`);
      if (btn) {
        document.querySelectorAll('#tabs .tab').forEach(b => {
          const act = b === btn;
          b.classList.toggle('active', act);
          b.setAttribute('aria-selected', act ? 'true' : 'false');
        });
      }
      state.kind = kind;
      if (typeSelect) typeSelect.value = kind;
      loadCurrent();
      return true;
    },
    reloadFinal: () => loadReference()
  });

  bus.emit('app.ready');
}

// ===== BOOT =====
document.addEventListener('DOMContentLoaded', init);
export { init };
