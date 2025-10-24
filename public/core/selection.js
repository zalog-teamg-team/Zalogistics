// core/selection.js
import { normalize } from './rangeRef.js';

export class Selection{
  constructor(model){
    this.model = model;
    this.anchor = {r:0,c:0};
    this.active = {r:0,c:0};
    this.range  = normalize({r0:0,c0:0,r1:0,c1:0});
    this.extras = new Set(); // Set<"r,c"> các ô không liền kề (Ctrl+click)
  }

  // clamp về lưới
  _clampRC(r,c){
    r = Math.max(0, Math.min(r, this.model.rows-1));
    c = Math.max(0, Math.min(c, this.model.cols-1));
    return {r,c};
  }

  setActive(r,c, {preserveExtras=false}={}){
    const p = this._clampRC(r,c);
    if(!preserveExtras) this.extras.clear();
    this.anchor = {...p};
    this.active = {...p};
    this.range  = normalize({r0:p.r,c0:p.c,r1:p.r,c1:p.c});
  }

  extendTo(r,c){
    const p = this._clampRC(r,c);
    this.active = {...p};
    this.range  = normalize({r0:this.anchor.r,c0:this.anchor.c,r1:p.r,c1:p.c});
  }

  selectRow(r){
    const p = this._clampRC(r,0);
    this.extras.clear();
    this.anchor = {r:p.r, c:0};
    this.active = {r:p.r, c:this.model.cols-1};
    this.range  = normalize({r0:p.r,c0:0,r1:p.r,c1:this.model.cols-1});
  }

  selectCol(c){
    const p = this._clampRC(0,c);
    this.extras.clear();
    this.anchor = {r:0, c:p.c};
    this.active = {r:this.model.rows-1, c:p.c};
    this.range  = normalize({r0:0,c0:p.c,r1:this.model.rows-1,c1:p.c});
  }

  selectAll(){
    this.extras.clear();
    this.anchor = {r:0,c:0};
    this.active = {r:this.model.rows-1, c:this.model.cols-1};
    this.range  = normalize({r0:0,c0:0,r1:this.model.rows-1,c1:this.model.cols-1});
  }

  // Ctrl+click: bật/tắt 1 ô (nếu ô đang nằm trong range hiện tại thì bỏ qua)
  toggleExtraCell(r,c){
    const p = this._clampRC(r,c);
    const R = this.range;
    if (p.r>=R.r0 && p.r<=R.r1 && p.c>=R.c0 && p.c<=R.c1) return; // đã thuộc range chính
    const k = `${p.r},${p.c}`;
    if (this.extras.has(k)) this.extras.delete(k);
    else this.extras.add(k);
  }

  clearExtras(){ this.extras.clear(); }

  // Dùng bởi renderer/actions
  getAllRanges(){
    const arr = [this.range];
    for (const k of this.extras){
      const [r,c] = k.split(',').map(Number);
      arr.push({r0:r,c0:c,r1:r,c1:c});
    }
    return arr;
  }
}
