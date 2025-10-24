// Chuẩn hóa & xử lý địa chỉ ô/miền theo A1
export const colToLabel = (n)=>{ // 0 -> A
  let s=""; n = Number(n);
  do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n/26) - 1; } while(n>=0);
  return s;
};
export const labelToCol = (label)=>{
  let s = label.toUpperCase(), n=0;
  for(let i=0;i<s.length;i++){ n = n*26 + (s.charCodeAt(i)-64); }
  return n-1;
};
export const toA1 = (r,c)=> `${colToLabel(c)}${r+1}`;

export const parseA1 = (a1)=>{
  const m = /^([A-Za-z]+)(\d+)(?::([A-Za-z]+)(\d+))?$/.exec(a1.trim());
  if(!m) throw new Error("A1 không hợp lệ");
  const c0 = labelToCol(m[1]), r0 = parseInt(m[2],10)-1;
  const c1 = m[3]? labelToCol(m[3]) : c0;
  const r1 = m[4]? parseInt(m[4],10)-1 : r0;
  return normalize({r0,c0,r1,c1});
};

export const normalize = ({r0,c0,r1,c1})=>({
  r0: Math.min(r0,r1),
  c0: Math.min(c0,c1),
  r1: Math.max(r0,r1),
  c1: Math.max(c0,c1),
});

export const clamp = (rng, rows, cols)=>({
  r0: Math.max(0, Math.min(rng.r0, rows-1)),
  c0: Math.max(0, Math.min(rng.c0, cols-1)),
  r1: Math.max(0, Math.min(rng.r1, rows-1)),
  c1: Math.max(0, Math.min(rng.c1, cols-1)),
});

export const forEachCell = (rng, fn)=>{
  for(let r=rng.r0; r<=rng.r1; r++){
    for(let c=rng.c0; c<=rng.c1; c++){
      fn(r,c);
    }
  }
};

export const sizeOf = (rng)=>({ rows: rng.r1-rng.r0+1, cols: rng.c1-rng.c0+1 });
export const isSingle = (rng)=> rng.r0===rng.r1 && rng.c0===rng.c1;
