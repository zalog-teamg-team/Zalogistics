// clipboard.js - Xử lý clipboard mượt mà cho cả DOM events và action-based operations
import { isSingle } from '../core/rangeRef.js';
import { ClearCells, SetCells } from '../core/commands.js';

export class Clipboard {
  constructor(hostEl, model, selection, cmdMgr, bus) {
    this.host = hostEl;
    this.model = model;
    this.sel = selection;
    this.cmd = cmdMgr;
    this.bus = bus;
    
    // Đánh dấu đang xử lý paste để tránh xung đột
    this._processing = false;
    // Debounce thời gian cho paste liên tiếp
    this._pasteDebounceId = 0;
    // Cache clipboard để tránh lặp lại
    this._lastCopy = { text: '', timestamp: 0 };
    
    // Gắn DOM event handlers
    this.host.addEventListener('copy', this.onCopy.bind(this));
    this.host.addEventListener('cut', this.onCut.bind(this));
    this.host.addEventListener('paste', this.onPaste.bind(this));
    
    // Đăng ký action handlers qua bus
    this.registerClipboardActions();
  }
  
  // Đăng ký actions cho menu và truy cập qua code
  registerClipboardActions() {
    // Copy action - hỗ trợ cả clipboard API và phương pháp fallback
    this.bus.registerAction('clipboard.copy', async () => {
      // Sử dụng cache nếu copy gần đây để tránh giật
      const now = Date.now();
      if (now - this._lastCopy.timestamp < 300) {
        return;
      }
      
      // Lấy dữ liệu và cache
      const tsv = this.model.exportTSV(this.sel.range);
      this._lastCopy = { text: tsv, timestamp: now };
      
      try {
        await navigator.clipboard.writeText(tsv);
      } catch (err) {
        // Fallback copy nếu API không khả dụng
        this.fallbackCopy(tsv);
      }
    });
    
    // Cut action
    this.bus.registerAction('clipboard.cut', async () => {
      if (this._processing) return;
      this._processing = true;
      
      try {
        const rng = this.sel.range;
        const before = this.model.getRange(rng);
        const tsv = this.model.exportTSV(rng);
        
        // Trước tiên copy vào clipboard
        try {
          await navigator.clipboard.writeText(tsv);
        } catch {
          this.fallbackCopy(tsv);
        }
        
        // Sau đó xóa cells với hỗ trợ undo/redo
        this.cmd.execute(ClearCells(this.model, rng, before));
      } finally {
        this._processing = false;
      }
    });
    
    // Paste action
    this.bus.registerAction('clipboard.paste', async () => {
      if (this._processing) return;
      this._processing = true;
      
      try {
        const text = await navigator.clipboard.readText();
        if (!text) return;
        this.processPaste(text);
      } catch {
        // Browser chặn readText (http/file:). Người dùng vẫn có thể dùng Ctrl+V qua event listener
      } finally {
        this._processing = false;
      }
    });
  }
  
  // DOM event handlers
  onCopy(e) {
    const tsv = this.model.exportTSV(this.sel.range);
    e.clipboardData.setData('text/plain', tsv);
    
    // Cache lại kết quả copy để tránh giật khi copy liên tiếp
    this._lastCopy = { text: tsv, timestamp: Date.now() };
    
    e.preventDefault();
  }
  
  onCut(e) {
    if (this._processing) {
      e.preventDefault();
      return;
    }
    
    this._processing = true;
    
    try {
      const rng = this.sel.range;
      const before = this.model.getRange(rng);
      const tsv = this.model.exportTSV(rng);
      
      e.clipboardData.setData('text/plain', tsv);
      e.preventDefault();
      
      // Thực hiện xóa cells với hiệu ứng trực quan
      requestAnimationFrame(() => {
        this.cmd.execute(ClearCells(this.model, rng, before));
        this._processing = false;
      });
    } catch (err) {
      console.error('Cut error:', err);
      this._processing = false;
    }
  }
  
  onPaste(e) {
    if (this._processing) {
      e.preventDefault();
      return;
    }
    
    const text = e.clipboardData.getData('text/plain');
    if (!text) return;
    
    e.preventDefault();
    
    // Debounce paste để tránh xử lý nhiều lần liên tiếp
    clearTimeout(this._pasteDebounceId);
    this._pasteDebounceId = setTimeout(() => {
      this._processing = true;
      
      // Sử dụng requestAnimationFrame để đồng bộ với render cycle
      requestAnimationFrame(() => {
        try {
          this.processPaste(text);
        } finally {
          this._processing = false;
        }
      });
    }, 0);
  }
  
  // Xử lý paste chung
  processPaste(text) {
    // Tối ưu xử lý cho dữ liệu lớn
    const { r, c } = this.sel.anchor;
    
    // Xử lý dữ liệu đầu vào - loại bỏ carriage returns và phân tách dòng/cột
    const rows = text.replace(/\r/g, '')
                     .split('\n')
                     .map(line => line.split('\t'));
    
    // Tránh xử lý nếu không có dữ liệu
    if (!rows.length || (rows.length === 1 && !rows[0][0])) return;
    
    // Tính toán phạm vi đích
    const rng = {
      r0: r,
      c0: c,
      r1: Math.min(this.model.rows - 1, r + rows.length - 1),
      c1: Math.min(this.model.cols - 1, c + (rows[0]?.length ?? 1) - 1)
    };
    
    // Lấy dữ liệu hiện tại để undo
    const before = this.model.getRange(rng);
    
    // Giới hạn kích thước phần xử lý nếu quá lớn
    const maxRows = 10000;
    const maxCols = 1000;
    
    if (rows.length > maxRows || rows[0].length > maxCols) {
      const trimmedRows = rows.slice(0, maxRows).map(row => row.slice(0, maxCols));
      this.cmd.execute(SetCells(this.model, rng, before, trimmedRows));
    } else {
      this.cmd.execute(SetCells(this.model, rng, before, rows));
    }
    
    // Đảm bảo selection cập nhật đến vùng vừa paste
    if (rng.r1 > r || rng.c1 > c) {
      this.sel.setActive(r, c);
      this.sel.extendTo(rng.r1, rng.c1);
      this.bus.emit?.('selection.changed');
    }
  }
  
  // Phương pháp copy fallback cho trình duyệt không hỗ trợ clipboard API
  fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    
    // Cài đặt textarea ngoài tầm nhìn
    Object.assign(ta.style, {
      position: 'fixed',
      top: '-9999px',
      left: '-9999px',
      opacity: '0',
      pointerEvents: 'none',
    });
    
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    
    try {
      document.execCommand('copy');
    } catch (err) {
      console.error('Fallback copy failed:', err);
    }
    
    document.body.removeChild(ta);
  }
}