// actions/actions.js
// Định nghĩa hành động mức cao (1 action ↔ 1 handler)
import {
  ClearCells,
  DeleteCols,
  DeleteRows,
  FormatRange,
  InsertCols,
  InsertRows,
  SetCells,
  FillDown
} from '../core/commands.js';
import { isSingle } from '../core/rangeRef.js';
import { assignTripId } from '../logic/assignTripId.js';

export function registerActions(bus, model, sel, cmdMgr, renderer, inputLayer){
  // Render khi model/selection thay đổi
  const rerender = ()=> renderer.render();
  cmdMgr.onChanged = rerender;

  // NOTE: chỉ cuộn khi payload.ensure !== false (mặc định vẫn cuộn)
  bus.on('selection.changed', (payload)=>{
    renderer.updateSelection();
    if (payload?.ensure !== false) {
      renderer.ensureVisible();
    }
  }, 10);

  // Font family
  bus.registerAction('format.font', ({font})=>{
    const rng = sel.range;
    const beforeFmt = new Map();
    for(let r=rng.r0; r<=rng.r1; r++){
      for(let c=rng.c0; c<=rng.c1; c++){
        const k = `${r},${c}`; const v = model.fmt.get(k); if(v) beforeFmt.set(k,{...v});
      }
    }
    // null để xóa về mặc định
    cmdMgr.execute(FormatRange(model, rng, { font: font || null }, beforeFmt));
  });

  // Font size (px)
  bus.registerAction('format.fontSize', ({size})=>{
    const rng = sel.range;
    const beforeFmt = new Map();
    for(let r=rng.r0; r<=rng.r1; r++){
      for(let c=rng.c0; c<=rng.c1; c++){
        const k = `${r},${c}`; const v = model.fmt.get(k); if(v) beforeFmt.set(k,{...v});
      }
    }
    const n = Number(size);
    cmdMgr.execute(FormatRange(model, rng, { fontSize: Number.isFinite(n) ? n : null }, beforeFmt));
  });

  // ==== Edit (đổi: forward full payload để hỗ trợ atPointer) ====
  bus.registerAction('edit.start', (payload={})=> inputLayer.start(payload));
  bus.registerAction('edit.commit', ({move=null}={})=>{
    if(inputLayer.editing) inputLayer.commit({move});
  });
  bus.registerAction('edit.cancel', ()=>{ if(inputLayer.editing) inputLayer.cancel(); });

  // Clear cells
  bus.registerAction('cells.clear', ()=>{
    const rng = sel.range;
    const before = model.getRange(rng);
    cmdMgr.execute(ClearCells(model, rng, before));
  });

  // Fill down (Ctrl+D)
  bus.registerAction('fill.down', () => {
    const { r0, c0, r1, c1 } = sel.range;
    if (r0 === r1) {
      if (r0 === 0) return;
      const target = { r0: r0, c0, r1: r0, c1 };
      cmdMgr.execute(FillDown(model, target, r0 - 1));
    } else {
      if (r0 + 1 > r1) return;
      const target = { r0: r0 + 1, c0, r1, c1 };
      cmdMgr.execute(FillDown(model, target, r0));
    }
  });

  // Undo/Redo
  bus.registerAction('undo', ()=> cmdMgr.undo());
  bus.registerAction('redo', ()=> cmdMgr.redo());

  // Format toggles
  const toggleFmt = (key)=>{
    const rng = sel.range;
    const beforeFmt = new Map();
    for(let r=rng.r0; r<=rng.r1; r++){
      for(let c=rng.c0; c<=rng.c1; c++){
        const k = `${r},${c}`;
        const v = model.fmt.get(k);
        if(v) beforeFmt.set(k, {...v});
      }
    }
    let anyOff = false;
    for(let r=rng.r0; r<=rng.r1 && !anyOff; r++){
      for(let c=rng.c0; c<=rng.c1 && !anyOff; c++){
        if(!model.getFormat(r,c)[key]) anyOff = true;
      }
    }
    const patch = {[key]: anyOff ? true : null};
    cmdMgr.execute(FormatRange(model, rng, patch, beforeFmt));
  };
  bus.registerAction('format.bold', ()=> toggleFmt('bold'));
  bus.registerAction('format.italic', ()=> toggleFmt('italic'));
  bus.registerAction('format.underline', ()=> toggleFmt('underline'));

  bus.registerAction('format.align', ({align})=>{
    const rng = sel.range;
    const beforeFmt = new Map();
    for(let r=rng.r0; r<=rng.r1; r++){
      for(let c=rng.c0; c<=rng.c1; c++){
        const k = `${r},${c}`; const v = model.fmt.get(k); if(v) beforeFmt.set(k,{...v});
      }
    }
    cmdMgr.execute(FormatRange(model, rng, {align}, beforeFmt));
  });
  bus.registerAction('format.color', ({color})=>{
    const rng = sel.range;
    const beforeFmt = new Map();
    for(let r=rng.r0; r<=rng.r1; r++){
      for(let c=rng.c0; c<=rng.c1; c++){
        const k = `${r},${c}`; const v = model.fmt.get(k); if(v) beforeFmt.set(k,{...v});
      }
    }
    cmdMgr.execute(FormatRange(model, rng, {color}, beforeFmt));
  });
  bus.registerAction('format.fill', ({bg})=>{
    const rng = sel.range;
    const beforeFmt = new Map();
    for(let r=rng.r0; r<=rng.r1; r++){
      for(let c=rng.c0; c<=rng.c1; c++){
        const k = `${r},${c}`; const v = model.fmt.get(k); if(v) beforeFmt.set(k,{...v});
      }
    }
    cmdMgr.execute(FormatRange(model, rng, {bg}, beforeFmt));
  });

  bus.registerAction('clear.format', ()=>{
    const rng = sel.range;
    const beforeFmt = new Map();
    for(let r=rng.r0; r<=rng.r1; r++){
      for(let c=rng.c0; c<=rng.c1; c++){
        const k = `${r},${c}`; const v = model.fmt.get(k); if(v) beforeFmt.set(k,{...v});
      }
    }
    cmdMgr.execute(FormatRange(
      model, rng,
      {bold:null,italic:null,underline:null,align:null,color:null,bg:null, font:null, fontSize:null},
      beforeFmt
    ));
  });

  // Insert/Delete Rows/Cols
  bus.registerAction('row.insertBelow', ()=>{
    const { r0, r1 } = sel.range;
    const count = r1 - r0 + 1;
    cmdMgr.execute(InsertRows(model, r1, count));
    // chọn vùng mới chèn
    sel.setActive(r1 + 1, 0);
    sel.extendTo(r1 + count, model.cols - 1);
    bus.emit('selection.changed'); // cho phép auto-scroll vì người dùng chủ động
  });

  bus.registerAction('row.delete', ()=>{
    const {r0,r1} = sel.range;
    const backup = {
      rows: model.data.slice(r0, r1+1).map(row=>row.slice()),
      rowHeights: model.rowHeights.slice(r0, r1+1),
      fmt: new Map(Array.from(model.fmt.entries()).filter(([k])=>{
        const [r] = k.split(',').map(Number);
        return r>=r0 && r<=r1;
      }))
    };
    cmdMgr.execute(DeleteRows(model, r0, r1, backup));
  });

  bus.registerAction('col.insertRight', ()=>{
    const { c0, c1 } = sel.range;
    const count = c1 - c0 + 1;
    cmdMgr.execute(InsertCols(model, c1, count));
    sel.setActive(0, c1 + 1);
    sel.extendTo(model.rows - 1, c1 + count);
    bus.emit('selection.changed'); // cho phép auto-scroll
  });

  bus.registerAction('col.delete', ()=>{
    const {c0,c1} = sel.range;
    const backup = {
      values: Array.from({length:model.rows}, (_,r)=> model.data[r].slice(c0, c1+1)),
      colWidths: model.colWidths.slice(c0, c1+1),
      fmt: new Map(Array.from(model.fmt.entries()).filter(([k])=>{
        const [,c] = k.split(',').map(Number);
        return c>=c0 && c<=c1;
      }))
    };
    cmdMgr.execute(DeleteCols(model, c0, c1, backup));
  });

  // ===== Gán ID chuyến theo NGÀY (đã tách sang logic/assignTripId.js) =====
  bus.registerAction('tools.assignTripId', ()=>{
    assignTripId({ model, sel, renderer, cmdMgr });
  });
}
