// ui/inputLayer.js — edit trực tiếp trên ô (contenteditable)
import { isSingle } from '../core/rangeRef.js';

export class InputLayer {
  constructor(rootEl, renderer, model, selection, cmdMgr, bus, suggestEngine = null) {
    this.root = rootEl;
    this.renderer = renderer;
    this.model = model;
    this.sel = selection;
    this.cmdMgr = cmdMgr;
    this.bus = bus;
    this.suggest = suggestEngine;

    // Suggestion UI
    this.sug = document.createElement('div');
    this.sug.className = 'sugbox hidden';
    this.sug.innerHTML = '<ul></ul>';
    this.root.append(this.sug);
    this.sugList = this.sug.querySelector('ul');
    this.sugItems = [];
    this.sugIndex = -1;

    // Style tối thiểu
    if (!document.getElementById('sugbox-style')) {
      const st = document.createElement('style');
      st.id = 'sugbox-style';
      st.textContent = `
        .sugbox{position:absolute;z-index:1000;background:#fff;border:1px solid #ddd;
          box-shadow:0 6px 16px rgba(0,0,0,.12);max-height:220px;overflow:auto;min-width:120px;font-size:12px}
        .sugbox.hidden{display:none}
        .sugbox ul{list-style:none;margin:0;padding:4px 0}
        .sugbox li{padding:4px 8px;white-space:nowrap;cursor:pointer}
        .sugbox li.active{background:#eef5ff}
        td.cell[contenteditable="true"]{ outline: none; }
      `;
      document.head.append(st);
    }

    this.editing = false;
    this.fillAll = false;
    this._editingEl = null;
    this._original = '';
    this._onKeyDown = null;
    this._onInput = null;
    this._onMouseDownEdit = null;

    // Click vào item gợi ý
    this.sug.addEventListener('mousedown', e => {
      const li = e.target.closest('li');
      if (!li) return;
      e.preventDefault();
      const idx = +li.dataset.idx;
      if (idx >= 0) {
        this.sugIndex = idx;
        this.acceptSug();
      }
    });
  }

  // Helpers
  getZoom() {
    const cssVar = parseFloat(getComputedStyle(this.root).getPropertyValue('--grid-zoom')) || 0;
    return cssVar > 0 ? cssVar : parseFloat(this.root.style.zoom || '1') || 1;
  }

  isSugVisible() { return !this.sug.classList.contains('hidden'); }
  showSug() { this.sug.classList.remove('hidden'); }
  hideSug() { 
    this.sug.classList.add('hidden'); 
    this.sugIndex = -1; 
  }

  positionSug() {
    if (!this._editingEl) return;
    const rc = this._editingEl.getBoundingClientRect();
    const host = this.root.getBoundingClientRect();
    const z = this.getZoom();
    const left = (rc.left - host.left + this.root.scrollLeft) / z;
    const top = (rc.top - host.top + this.root.scrollTop + rc.height) / z;
    
    this.sug.style.left = `${left}px`;
    this.sug.style.top = `${top}px`;
    this.sug.style.minWidth = `${rc.width / z}px`;
  }

  buildSugList(items) {
    this.sugList.innerHTML = '';
    this.sugItems = items.slice(0, 50);
    
    const fragment = document.createDocumentFragment();
    this.sugItems.forEach((txt, i) => {
      const li = document.createElement('li');
      li.textContent = txt;
      li.dataset.idx = i;
      if (i === 0) li.classList.add('active');
      fragment.append(li);
    });
    
    this.sugList.append(fragment);
    this.sugIndex = this.sugItems.length ? 0 : -1;
  }

  moveSug(step) {
    if (!this.sugItems.length) return;
    
    this.sugIndex = (this.sugIndex + step + this.sugItems.length) % this.sugItems.length;
    
    const lis = this.sugList.querySelectorAll('li');
    lis.forEach((li, i) => {
      li.classList.toggle('active', i === this.sugIndex);
      if (i === this.sugIndex) li.scrollIntoView({ block: 'nearest' });
    });
  }

  acceptSug() {
    if (this.sugIndex < 0 || this.sugIndex >= this.sugItems.length) return;
    
    const txt = this.sugItems[this.sugIndex];
    if (this._editingEl) {
      this._editingEl.textContent = txt;
      this.placeCaretEnd(this._editingEl);
      this.updateSug();
    }
  }

  updateSug() {
    if (!this._editingEl) {
      this.hideSug();
      return;
    }
    
    const { r, c } = this.sel.active;
    const header = (this.renderer.headers?.[c] ?? '').trim();
    
    if (!header || !this.suggest?.hasHeader(header)) {
      this.hideSug();
      return;
    }
    
    const text = this._editingEl.textContent || '';
    const items = this.suggest.suggest(header, text, 20);
    
    if (!items.length) {
      this.hideSug();
      return;
    }
    
    this.buildSugList(items);
    this.positionSug();
    this.showSug();
  }

  placeCaretEnd(el) {
    try {
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    } catch {}
  }

