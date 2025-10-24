// suggest.js — SuggestionEngine nhanh & nhẹ, tối ưu chống giật
export class SuggestionEngine {
  constructor() {
    // Cấu trúc chỉ mục cho từng tiêu đề
    /** @type {Map<string, {values:string[], norms:string[], counts:Map<string,number>, byFirst:Map<string,number[]>}>} */
    this.index = new Map();
    this.keys = [];
    
    // Cache gần đây để tránh tính toán lặp lại
    this._lastNorm = new Map();  // cache norm text
    this._lastQuery = null;      // cache kết quả query gần nhất
    this._lastHeader = null;     // header hiện tại
    this._lastPrefix = null;     // prefix hiện tại
    this._lastResults = [];      // kết quả gần nhất
    
    // Alias tiêu đề (đã norm)
    this.alias = new Map(Object.entries({
      // Khách hàng
      'khach hang': ['kh', 'khachhang', 'ten khach hang', 'customer', 'nguoi nhan', 'nguoinhan'],
      // Nhân sự
      'ten nhan vien': ['nhan vien','ten nv','ho ten','ho va ten','nguoi cham cong','nhan-su','nhansu'],
      'nhan vien':     ['ten nhan vien','ten nv','ho ten','ho va ten'],
      'ten tai xe':    ['ten nhan vien','nhan vien','ten nv','ho ten','lai xe','tai xe'],
      'tai xe':        ['ten nhan vien','nhan vien','ten nv','ho ten','lai xe'],
      'ten phu xe':    ['ten nhan vien','nhan vien','ten nv','ho ten','phu xe'],
      'phu xe':        ['ten nhan vien','nhan vien','ten nv','ho ten'],
      // Phương tiện
      'so xe':         ['bien so','bien so xe','bsx','xe','bien so x'],
      'bien so':       ['so xe','bien so xe','bsx'],
      'bien so xe':    ['so xe','bien so','bsx'],
      // Metadata
      'chuc vu':       ['vai tro','position','role','cv'],
      'ca':            ['ca lam','ca lam viec','shift'],
      'gio vao':       ['checkin','gio bat dau','bat dau','in','gio vao ca'],
      'gio ra':        ['checkout','gio ket thuc','ket thuc','out','gio ra ca'],
      'vi tri':        ['gps','toa do','toado','lat lon','latlong','location','vi tri gps'],
      'ghi chu':       ['note','ghichu','ghi chu them','ly do','ghi chu/ly do'],
      // Alias tên sheet
      'khachhang':     ['khach hang'],
      'nhan vien':     ['nhanvien'],
      'phuong tien':   ['phuongtien','xe','vehicle'],
    }));
  }

  // Chuẩn hoá chuỗi: bỏ dấu/ký tự lẻ/gọn khoảng/lower
  norm(s) {
    if (s === null || s === undefined) return '';
    
    // Dùng cache để tránh xử lý lặp lại
    const str = String(s);
    if (this._lastNorm.has(str)) return this._lastNorm.get(str);
    
    const result = str
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim().toLowerCase();
      
    // Cache kết quả (giới hạn kích thước cache)
    if (this._lastNorm.size > 1000) {
      // Xóa 1/4 cache cũ nhất nếu quá lớn
      const entries = Array.from(this._lastNorm.entries());
      const toDelete = entries.slice(0, entries.length / 4);
      for (const [key] of toDelete) this._lastNorm.delete(key);
    }
    this._lastNorm.set(str, result);
    
    return result;
  }

  // ===== Xây chỉ mục từ final_data.json =====
  /**
   * @param {{khachhang?:{header:string[],rows:string[][]}, nhanvien?:{header:string[],rows:string[][]}, phuongtien?:{header:string[],rows:string[][]}}} sheets
   */
  rebuildFromRefSheets(sheets) {
    this.index.clear();
    this._lastNorm.clear();
    this._lastQuery = null;
    this._lastHeader = null;
    this._lastPrefix = null;
    this._lastResults = [];

    const packs = [
      sheets?.khachhang,
      sheets?.nhanvien,
      sheets?.phuongtien,
      sheets?.mucluong,
    ].filter(Boolean);

    // Sử dụng Set để loại bỏ các giá trị trùng lặp trong quá trình xây dựng
    for (const pack of packs) {
      const header = Array.isArray(pack.header) ? pack.header : [];
      const rows = Array.isArray(pack.rows) ? pack.rows : [];
      
      for (let c = 0; c < header.length; c++) {
        const h = header[c]; 
        if (!h) continue;
        
        const key = this.norm(h);
        let bucket = this.index.get(key);
        
        if (!bucket) {
          bucket = { 
            values: [], 
            norms: [], 
            counts: new Map(), 
            byFirst: new Map() 
          };
          this.index.set(key, bucket);
        }
        
        // Đếm tần suất
        for (let r = 0; r < rows.length; r++) {
          const v = rows[r]?.[c];
          if (v == null) continue;
          
          const sv = String(v).trim();
          if (!sv) continue;
          
          bucket.counts.set(sv, (bucket.counts.get(sv) || 0) + 1);
        }
      }
    }

    // Finalize: sắp xếp theo tần suất > alpha + build norms & buckets
    for (const bucket of this.index.values()) {
      // Sắp xếp giá trị theo tần suất giảm dần, sau đó theo bảng chữ cái
      const arr = Array.from(bucket.counts.entries());
      arr.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
      
      bucket.values = arr.map(([v]) => v);
      bucket.norms = bucket.values.map(v => this.norm(v));

      // Tạo bucket theo ký tự đầu để tìm kiếm nhanh
      bucket.byFirst = new Map();
      for (let i = 0; i < bucket.norms.length; i++) {
        const n = bucket.norms[i] || '';
        const k = n ? n[0] : '#';
        
        if (!bucket.byFirst.has(k)) bucket.byFirst.set(k, []);
        bucket.byFirst.get(k).push(i);
      }
    }
    
    this.keys = Array.from(this.index.keys());
  }

