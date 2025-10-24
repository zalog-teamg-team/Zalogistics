// Command pattern + Undo/Redo
export class CommandManager{
  constructor(){
    this.undoStack = [];
    this.redoStack = [];
    this.onChanged = ()=>{}; // callback render
  }
  execute(cmd){
    cmd.do();
    this.undoStack.push(cmd);
    this.redoStack.length = 0;
    this.onChanged();
  }
  undo(){
    const cmd = this.undoStack.pop();
    if(!cmd) return;
    cmd.undo();
    this.redoStack.push(cmd);
    this.onChanged();
  }
  redo(){
    const cmd = this.redoStack.pop();
    if(!cmd) return;
    cmd.do();
    this.undoStack.push(cmd);
    this.onChanged();
  }
}

// Các lệnh
export const SetCells = (model, rng, before, after)=>({
  name:'set-cells',
  do: ()=> model.setRange(rng, after),
  undo: ()=> model.setRange(rng, before)
});

export const ClearCells = (model, rng, before)=>({
  name:'clear-cells',
  do: ()=> model.clearRange(rng),
  undo: ()=> model.setRange(rng, before)
});

export const FormatRange = (model, rng, patch, beforeFmt)=>({
  name:'format-range',
  do: ()=> model.setFormatRange(rng, patch),
  undo: ()=>{
    // restore before (clear rồi set)
    model.setFormatRange(rng, {bold:null, italic:null, underline:null, align:null, color:null, bg:null});
    beforeFmt.forEach((v,k)=> model.fmt.set(k,v));
  }
});

export const InsertRows = (model, at, count)=>({
  name:'insert-rows',
  do: ()=> model.insertRows(at, count),
  undo: ()=> model.deleteRows(at+1, at+count)
});

export const DeleteRows = (model, r0, r1, backup)=>({
  name:'delete-rows',
  do: ()=> model.deleteRows(r0, r1),
  undo: ()=>{
    // chèn lại
    const count = r1-r0+1;
    const at = r0-1;
    model.insertRows(at, count);
    for(let i=0;i<count;i++){
      model.data[r0+i] = backup.rows[i].slice();
    }
    model.rowHeights.splice(r0, count, ...backup.rowHeights);
    model.fmt = backup.fmt;
  }
});

export const InsertCols = (model, at, count)=>({
  name:'insert-cols',
  do: ()=> model.insertCols(at, count),
  undo: ()=> model.deleteCols(at+1, at+count)
});

export const DeleteCols = (model, c0, c1, backup)=>({
  name:'delete-cols',
  do: ()=> model.deleteCols(c0, c1),
  undo: ()=>{
    const count = c1-c0+1;
    const at = c0-1;
    model.insertCols(at, count);
    // restore values
    for(let r=0;r<model.rows;r++){
      for(let i=0;i<count;i++){
        model.data[r][c0+i] = backup.values[r][i] ?? "";
      }
    }
    model.colWidths.splice(c0, count, ...backup.colWidths);
    model.fmt = backup.fmt;
  }
});

export const ResizeCol = (model, c, before, after)=>({
  name:'resize-col',
  do: ()=> model.setColWidth(c, after),
  undo: ()=> model.setColWidth(c, before)
});
export const ResizeRow = (model, r, before, after)=>({
  name:'resize-row',
  do: ()=> model.setRowHeight(r, after),
  undo: ()=> model.setRowHeight(r, before)
});

export const FillDown = (model, rngTarget, srcRow) => {
  // snapshot trước khi thay (để undo)
  const beforeVals = model.getRange(rngTarget);
  const beforeFmt = new Map();
  for (let r = rngTarget.r0; r <= rngTarget.r1; r++) {
    for (let c = rngTarget.c0; c <= rngTarget.c1; c++) {
      const k = `${r},${c}`;
      const v = model.fmt.get(k);
      if (v) beforeFmt.set(k, { ...v });
    }
  }

  // lấy dữ liệu/định dạng của hàng nguồn theo từng cột
  const srcValsRow = model.getRange({ r0: srcRow, c0: rngTarget.c0, r1: srcRow, c1: rngTarget.c1 })[0] ?? [];
  const srcFmtByCol = {};
  for (let c = rngTarget.c0; c <= rngTarget.c1; c++) {
    const v = model.fmt.get(`${srcRow},${c}`);
    srcFmtByCol[c] = v ? { ...v } : null; // null = xoá fmt
  }

  const h = rngTarget.r1 - rngTarget.r0 + 1;
  const afterVals = Array.from({ length: h }, () => srcValsRow.slice());

  return {
    name: 'fill-down',
    do: () => {
      model.setRange(rngTarget, afterVals);
      for (let c = rngTarget.c0; c <= rngTarget.c1; c++) {
        const tpl = srcFmtByCol[c];
        for (let r = rngTarget.r0; r <= rngTarget.r1; r++) {
          const k = `${r},${c}`;
          if (tpl) model.fmt.set(k, { ...tpl }); else model.fmt.delete(k);
        }
      }
    },
    undo: () => {
      model.setRange(rngTarget, beforeVals);
      for (let r = rngTarget.r0; r <= rngTarget.r1; r++) {
        for (let c = rngTarget.c0; c <= rngTarget.c1; c++) {
          const k = `${r},${c}`;
          const prev = beforeFmt.get(k);
          if (prev) model.fmt.set(k, { ...prev }); else model.fmt.delete(k);
        }
      }
    }
  };
};


