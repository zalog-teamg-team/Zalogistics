// input/mouse.js — Chuột: chọn, kéo giãn, double click để edit
export class Mouse {
  constructor(rootEl, renderer, model, selection, bus, cmdMgr) {
    this.root = rootEl;
    this.render = renderer;
    this.model = model;
    this.sel = selection;
    this.bus = bus;
    this.cmd = cmdMgr;

    this.dragging = false;     // kéo chọn trong lưới
    this.resizing = null;      // {type:'col'|'row', index, startX?, startY?, initSize}
    this.headerDrag = null;    // {type:'col'|'row', startIndex:number}
    this._rafId = 0;           // RequestAnimationFrame ID cho tương tác mượt
    this._lastEvent = null;    // Cache event cuối cùng để xử lý trong RAF

    // Bind handlers để tránh tạo function mới liên tục
    this._onDown = this.onDown.bind(this);
    this._onMove = this.onMove.bind(this);
    this._onUp = this.onUp.bind(this);
    this._onDbl = this.onDbl.bind(this);
    this._rafLoop = this.rafLoop.bind(this);

    // Gắn event listeners
    this.root.addEventListener('mousedown', this._onDown);
    this.root.addEventListener('mousemove', this._onMove);
    window.addEventListener('mouseup', this._onUp);
    this.root.addEventListener('dblclick', this._onDbl);
  }

  // Helpers nhỏ gọn để trích xuất vị trí từ event
  cellFromEvent(e) {
    const td = e.target.closest('td.cell');
    return td ? { r: +td.dataset.r, c: +td.dataset.c } : null;
  }

  colFromEvent(e) {
    const th = e.target.closest('th.col');
    if (th) return +th.dataset.c;
    
    const td = e.target.closest('td.cell');
    return td ? +td.dataset.c : null;
  }

  rowFromEvent(e) {
    const th = e.target.closest('th.row');
    if (th) return +th.dataset.r;
    
    const td = e.target.closest('td.cell');
    return td ? +td.dataset.r : null;
  }

  // RequestAnimationFrame loop cho tương tác mượt
  startRaf() {
    if (!this._rafId) this._rafId = requestAnimationFrame(this._rafLoop);
  }

