// vehStateTracker.js — Theo dõi thời gian ở TRẠNG THÁI hiện tại cho từng xe (realtime)
// Tự lắng nghe sự kiện 'map:vehicles' mà map.js phát sau mỗi lần API refresh.
// Cách dùng: import { VehState } from './vehStateTracker.js';  rồi gọi VehState.get(v).mins

export const VehState = (() => {
  const LS = 'veh.stateSince.v1';
  const map = new Map(); // plateKey -> { code, since }

  const plateKey = (vOrPlate) => {
    if (!vOrPlate) return '';
    if (typeof vOrPlate === 'string') return vOrPlate.toUpperCase().replace(/[^A-Z0-9]/g,'');
    const s = vOrPlate.plateKey || vOrPlate.plate || vOrPlate.VehicleNo || vOrPlate.vehicleNo || '';
    return String(s).toUpperCase().replace(/[^A-Z0-9]/g,'');
  };

  // Chuẩn hoá code trạng thái (giữ đúng logic cũ)
  const codeOf = (v) => {
    const c = Number(v?.statusCode);
    if (Number.isFinite(c)) return c;
    const t = (v?.status?.text || v?.statusText || '').toLowerCase();
    if (t.includes('chạy')) return 0;
    if (t.includes('bật máy')) return 1;
    if (t.includes('không tắt')) return 10;
    if (t.includes('đỗ')) return 3;
    if (t.includes('dừng')) return 2;
    if (t.includes('quá tốc')) return 4;
    if (t.includes('mất tín')) return 5;
    if (t.includes('sos')) return 6;
    if (t.includes('lệch')) return 7;
    if (t.includes('vào khu')) return 8;
    if (t.includes('ra khỏi')) return 9;
    return Number(v?.speed) > 3 ? 0 : 2;
  };

  const parseTimeToMs = (t) => {
    if (typeof t === 'number') return t > 1e12 ? t : t*1000;
    if (typeof t === 'string') {
      const s = t.trim().replace(/\//g,'-');
      const m = s.match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
      if (m) { const [_,y,mo,d,h,mi,se] = m; return new Date(+y, +mo-1, +d, +h, +mi, +(se||0)).getTime(); }
      const ms = Date.parse(s); if (!Number.isNaN(ms)) return ms;
    }
    return Date.now();
  };

  const load = () => {
    try {
      const obj = JSON.parse(localStorage.getItem(LS) || '{}');
      for (const k in obj) {
        const v = obj[k];
        if (v && Number.isFinite(v.code) && Number.isFinite(v.since)) map.set(k, { code:+v.code, since:+v.since });
      }
    } catch {}
  };
  const save = () => {
    try {
      const obj = {}; map.forEach((v,k)=> obj[k]=v);
      localStorage.setItem(LS, JSON.stringify(obj));
    } catch {}
  };

  // ingest mỗi lần API về (map.js phát 'map:vehicles')
  const ingest = (list) => {
    const now = Date.now();
    (list||[]).forEach(v=>{
      const key = plateKey(v); if (!key) return;
      const code = codeOf(v);
      const cur  = map.get(key);
      if (!cur || cur.code !== code) {
        // nếu record có time, coi đó là mốc bắt đầu trạng thái; không thì dùng now
        const since = v?.time ? parseTimeToMs(v.time) : now;
        map.set(key, { code, since });
      }
    });
    save();
  };

  const get = (vOrPlate) => {
    const key = plateKey(vOrPlate);
    const rec = key ? map.get(key) : null;
    const since = rec?.since ?? null;
    const elapsed = since ? Math.max(0, Date.now() - since) : 0;
    return { code: rec?.code ?? null, since, elapsedMs: elapsed, mins: Math.floor(elapsed/60000) };
  };

  // tự hook vào sự kiện do map.js phát (bạn đã có sẵn)
  load();
  window.addEventListener('map:vehicles', (e)=> ingest(e?.detail || []));

  return { ingest, get, codeOf, plateKey };
})();
