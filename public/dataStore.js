// dataStore.js — cache hiển thị + tham chiếu + FMT persist
export class DataStore {
  constructor(bus){
    this.bus = bus;
    /** @type {Map<string, {header:string[], rows:string[][], fmt:Object, url?:string, version?:number, dirty:boolean, updatedAt:number}>} */
    this.docs = new Map();
    this.currentKey = null;

    this.ref = { loaded:false, url:null, sheets:{} };
  }

  key(kind, date){
    const mm = String(date.getMonth()+1).padStart(2,'0');
    const yyyy = String(date.getFullYear());
    return `${kind}@${yyyy}-${mm}`;
  }

  async getOrFetch(reader, kind, date){
    const key = this.key(kind, date);
    if (!this.docs.has(key)){
      const { header, rows, fmt, url, version } = await reader.load(kind, date);
      this.docs.set(key, { header, rows, fmt: fmt || {}, url, version, dirty:false, updatedAt: Date.now() });
    }
    return { key, doc: this.docs.get(key) };
  }

  updateRows(key, rows, markDirty = true){
    const doc = this.docs.get(key);
    if (!doc) throw new Error(`Doc không tồn tại: ${key}`);
    doc.rows = rows;
    if (markDirty) doc.dirty = true;
    doc.updatedAt = Date.now();
    this.bus?.emit?.('data:doc:dirty', { key, rows: rows.length, cols: doc.header.length });
  }

  toModel(key, model, renderer){
    const doc = this.docs.get(key);
    if (!doc) throw new Error(`Doc không tồn tại: ${key}`);

    const rows = doc.rows || [];
    const cols = Math.max(doc.header.length, ...rows.map(r => r.length || 0), 1);

    // reset values
    model.clearRange({ r0:0, c0:0, r1:model.rows-1, c1:model.cols-1 });
    model.ensureSize(Math.max(1, rows.length), cols);
    if (rows.length){
      model.setRange({ r0:0, c0:0, r1:rows.length-1, c1:cols-1 }, rows);
    }

    // reset & apply FMT
    model.fmt = new Map();
    const fmt = doc.fmt || {};
    for (const [k, v] of Object.entries(fmt)) {
      if (v && typeof v === 'object') model.fmt.set(k, { ...v });
    }

    renderer?.setHeaders?.(doc.header);
    this.currentKey = key;
    this.bus?.emit?.('data:select', { key, rows: rows.length, cols, dirty: !!doc.dirty });
  }

  captureFromModel(model){
    if (!this.currentKey) return;
    const raw = model.getRange({ r0:0, c0:0, r1:model.rows-1, c1:model.cols-1 });

    const empty = v => (v == null) || (String(v).trim() === '');
    let lastRow = -1, lastCol = -1;
    for (let r=0; r<raw.length; r++){
      const row = raw[r] || [];
      let lastInRow = -1;
      for (let c=0; c<row.length; c++){ if (!empty(row[c])) lastInRow = c; }
      if (lastInRow >= 0){ lastRow = r; if (lastInRow > lastCol) lastCol = lastInRow; }
    }
    const H = lastRow + 1, W = lastCol + 1;
    const trimmed = [];
    for (let r=0; r<H; r++){
      const line = (raw[r] ?? []).slice(0, W);
      while (line.length < W) line.push('');
      trimmed.push(line);
    }

    const doc = this.docs.get(this.currentKey);
    if (!doc) return;
    doc.rows = trimmed;

    // Trim & persist FMT trong phạm vi HxW
    const fmtObj = {};
    model.fmt.forEach((val, key)=>{
      const [r, c] = key.split(',').map(Number);
      if (r < H && c < W) fmtObj[key] = { ...val };
    });
    doc.fmt = fmtObj;

    doc.dirty = true;
    doc.updatedAt = Date.now();
    this.bus?.emit?.('data:doc:dirty', { key: this.currentKey, rows: H, cols: W });
  }

  exportJSON(key){
    const doc = this.docs.get(key);
    if (!doc) throw new Error(`Doc không tồn tại: ${key}`);
    return { headers: doc.header, data: doc.rows, fmt: doc.fmt || {} };
  }

  markClean(key){
    const doc = this.docs.get(key);
    if (!doc) return;
    doc.dirty = false;
    doc.updatedAt = Date.now();
    this.bus?.emit?.('data:doc:dirty', { key, rows: doc.rows.length, cols: doc.header.length });
  }

  setVersion(key, version){
    const doc = this.docs.get(key);
    if (!doc) return;
    doc.version = Number(version || 0);
    doc.updatedAt = Date.now();
  }

  // ---- final_data.json (giữ nguyên) ----
  setReference(url, sheets){
    this.ref = { loaded:true, url, sheets, loadedAt: Date.now() };
    const sz = (s)=> ({ rows: (s?.rows?.length||0), cols: (s?.header?.length||0) });
    this.bus?.emit?.('refdata.loaded', {
      url,
      sheets: {
        khachhang: sz(sheets.khachhang),
        nhanvien:  sz(sheets.nhanvien),
        phuongtien:sz(sheets.phuongtien)
      }
    });
  }
  hasRef(){ return !!this.ref.loaded; }
  getRefSheet(name){ return this.ref?.sheets?.[name] || { header:[], rows:[] }; }
  exportRefJSON(){ return { ...this.ref.sheets }; }
}