  // ===== Map tiêu đề đang nhập -> key chỉ mục =====
  findKeyDetailed(name) {
    const q = this.norm(name);
    if (!q) return null;

    // Tìm chính xác
    if (this.index.has(q)) return { key: q, mode: 'exact' };

    // Tìm qua alias
    const aliases = this.alias.get(q) || [];
    for (const a of aliases) {
      const k = this.norm(a);
      if (this.index.has(k)) return { key: k, mode: 'alias' };
    }

    // Fuzzy search nhẹ dùng token Jaccard + includes bonus
    const qTokens = new Set(q.split(' ').filter(Boolean));
    let best = null, bestScore = 0;
    
    for (const k of this.keys) {
      const kTokens = new Set(k.split(' ').filter(Boolean));
      const inter = new Set([...qTokens].filter(t => kTokens.has(t)));
      const union = new Set([...qTokens, ...kTokens]);
      const jacc = union.size ? (inter.size / union.size) : 0;
      const incl = (k.includes(q) || q.includes(k)) ? 0.15 : 0;
      const score = jacc + incl;
      
      if (score > bestScore) { 
        bestScore = score; 
        best = k; 
      }
    }
    
    if (best && bestScore >= 0.5) {
      return { key: best, mode: 'fuzzy', score: bestScore };
    }
    
    return null;
  }
  
  // Wrapper methods
  findKey(name) { 
    const r = this.findKeyDetailed(name); 
    return r ? r.key : null; 
  }
  
  hasHeader(name) { 
    return !!this.findKey(name); 
  }

  // ===== Lấy gợi ý (siêu nhanh + cache) =====
  /**
   * @param {string} header - Tiêu đề cột cần gợi ý
   * @param {string} prefix - Tiền tố đang nhập
   * @param {number} limit - Số lượng kết quả tối đa
   * @returns {string[]} - Danh sách gợi ý
   */
  suggest(header, prefix = '', limit = 20) {
    // Kiểm tra cache - nếu header và prefix giống lần trước, trả về kết quả đã tính
    if (this._lastQuery && this._lastHeader === header && this._lastPrefix === prefix) {
      return this._lastResults.slice(0, limit);
    }
    
    // Lưu tham số cho lần cache tiếp theo
    this._lastHeader = header;
    this._lastPrefix = prefix;
    this._lastQuery = { header, prefix, timestamp: Date.now() };
    
    // Tìm key từ header
    const key = this.findKey(header);
    if (!key) {
      this._lastResults = [];
      return [];
    }
    
    const bucket = this.index.get(key);
    if (!bucket) {
      this._lastResults = [];
      return [];
    }

    const p = this.norm(prefix);
    
    // Nếu không có prefix, trả về toàn bộ giá trị (giới hạn số lượng)
    if (!p) {
      this._lastResults = bucket.values.slice(0, limit);
      return this._lastResults;
    }

    const first = p[0] || '#';
    const scanIdx = bucket.byFirst.get(first) || [];
    const norms = bucket.norms;
    const vals = bucket.values;
    const out = [];

    // Hàm quét index tìm các giá trị phù hợp
    const scanStartsWith = (indices) => {
      for (const i of indices) {
        if (norms[i].startsWith(p)) {
          out.push(vals[i]);
          if (out.length >= limit) break;
        }
      }
    };

    // 1) Ưu tiên startsWith - quét nhanh theo ký tự đầu
    scanStartsWith(scanIdx);
    
    // Nếu không đủ kết quả, quét các ký tự còn lại
    if (out.length < limit) {
      const restIdx = [];
      const seen = new Set(scanIdx);
      
      for (let i = 0; i < norms.length; i++) {
        if (!seen.has(i)) restIdx.push(i);
      }
      
      scanStartsWith(restIdx);
    }

    // 2) Nếu vẫn ít kết quả → bổ sung bằng includes
    if (out.length < limit) {
      const scanIncludes = (indices) => {
        for (const i of indices) {
          // Tránh trùng lặp với kết quả startsWith
          if (!out.includes(vals[i]) && norms[i].includes(p)) {
            out.push(vals[i]);
            if (out.length >= limit) break;
          }
        }
      };

      // Ưu tiên quét bucket của ký tự đầu tiên trước
      scanIncludes(scanIdx);
      
      // Nếu vẫn chưa đủ, quét nốt phần còn lại
      if (out.length < limit) {
        const restIdx = [];
        const seen = new Set(scanIdx);
        
        for (let i = 0; i < norms.length; i++) {
          if (!seen.has(i)) restIdx.push(i);
        }
        
        scanIncludes(restIdx);
      }
    }

    // Lưu kết quả vào cache và trả về
    this._lastResults = out;
    return out.slice(0, limit);
  }

  // Diagnostic methods
  explain(headers = []) {
    return (headers || []).map((h, i) => {
      const r = h ? this.findKeyDetailed(h) : null;
      return { 
        col: i, 
        header: h || '', 
        match: r?.key || '', 
        mode: r?.mode || 'none' 
      };
    });
  }
  
  countMatches(headers = []) { 
    let n = 0; 
    for (const h of headers) {
      if (this.findKey(h)) n++; 
    }
    return n; 
  }
}

export default SuggestionEngine;