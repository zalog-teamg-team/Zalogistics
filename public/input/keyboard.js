// Bàn phím: di chuyển, chọn, phím tắt, phát hành action qua bus - Tối ưu
import { isSingle } from '../core/rangeRef.js';

export class Keyboard {
  constructor(hostEl, model, selection, inputLayer, bus) {
    this.host = hostEl;
    this.model = model;
    this.sel = selection;
    this.input = inputLayer;
    this.bus = bus;
    
    // Cờ trạng thái để ngăn xử lý đồng thời
    this._processing = false;
    // Giúp tránh thao tác phím nhanh, lag (debounce)
    this._lastKeyTime = 0;
    this._keyDebounceTime = 50; // ms
    
    // Bind để tránh tạo hàm xử lý mới mỗi lần
    this._boundOnKey = this.onKey.bind(this);
    
    // Đăng ký sự kiện
    this.host.addEventListener('keydown', this._boundOnKey);
    
    // Phím tắt và hành động tương ứng - dễ mở rộng
    this.shortcuts = {
      // Định dạng
      'ctrl+b': 'format.bold',
      'ctrl+i': 'format.italic',
      'ctrl+u': 'format.underline',
      // Clipboard
      'ctrl+c': 'clipboard.copy',
      'ctrl+x': 'clipboard.cut',
      'ctrl+v': 'clipboard.paste',
      // Khác
      'ctrl+a': 'select.all',
      'ctrl+d': 'fill.down',
      'ctrl+z': 'undo',
      'ctrl+y': 'redo',
      'ctrl+ ': 'select.col',
      'ctrl+Enter': 'row.insertBelow',
      'ctrl+Delete': 'row.delete',
      'ctrl+Backspace': 'row.delete',
      'shift+Space': 'select.row',
      'F2': 'edit.start'
    };
    
    // Ánh xạ phím di chuyển tới delta [row, col, extend]
    this.moveKeys = {
      'ArrowLeft':  [0, -1, false],
      'ArrowRight': [0, 1, false],
      'ArrowUp':    [-1, 0, false],
      'ArrowDown':  [1, 0, false],
      'Tab':        [0, 1, false],
      'Enter':      [1, 0, false],
      'ShiftLeft':  [0, -1, true],
      'ShiftRight': [0, 1, true],
      'ShiftUp':    [-1, 0, true],
      'ShiftDown':  [1, 0, true],
      'ShiftTab':   [0, -1, false],
      'ShiftEnter': [-1, 0, false]
    };
  }
  
  // Tạo chuỗi nhận dạng phím tắt
  getShortcutKey(e) {
    let key = '';
    if (e.ctrlKey || e.metaKey) key += 'ctrl+';
    if (e.shiftKey) key += 'shift+';
    if (e.altKey) key += 'alt+';
    
    // Xử lý các phím đặc biệt riêng
    if (e.key === ' ') key += ' ';
    else if (e.key.length === 1) key += e.key.toLowerCase();
    else key += e.key;
    
    return key;
  }
  
  // Xử lý di chuyển
  handleMove(dr, dc, extend = false) {
    const r = Math.max(0, Math.min(this.model.rows - 1, this.sel.active.r + dr));
    const c = Math.max(0, Math.min(this.model.cols - 1, this.sel.active.c + dc));
    
    if (extend) {
      this.sel.extendTo(r, c);
    } else {
      this.sel.setActive(r, c);
    }
    
    this.bus.emit('selection.changed');
    
    // Đảm bảo ô đang active hiển thị trong vùng nhìn
    requestAnimationFrame(() => {
      this.bus.emit('selection.changed', { ensureVisible: true });
    });
  }
  
  onKey(e) {
    // Kiểm tra điều kiện dừng ngay
    if (e.target && e.target.tagName === 'TEXTAREA') return;
    if (e.defaultPrevented) return;
    
    // Ngăn chặn xử lý đồng thời (chống giật, lag)
    if (this._processing) {
      e.preventDefault();
      return;
    }
    
    // Debounce phím thao tác nhanh
    const now = Date.now();
    if (now - this._lastKeyTime < this._keyDebounceTime) {
      e.preventDefault();
      return;
    }
    this._lastKeyTime = now;
    
    // Đánh dấu đang xử lý
    this._processing = true;
    
    try {
      this._handleKeyEvent(e);
    } finally {
      // Đảm bảo reset trạng thái khi hoàn thành
      requestAnimationFrame(() => {
        this._processing = false;
      });
    }
  }
  
  _handleKeyEvent(e) {
    const ctrl = e.ctrlKey || e.metaKey;
    
    // Đóng menu/dropdown nếu đang mở
    this.bus.emit('ui.dismiss');
    
    // Xử lý trong khi đang chỉnh sửa
    if (this.input.editing) {
      // Phím tắt định dạng trong edit mode
      if (ctrl && ['b', 'i', 'u'].includes(e.key)) {
        e.preventDefault();
        this.bus.act(`format.${e.key === 'b' ? 'bold' : e.key === 'i' ? 'italic' : 'underline'}`);
      }
      return;
    }
    
    // Escape để hủy thao tác
    if (e.key === 'Escape') {
      e.preventDefault();
      return;
    }
    
    // Xử lý phím tắt từ bảng
    const shortcutKey = this.getShortcutKey(e);
    if (this.shortcuts[shortcutKey]) {
      e.preventDefault();
      
      // Xử lý các trường hợp đặc biệt
      if (shortcutKey === 'ctrl+a') {
        this.sel.selectAll();
        this.bus.emit('selection.changed');
      } else if (shortcutKey === 'F2') {
        this.bus.act('edit.start');
      } else {
        // Gọi action thông qua bus
        this.bus.act(this.shortcuts[shortcutKey]);
      }
      return;
    }
    
    // Bắt đầu edit khi gõ ký tự
    if (e.key.length === 1 && !ctrl && !e.altKey) {
      e.preventDefault();
      this.input.fillAll = !isSingle(this.sel.range);
      this.bus.act('edit.start', { initial: e.key });
      return;
    }
    
    // Xử lý phím di chuyển
    let moveKey = e.key;
    if (e.shiftKey) moveKey = 'Shift' + moveKey;
    
    if (this.moveKeys[moveKey]) {
      e.preventDefault();
      const [dr, dc, extend] = this.moveKeys[moveKey];
      this.handleMove(dr, dc, extend || e.shiftKey);
      return;
    }
    
    // Xử lý Home/End
    if (e.key === 'Home') {
      e.preventDefault();
      const r = this.sel.active.r;
      this.sel.extendTo(r, 0);
      this.bus.emit('selection.changed');
      return;
    }
    
    if (e.key === 'End') {
      e.preventDefault();
      const r = this.sel.active.r;
      this.sel.extendTo(r, this.model.cols - 1);
      this.bus.emit('selection.changed');
      return;
    }
    
    // Xử lý Delete/Backspace
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      this.bus.act('cells.clear');
      return;
    }
  }
  
  // Hủy đăng ký sự kiện khi không cần thiết
  destroy() {
    this.host.removeEventListener('keydown', this._boundOnKey);
    this.shortcuts = null;
    this.moveKeys = null;
  }
}