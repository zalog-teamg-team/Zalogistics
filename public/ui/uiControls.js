// ui/uiControls.js — Nhóm “hàm nhẹ UI”: Zoom, Format controls, Left Dock, Ctrl+S, Toolbar dropdowns
export function initUIControls({ bus, app, saveCurrent, ids = {} } = {}) {
  const $ = (k, defId) => document.getElementById(ids[k] || defId);

  // elements
  const leftDock    = $('leftDock','leftDock');
  const alignSel    = $('align','alignSelect');
  const textColor   = $('textColor','textColor');
  const fillColor   = $('fillColor','fillColor');
  const fontFamily  = $('fontFamily','fontFamily');
  const fontSize    = $('fontSize','fontSize');
  const zoomInput   = $('zoom','zoomPct');

  // NEW: toolbar dropdowns
  const formatMenu  = $('formatMenu','formatMenu'); // "Định dạng ▾"
  const editMenu    = $('editMenu','editMenu');     // "Chỉnh sửa ▾"

  // ===== ZOOM (%): áp dụng trong #sheet qua CSS var --grid-zoom
  function applyZoom(pct){
    let z = Number(pct); if (!Number.isFinite(z)) z = 100;
    z = Math.max(50, Math.min(200, z));
    app?.style?.setProperty('--grid-zoom', String(z/100));
    if (zoomInput && zoomInput.value !== String(z)) zoomInput.value = String(z);
    try{ localStorage.setItem('gridZoom', String(z)); }catch{}
  }
  if (zoomInput){
    zoomInput.addEventListener('input', (e)=> applyZoom(e.target.value));
    applyZoom((typeof localStorage!=='undefined' && localStorage.getItem('gridZoom')) || 100);
  }

  // ===== Left dock: forward actions
  leftDock?.addEventListener('click', (e)=>{
    const btn = e.target.closest('button'); if(!btn) return;
    const act = btn.dataset.action; if(!act) return;
    bus.act?.('edit.commit');
    bus.emit?.('ui.dismiss');
    try{ bus.act(act); }catch(err){ console.warn('Action not registered:', act, err); }
  });

  // ===== Format controls trên toolbar
  alignSel  ?.addEventListener('change', (e)=> bus.act('format.align', { align: e.target.value }));
  textColor ?.addEventListener('input',  (e)=> bus.act('format.color', { color: e.target.value }));
  fillColor ?.addEventListener('input',  (e)=> bus.act('format.fill',  { bg:    e.target.value }));

  fontFamily?.addEventListener('change', (e)=>{
    const v = String(e.target.value || '').trim();
    bus.act('format.font', { font: v || null });
  });
  fontSize  ?.addEventListener('change', (e)=>{
    const v = String(e.target.value || '').trim();
    const n = v ? Number(v) : NaN;
    bus.act('format.fontSize', { size: Number.isFinite(n) ? n : null });
  });

  // ===== NEW: Nối dropdown -> action (giống hành vi click nút)
  function bindActionSelect(sel){
    if(!sel) return;
    sel.addEventListener('change', ()=>{
      const act = sel.value;
      if (!act) return;
      bus.act?.('edit.commit');    // commit ô đang edit, nếu có
      bus.emit?.('ui.dismiss');    // đóng context/suggest nếu đang mở
      try{ bus.act(act); }         // gọi action đã đăng ký trong actions/actions.js
      catch(err){ console.warn('Action not registered:', act, err); }
      sel.selectedIndex = 0;       // trả menu về option tiêu đề
    });
  }
  bindActionSelect(formatMenu);
  bindActionSelect(editMenu);

  // ===== Ctrl+S: Save
  if (typeof window !== 'undefined' && typeof saveCurrent === 'function'){
    window.addEventListener('keydown', (e)=>{
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's'){
        e.preventDefault(); saveCurrent();
      }
    });
  }
}