  cancelRaf() {
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = 0;
    }
  }

  rafLoop() {
    this._rafId = 0;
    
    // Xử lý event cuối cùng từ khi gọi RAF
    if (this._lastEvent) {
      this.processMouseMove(this._lastEvent);
      this._lastEvent = null;
    }
    
    // Tiếp tục loop nếu còn đang tương tác
    if (this.dragging || this.resizing || this.headerDrag) {
      this._rafId = requestAnimationFrame(this._rafLoop);
    }
  }

  // Xử lý sự kiện mousedown
  onDown(e) {
    // Đảm bảo focus vào grid
    if (!this.root.hasAttribute('tabindex')) this.root.setAttribute('tabindex', '0');
    this.root.focus({ preventScroll: true });
    
    // Đừng động vào khi bấm trong menu context hoặc không phải chuột trái
    if (e.target.closest('.ctx') || e.button !== 0) return;

    this.cancelRaf();
    this.bus.emit('ui.dismiss');
    this.bus.act('edit.commit');

    const thCol = e.target.closest('th.col');
    const thRow = e.target.closest('th.row');

    // Resize cột
    if (thCol && e.target.classList.contains('col-resizer')) {
      const c = +thCol.dataset.c;
      // Lưu vị trí chuột + scroll để theo dõi chính xác
      this.resizing = {
        type: 'col',
        index: c,
        startX: e.clientX + this.root.scrollLeft,
        initSize: this.model.colWidths[c] || 120
      };
      e.preventDefault();
      this.startRaf();
      return;
    }
    
    // Resize hàng
    if (thRow && e.target.classList.contains('row-resizer')) {
      const r = +thRow.dataset.r;
      // Lưu vị trí chuột + scroll để theo dõi chính xác
      this.resizing = {
        type: 'row',
        index: r,
        startY: e.clientY,
        startScrollY: this.root.scrollTop,
        initSize: this.model.rowHeights[r] || 24
      };
      e.preventDefault();
      this.startRaf();
      return;
    }

    // Chọn nhiều CỘT qua tiêu đề
    if (thCol) {
      const c = +thCol.dataset.c;
      const anchorC = e.shiftKey && this.sel?.active ? this.sel.active.c : c;
      this.sel.setActive(0, Math.min(anchorC, c));
      this.sel.extendTo(this.model.rows - 1, Math.max(anchorC, c));
      this.bus.emit('selection.changed');
      this.headerDrag = { type: 'col', startIndex: anchorC };
      this.startRaf();
      return;
    }

    // Chọn nhiều HÀNG qua tiêu đề
    if (thRow) {
      const r = +thRow.dataset.r;
      const anchorR = e.shiftKey && this.sel?.active ? this.sel.active.r : r;
      this.sel.setActive(Math.min(anchorR, r), 0);
      this.sel.extendTo(Math.max(anchorR, r), this.model.cols - 1);
      this.bus.emit('selection.changed');
      this.headerDrag = { type: 'row', startIndex: anchorR };
      this.startRaf();
      return;
    }

    // Chọn ô trong lưới
    const pos = this.cellFromEvent(e);
    if (!pos) return;
    
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey) {
      // Multi-select với Ctrl/Cmd
      this.sel.toggleExtraCell(pos.r, pos.c);
      this.sel.setActive(pos.r, pos.c, { preserveExtras: true });
    } else if (e.shiftKey) {
      this.sel.extendTo(pos.r, pos.c);
    } else {
      this.sel.setActive(pos.r, pos.c);
    }
    
    this.bus.emit('selection.changed');

    // Bắt đầu kéo chọn trong lưới
    this.dragging = true;
    this.dragAnchor = pos;
    this.startRaf();
  }

  // Xử lý thực tế việc di chuyển chuột (được gọi từ RAF)
  processMouseMove(e) {
    // Resize
    if (this.resizing) {
      if (this.resizing.type === 'col') {
        // Lấy vị trí chuột hiện tại, kể cả phần đã scroll
        const currX = e.clientX + this.root.scrollLeft;
        const dx = currX - this.resizing.startX;
        // Giới hạn kích thước cột trong khoảng hợp lý
        const w = Math.max(40, Math.min(1000, this.resizing.initSize + dx));
        // Cập nhật model ngay để vẽ lại đúng vị trí
        this.model.setColWidth(this.resizing.index, w);
        this.render.requestRender?.() || this.render.render();
      } else {
        // Tính toán delta y dựa trên vị trí chuột và thay đổi scroll
        const scrollDelta = this.root.scrollTop - this.resizing.startScrollY;
        const dy = (e.clientY - this.resizing.startY) + scrollDelta;
        // Giới hạn kích thước hàng trong khoảng hợp lý
        const h = Math.max(18, Math.min(500, this.resizing.initSize + dy));
        // Cập nhật model ngay
        this.model.setRowHeight(this.resizing.index, h);
        this.render.requestRender?.() || this.render.render();
      }
      return;
    }

    // Kéo trên header CỘT
    if (this.headerDrag?.type === 'col') {
      const c = this.colFromEvent(e);
      if (c != null) {
        const c0 = Math.min(this.headerDrag.startIndex, c);
        const c1 = Math.max(this.headerDrag.startIndex, c);
        this.sel.setActive(0, c0);
        this.sel.extendTo(this.model.rows - 1, c1);
        this.bus.emit('selection.changed');
      }
      return;
    }

    // Kéo trên header HÀNG
    if (this.headerDrag?.type === 'row') {
      const r = this.rowFromEvent(e);
      if (r != null) {
        const r0 = Math.min(this.headerDrag.startIndex, r);
        const r1 = Math.max(this.headerDrag.startIndex, r);
        this.sel.setActive(r0, 0);
        this.sel.extendTo(r1, this.model.cols - 1);
        this.bus.emit('selection.changed');
      }
      return;
    }

    // Kéo chọn trong lưới
    if (this.dragging) {
      const pos = this.cellFromEvent(e);
      if (pos) {
        this.sel.extendTo(pos.r, pos.c);
        this.bus.emit('selection.changed');
      }
      
      // Auto-scroll khi kéo sát mép
      this.checkAutoScroll(e);
    }
  }
  
  // Auto-scroll khi kéo ra mép
  checkAutoScroll(e) {
    const rect = this.root.getBoundingClientRect();
    const margin = 40;
    let dx = 0, dy = 0;
    
    if (e.clientX < rect.left + margin) {
      dx = -Math.min(20, (rect.left + margin) - e.clientX);
    } else if (e.clientX > rect.right - margin) {
      dx = Math.min(20, e.clientX - (rect.right - margin));
    }
    
    if (e.clientY < rect.top + margin) {
      dy = -Math.min(20, (rect.top + margin) - e.clientY);
    } else if (e.clientY > rect.bottom - margin) {
      dy = Math.min(20, e.clientY - (rect.bottom - margin));
    }
    
    if (dx || dy) {
      this.root.scrollLeft += dx;
      this.root.scrollTop += dy;
    }
  }

  // Xử lý mousemove event (thu thập event, xử lý thực tế ở RAF)
  onMove(e) {
    if (this.resizing || this.headerDrag || this.dragging) {
      this._lastEvent = e;
      this.startRaf();
    }
  }

  // Xử lý mouseup event
  onUp(e) {
    this.cancelRaf();
    
    if (this.resizing) {
      const { type, index, initSize } = this.resizing;
      const isCol = type === 'col';
      const after = isCol ? this.model.colWidths[index] : this.model.rowHeights[index];
      
      if (initSize !== after) {
        this.cmd.execute({
          name: isCol ? 'resize-col' : 'resize-row',
          do: () => isCol 
            ? this.model.setColWidth(index, after)
            : this.model.setRowHeight(index, after),
          undo: () => isCol 
            ? this.model.setColWidth(index, initSize)
            : this.model.setRowHeight(index, initSize)
        });
      }
      
      this.resizing = null;
      return;
    }

    // Kết thúc kéo chọn
    this.dragging = false;
    this.headerDrag = null;
  }

  // Xử lý double click
  onDbl(e) {
    const pos = this.cellFromEvent(e);
    if (!pos) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    this.sel.setActive(pos.r, pos.c);
    this.bus.emit('selection.changed', { ensure: false });
    
    // Mở edit và đặt caret tại vị trí double-click
    this.bus.act('edit.start', { atPointer: { x: e.clientX, y: e.clientY } });
  }
}