  placeCaretAtPointer(el, clientX, clientY) {
    try {
      let range = null;
      if (document.caretRangeFromPoint) {
        range = document.caretRangeFromPoint(clientX, clientY);
      } else if (document.caretPositionFromPoint) {
        const pos = document.caretPositionFromPoint(clientX, clientY);
        if (pos) {
          range = document.createRange();
          range.setStart(pos.offsetNode, pos.offset);
          range.collapse(true);
        }
      }
      
      if (range) {
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        return;
      }
    } catch {}
    
    // Fallback
    this.placeCaretEnd(el);
  }

  // Editing lifecycle
  start(opts = null) {
    let initialText = null;
    let atPointer = null;

    if (typeof opts === 'string' || opts === null) {
      initialText = opts ?? null;
    } else if (opts && typeof opts === 'object') {
      initialText = opts.initial ?? null;
      const pointer = opts.atPointer;
      if (pointer && Number.isFinite(pointer.x) && Number.isFinite(pointer.y)) {
        atPointer = { x: +pointer.x, y: +pointer.y };
      }
    }

    const { r, c } = this.sel.active;
    const el = this.renderer.cellEl(r, c);
    if (!el) return;

    this.editing = true;
    this._editingEl = el;
    this._original = this.model.get(r, c);

    // Bật edit trực tiếp trên ô
    el.setAttribute('contenteditable', 'plaintext-only');
    if (!('plaintext-only' in document.createElement('div'))) {
      el.setAttribute('contenteditable', 'true'); // Fallback
    }

    // Giá trị khởi tạo
    el.textContent = initialText !== null ? initialText : (this._original ?? '');

    // Focus + caret
    el.focus({ preventScroll: true });
    if (atPointer) {
      this.placeCaretAtPointer(el, atPointer.x, atPointer.y);
    } else {
      this.placeCaretEnd(el);
    }

    // Listeners ở ô
    this._onMouseDownEdit = e => {
      if (e.button !== 0) return; // Chỉ chuột trái
      e.stopPropagation(); // Ngăn Mouse.onDown() chạy edit.commit
    };

    // Listeners phím trong ô
    this._onKeyDown = e => {
      // Điều khiển popup gợi ý
      if (!e.altKey && !e.ctrlKey && !e.metaKey && this.isSugVisible()) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          e.stopPropagation();
          this.moveSug(1);
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          e.stopPropagation();
          this.moveSug(-1);
          return;
        }
        if (e.key === 'Tab') {
          e.preventDefault();
          e.stopPropagation();
          this.acceptSug();
          return;
        }
      }
      
      // ENTER: commit + lên/xuống
      if (e.key === 'Enter' && !e.altKey) {
        e.preventDefault();
        e.stopPropagation();
        const dr = e.shiftKey ? -1 : 1;
        this.hideSug();
        this.commit({ move: { dr, dc: 0 } });
        return;
      }
      
      // TAB: commit + sang phải / sang trái (Shift)
      if (e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        this.hideSug();
        const dc = e.shiftKey ? -1 : 1;
        this.commit({ move: { dr: 0, dc } });
        return;
      }
      
      // ESC: đóng gợi ý hoặc hủy edit
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.isSugVisible() ? this.hideSug() : this.cancel();
        return;
      }
      
      // Các phím khác đi qua
      e.stopPropagation();
    };
    
    this._onInput = () => this.updateSug();

    el.addEventListener('mousedown', this._onMouseDownEdit);
    el.addEventListener('keydown', this._onKeyDown);
    el.addEventListener('input', this._onInput);

    // Tính gợi ý ban đầu
    this.updateSug();
  }

  commit({ move = null } = {}) {
    if (!this.editing || !this._editingEl) return;

    const text = (this._editingEl.textContent || '').replace(/\r/g, '');
    const rng = this.sel.range;
    const before = this.model.getRange(rng);

    // Tính vị trí tiếp theo trước khi re-render
    const nextPos = move ? {
      r: this.sel.active.r + (move.dr || 0),
      c: this.sel.active.c + (move.dc || 0)
    } : null;

    // Dừng edit
    this.stop(true);

    // Ghi vào model
    let after;
    
    if (this.fillAll || !isSingle(rng)) {
      after = Array.from({ length: rng.r1 - rng.r0 + 1 }, () => 
        Array.from({ length: rng.c1 - rng.c0 + 1 }, () => text)
      );
    } else {
      after = [[text]];
    }

    this.cmdMgr.execute({
      name: 'edit-cells',
      do: () => this.model.setRange(rng, after),
      undo: () => this.model.setRange(rng, before)
    });

    // Khôi phục selection
    if (nextPos) {
      this.sel.setActive(nextPos.r, nextPos.c);
      this.bus.emit('selection.changed');
    }
  }

  cancel() {
    if (!this.editing) return;
    if (this._editingEl) this._editingEl.textContent = this._original ?? '';
    this.stop(false);
  }

  stop(refocusRoot = true) {
    this.hideSug();
    
    if (this._editingEl) {
      this._editingEl.removeEventListener('keydown', this._onKeyDown);
      this._editingEl.removeEventListener('input', this._onInput);
      this._editingEl.removeEventListener('mousedown', this._onMouseDownEdit);
      this._editingEl.removeAttribute('contenteditable');
      this._editingEl = null;
    }
    
    this._onKeyDown = null;
    this._onInput = null;
    this._onMouseDownEdit = null;
    this.editing = false;
    this.fillAll = false;
    
    if (refocusRoot) this.root.focus({ preventScroll: true });
  }
}