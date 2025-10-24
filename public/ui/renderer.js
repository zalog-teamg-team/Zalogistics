// ui/renderer.js — render lưới + selection bằng overlay (nhẹ), hỗ trợ filter qua rowIndexList
import { colToLabel, toA1 } from '../core/rangeRef.js';

export class Renderer {
  constructor(rootEl, model, selection, bus) {
    this.root = rootEl;
    this.model = model;
    this.sel = selection;
    this.bus = bus;
    this.headers = [];
    this.rowIndexList = null; // null = hiện tất cả hàng
    this._raf = 0;
    this._rafSel = 0;

    // DOM khung bảng
    this.tableWrap = document.createElement('div');
    this.tableWrap.className = 'table-wrap';

    this.table = document.createElement('table');
    this.table.className = 'sheet-table';
    this.colgroup = document.createElement('colgroup');
    this.thead = document.createElement('thead');
    this.tbody = document.createElement('tbody');

    this.table.append(this.colgroup, this.thead, this.tbody);
    this.tableWrap.append(this.table);
    this.root.append(this.tableWrap);

    // Selection overlay
    this.selLayer = document.createElement('div');
    Object.assign(this.selLayer.style, {
      position: 'absolute', inset: '0',
      pointerEvents: 'none', zIndex: 3
    });
    this.tableWrap.append(this.selLayer);

    // Context menu
    this.ctx = document.createElement('div');
    this.ctx.className = 'ctx hidden';
    this.ctx.innerHTML = `
      <button data-act="clipboard.copy">Copy (Ctrl+C)</button>
      <button data-act="clipboard.cut">Cut (Ctrl+X)</button>
      <button data-act="clipboard.paste">Paste (Ctrl+V)</button>
      <hr>
      <button data-act="row.insertBelow">Thêm hàng dưới</button>
      <button data-act="row.delete">Xóa hàng</button>
      <button data-act="col.insertRight">Thêm cột phải</button>
      <button data-act="col.delete">Xóa cột</button>
    `;
    this.root.append(this.ctx);
    
    this.ctx.addEventListener('mousedown', e => e.stopPropagation());
    this.ctx.addEventListener('click', e => {
      const btn = e.target.closest('button');
      if (!btn) return;
      this.hideCtx();
      this.bus.act(btn.dataset.act);
    });
    
    this.bus.on('ui.dismiss', () => this.hideCtx());

    this.root.addEventListener('contextmenu', e => {
      if (e.target.closest('.ctx')) return;
      e.preventDefault();
      this.bus.act('edit.commit');

      const td = e.target.closest('td.cell');
      const thC = e.target.closest('th.col');
      const thR = e.target.closest('th.row');

      const R = this.sel.range;
      const within = (r, c) => r >= R.r0 && r <= R.r1 && c >= R.c0 && c <= R.c1;
      const fullCol = R.r0 === 0 && R.r1 === this.model.rows - 1;
      const fullRow = R.c0 === 0 && R.c1 === this.model.cols - 1;

      let changed = false;
      if (td) {
        const r = +td.dataset.r, c = +td.dataset.c;
        if (!within(r, c)) {
          this.sel.setActive(r, c);
          changed = true;
        }
      } else if (thC) {
        const c = +thC.dataset.c;
        if (!(fullCol && c >= R.c0 && c <= R.c1)) {
          this.sel.selectCol(c);
          changed = true;
        }
      } else if (thR) {
        const r = +thR.dataset.r;
        if (!(fullRow && r >= R.r0 && r <= R.r1)) {
          this.sel.selectRow(r);
          changed = true;
        }
      }
      
      if (changed) this.bus.emit('selection.changed');
      this.showCtx(e.clientX, e.clientY);
    });

    this.root.addEventListener('scroll', () => this.hideCtx());
  }

  // Zoom helper
  getZoom() {
    const cssVar = parseFloat(getComputedStyle(this.root).getPropertyValue('--grid-zoom')) || 0;
    if (cssVar > 0) return cssVar;
    const inline = parseFloat(this.root.style.zoom || '0');
    return inline > 0 ? inline : 1;
  }

  // Public API
  setHeaders(arr = []) {
    this.headers = Array.isArray(arr) ? arr.map(v => (v == null ? '' : String(v))) : [];
  }
  
  setRowIndexList(list) {
    this.rowIndexList = Array.isArray(list) ? [...list] : null;
  }

