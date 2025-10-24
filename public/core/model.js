// core/model.js
import { normalize, sizeOf, forEachCell } from './rangeRef.js';

const DEFAULT_ROW_H = 28;
const DEFAULT_COL_W = 100;  // trước đây 104 -> tăng mặc định cho đỡ "quá nhỏ"
const MIN_COL_W = 48;
const MIN_ROW_H = 12;

export class DataModel{
  constructor(rows=100, cols=26){
    this.rows = rows; this.cols = cols;
    this.data = Array.from({length: rows}, ()=> Array.from({length: cols}, ()=>""));
    this.fmt  = new Map(); // key "r,c" => {bold, italic, underline, align, color, bg}
    this.rowHeights = Array.from({length: rows}, ()=> DEFAULT_ROW_H);
    this.colWidths  = Array.from({length: cols}, ()=> DEFAULT_COL_W);
  }

  ensureSize(minRows, minCols){
    while(this.rows < minRows){
      this.data.push(Array.from({length: this.cols}, ()=>""));
      this.rowHeights.push(DEFAULT_ROW_H);
      this.rows++;
    }
    if(this.cols < minCols){
      const add = minCols - this.cols;
      for(let r=0;r<this.rows;r++){
        this.data[r].push(...Array.from({length:add}, ()=>""));
      }
      this.colWidths.push(...Array.from({length:add}, ()=> DEFAULT_COL_W));
      this.cols = minCols;
    }
  }

  get(r,c){ if(r<0||c<0||r>=this.rows||c>=this.cols) return ""; return this.data[r][c]; }
  set(r,c,val){ this.ensureSize(r+1,c+1); this.data[r][c]=val; }

  getRange(rng){
    const {rows, cols} = sizeOf(rng);
    const out = Array.from({length: rows}, ()=> Array.from({length: cols}, ()=>""));
    for(let rr=0; rr<rows; rr++){
      for(let cc=0; cc<cols; cc++){
        out[rr][cc] = this.get(rng.r0+rr, rng.c0+cc);
      }
    }
    return out;
  }
  setRange(rng, values){
    const {rows, cols} = sizeOf(rng);
    this.ensureSize(rng.r1+1, rng.c1+1);
    for(let rr=0; rr<rows; rr++){
      for(let cc=0; cc<cols; cc++){
        this.data[rng.r0+rr][rng.c0+cc] = values[rr]?.[cc] ?? "";
      }
    }
  }

  clearRange(rng){ forEachCell(rng, (r,c)=> this.set(r,c,"")); }

  setFormatRange(rng, patch){
    forEachCell(rng, (r,c)=>{
      const k = `${r},${c}`;
      const cur = this.fmt.get(k) ?? {};
      const nxt = {...cur, ...patch};
      for(const [k2,v] of Object.entries(nxt)){ if(v===null) delete nxt[k2]; }
      if(Object.keys(nxt).length) this.fmt.set(k, nxt); else this.fmt.delete(k);
    });
  }
  getFormat(r,c){ return this.fmt.get(`${r},${c}`) ?? {}; }

  insertRows(at, count=1){
    const newRows = Array.from({length: count}, ()=> Array.from({length: this.cols}, ()=>""));
    this.data.splice(at+1, 0, ...newRows);
    this.rowHeights.splice(at+1, 0, ...Array.from({length:count}, ()=>DEFAULT_ROW_H));
    this.rows += count;
    const updated = new Map();
    this.fmt.forEach((val, key)=>{
      let [r,c] = key.split(",").map(Number);
      if(r>at) r += count;
      updated.set(`${r},${c}`, val);
    });
    this.fmt = updated;
  }

  deleteRows(r0, r1){
    const count = r1 - r0 + 1;
    this.data.splice(r0, count);
    this.rowHeights.splice(r0, count);
    this.rows -= count;
    const updated = new Map();
    this.fmt.forEach((val, key)=>{
      let [r,c] = key.split(",").map(Number);
      if(r<r0) updated.set(key,val);
      else if(r>r1) updated.set(`${r-count},${c}`, val);
    });
    this.fmt = updated;
  }

  insertCols(at, count=1){
    for(let r=0;r<this.rows;r++){
      const newVals = Array.from({length:count}, ()=>"");
      this.data[r].splice(at+1, 0, ...newVals);
    }
    this.colWidths.splice(at+1, 0, ...Array.from({length:count}, ()=> DEFAULT_COL_W));
    this.cols += count;
    const updated = new Map();
    this.fmt.forEach((val,key)=>{
      let [r,c] = key.split(",").map(Number);
      if(c>at) c += count;
      updated.set(`${r},${c}`, val);
    });
    this.fmt = updated;
  }

  deleteCols(c0, c1){
    const count = c1 - c0 + 1;
    for(let r=0;r<this.rows;r++){ this.data[r].splice(c0, count); }
    this.colWidths.splice(c0, count);
    this.cols -= count;
    const updated = new Map();
    this.fmt.forEach((val,key)=>{
      let [r,c] = key.split(",").map(Number);
      if(c<c0) updated.set(key,val);
      else if(c>c1) updated.set(`${r},${c-count}`, val);
    });
    this.fmt = updated;
  }

  setColWidth(c, w){ this.colWidths[c] = Math.max(MIN_COL_W, Math.round(w)); }
  setRowHeight(r, h){ this.rowHeights[r] = Math.max(MIN_ROW_H, Math.round(h)); }

  exportTSV(rng){
    const arr = this.getRange(rng);
    return arr.map(row=> row.map(s=> String(s)).join('\t')).join('\n');
  }
  importTSV(startR, startC, text){
    const rows = text.replace(/\r/g,'').split('\n').map(line=> line.split('\t'));
    const h = rows.length, w = rows[0]?.length ?? 1;
    const rng = normalize({r0:startR, c0:startC, r1:startR+h-1, c1:startC+w-1});
    const before = this.getRange(rng);
    this.setRange(rng, rows);
    return {rng, before, after: rows};
  }
}