  // Context menu helpers
  showCtx(x, y) {
    const host = this.root.getBoundingClientRect();
    this.ctx.style.left = `${x - host.left}px`;
    this.ctx.style.top = `${y - host.top + this.root.scrollTop}px`;
    this.ctx.classList.remove('hidden');
  }
  
  hideCtx() {
    this.ctx.classList.add('hidden');
  }

  // Render coalesce
  requestRender() {
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => {
      this._raf = 0;
      this.render();
    });
  }

  // Render
  render() {
    // COLGROUP
    this.colgroup.innerHTML = '';
    const firstCol = document.createElement('col');
    firstCol.style.width = 'var(--hdr-w)';
    this.colgroup.append(firstCol);
    
    for (let c = 0; c < this.model.cols; c++) {
      const col = document.createElement('col');
      col.style.width = `${this.model.colWidths[c]}px`;
      this.colgroup.append(col);
    }

    // THEAD
    this.thead.innerHTML = '';
    const trh = document.createElement('tr');
    const corner = document.createElement('th');
    corner.className = 'corner header-cell';
    trh.append(corner);
    
    for (let c = 0; c < this.model.cols; c++) {
      const th = document.createElement('th');
      th.className = 'col header-cell';
      th.dataset.c = String(c);
      const title = this.headers[c] ?? colToLabel(c);
      th.textContent = title || colToLabel(c);
      const res = document.createElement('div');
      res.className = 'col-resizer';
      th.append(res);
      trh.append(th);
    }
    this.thead.append(trh);

    // TBODY
    this.tbody.innerHTML = '';
    const frag = document.createDocumentFragment();
    const rowsToRender = this.rowIndexList || 
                         Array.from({ length: this.model.rows }, (_, i) => i);

    for (let i = 0; i < rowsToRender.length; i++) {
      const r = rowsToRender[i];
      const tr = document.createElement('tr');
      
      // Row header
      const thr = document.createElement('th');
      thr.className = 'row header-cell';
      thr.textContent = String(r + 1);
      thr.dataset.r = String(r);
      const res = document.createElement('div');
      res.className = 'row-resizer';
      thr.append(res);
      tr.append(thr);

      for (let c = 0; c < this.model.cols; c++) {
        const td = document.createElement('td');
        td.className = 'cell';
        td.dataset.r = String(r);
        td.dataset.c = String(c);

        const fmt = this.model.getFormat(r, c);
        if (fmt.bold) td.classList.add('bold');
        if (fmt.italic) td.classList.add('italic');
        if (fmt.underline) td.classList.add('underline');
        if (fmt.align) td.style.textAlign = fmt.align;
        if (fmt.color) td.style.color = fmt.color;
        if (fmt.bg) td.style.background = fmt.bg;
        if (fmt.font) td.style.fontFamily = fmt.font;
        if (fmt.fontSize) td.style.fontSize = `${fmt.fontSize}px`;

        const val = this.model.get(r, c);
        td.title = toA1(r, c);
        td.textContent = val;

        tr.append(td);
      }
      frag.append(tr);
    }
    this.tbody.append(frag);

    // Vẽ selection sau khi render bảng
    this.updateSelection();
  }

  headerDims() {
    const corner = this.thead.querySelector('th.corner');
    const firstColHeader = this.thead.querySelector('th.col');
    if (!corner || !firstColHeader) throw new Error('headerDims(): headers not found.');
    
    const z = this.getZoom();
    const hdrW = Math.round(corner.getBoundingClientRect().width / z);
    const hdrH = Math.round(firstColHeader.getBoundingClientRect().height / z);
    return { hdrW, hdrH };
  }

  ensureVisible(pad = 2) {
    const { r, c } = this.sel.active;
    const cell = this.cellEl(r, c);
    if (!cell) return;

    const root = this.root;
    const host = root.getBoundingClientRect();
    const rc = cell.getBoundingClientRect();
    const z = this.getZoom();

    const left = (rc.left - host.left + root.scrollLeft) / z;
    const right = (rc.right - host.left + root.scrollLeft) / z;
    const top = (rc.top - host.top + root.scrollTop) / z;
    const bottom = (rc.bottom - host.top + root.scrollTop) / z;

    const { hdrW, hdrH } = this.headerDims();

    const viewLeft = (root.scrollLeft / z) + hdrW + pad;
    const viewTop = (root.scrollTop / z) + hdrH + pad;
    const viewRight = (root.scrollLeft / z) + (root.clientWidth / z) - pad;
    const viewBottom = (root.scrollTop / z) + (root.clientHeight / z) - pad;

    let newLeft = root.scrollLeft, newTop = root.scrollTop;

    const R = this.sel.range;
    const fullCol = R.r0 === 0 && R.r1 === this.model.rows - 1;
    const fullRow = R.c0 === 0 && R.c1 === this.model.cols - 1;

    if (!fullRow) {
      if (left < viewLeft) 
        newLeft = Math.round((left - hdrW - pad) * z);
      else if (right > viewRight) 
        newLeft = Math.round((right - (root.clientWidth / z) + pad) * z);
    }
    
    if (!fullCol) {
      if (top < viewTop) 
        newTop = Math.round((top - hdrH - pad) * z);
      else if (bottom > viewBottom) 
        newTop = Math.round((bottom - (root.clientHeight / z) + pad) * z);
    }

    if (newLeft !== root.scrollLeft) root.scrollLeft = newLeft;
    if (newTop !== root.scrollTop) root.scrollTop = newTop;
  }

  // Selection overlay
  _clearSelOverlay() {
    this.selLayer.innerHTML = '';
  }

  _cellRect(r, c) {
    const td = this.cellEl(r, c);
    if (!td) return null;
    
    const wrapRect = this.tableWrap.getBoundingClientRect();
    const rc = td.getBoundingClientRect();
    const z = this.getZoom();
    
    return {
      left: (rc.left - wrapRect.left) / z,
      top: (rc.top - wrapRect.top) / z,
      right: (rc.right - wrapRect.left) / z,
      bottom: (rc.bottom - wrapRect.top) / z
    };
  }

  _rangeBox(R) {
    // Tìm cell top-left và bottom-right hiện có trong DOM
    let tl = null, br = null;
    
    for (let r = R.r0; r <= R.r1 && !tl; r++) {
      tl = this._cellRect(r, R.c0);
    }
    
    for (let r = R.r1; r >= R.r0 && !br; r--) {
      br = this._cellRect(r, R.c1);
    }
    
    if (!tl || !br) return null;
    
    return {
      left: tl.left,
      top: tl.top,
      width: Math.max(0, br.right - tl.left),
      height: Math.max(0, br.bottom - tl.top)
    };
  }

  _addRect(x, y, w, h) {
    const fill = document.createElement('div');
    fill.className = 'sel-fill';
    Object.assign(fill.style, {
      left: `${x}px`, top: `${y}px`, 
      width: `${w}px`, height: `${h}px`,
      background: 'var(--sel-bg)'
    });
    
    const rect = document.createElement('div');
    rect.className = 'sel-rect';
    Object.assign(rect.style, { 
      left: `${x}px`, top: `${y}px`, 
      width: `${w}px`, height: `${h}px` 
    });
    
    this.selLayer.append(fill, rect);
  }

  updateSelection() {
    if (this._rafSel) return; // Gộp nhiều lần update trong 1 frame
    
    this._rafSel = requestAnimationFrame(() => {
      this._rafSel = 0;
      this._clearSelOverlay();
      
      const ranges = this.sel.getAllRanges ? this.sel.getAllRanges() : [this.sel.range];
      
      for (const R of ranges) {
        const box = this._rangeBox(R);
        if (!box) continue;
        this._addRect(box.left, box.top, box.width, box.height);
      }
    });
  }

  // Utilities
  cellEl(r, c) {
    return this.tbody.querySelector(`td.cell[data-r="${r}"][data-c="${c}"]`);
  }

  measureColAutoWidth(c, padding = 24, sampleLimit = 500) {
    const th = this.thead.querySelector(`th.col[data-c="${c}"]`);
    let maxW = th ? th.scrollWidth : 0;
    const cells = this.tbody.querySelectorAll(`td.cell[data-c="${c}"]`);
    let count = 0;
    
    for (const td of cells) {
      const w = td.scrollWidth;
      if (w > maxW) maxW = w;
      if (++count >= sampleLimit) break;
    }
    
    return Math.min(1000, Math.max(48, Math.round(maxW + padding)));
  }
  
  autoFitCol(c) {
    const w = this.measureColAutoWidth(c);
    this.model.setColWidth(c, w);
    this.render();
  }
}