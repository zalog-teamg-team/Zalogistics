// chamcong.js — gắn UI + toast 4s theo dõi #loadStatus
(function () {
  'use strict';

  // ========== Toast ==========
  function getToastRoot() {
    var root = document.getElementById('toastStack');
    if (!root) {
      root = document.createElement('div');
      root.id = 'toastStack';
      root.className = 'toast-stack';
      document.body.appendChild(root);
    }
    return root;
  }

  function showToast(message, level, ms) {
    level = level || 'info';
    ms = typeof ms === 'number' ? ms : 4000;

    var root = getToastRoot();
    var el = document.createElement('div');
    el.className = 'toast ' + (level === 'success' ? 'success' : level === 'error' ? 'error' : 'info');
    el.textContent = message;
    root.appendChild(el);

    setTimeout(function () {
      el.style.animation = 'toast-out .18s ease-in forwards';
      setTimeout(function(){ el.remove(); }, 220);
    }, ms);
  }
  window.showToast = showToast;

  // Quan sát #loadStatus để tự bật toast mỗi khi có thay đổi
  function observeHeaderStatus() {
    var el = document.getElementById('loadStatus');
    if (!el) return;

    var lastMsg = '';
    var obs = new MutationObserver(function () {
      var msg = (el.textContent || '').trim();
      if (!msg || msg === lastMsg) return;
      lastMsg = msg;

      var level = 'info';
      if (el.classList.contains('ok'))   level = 'success';
      else if (el.classList.contains('warn')) level = 'error';

      // Nếu muốn bỏ toast cho trạng thái "Đang ..."
      // if (/^Đang\s/i.test(msg)) return;

      showToast(msg, level, 4000);
    });

    obs.observe(el, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  }

  // ========== Gắn sự kiện UI ==========
  function ready(fn){
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
    else fn();
  }

  function bind(){
    var btnIn  = document.getElementById('btnIn');
    var btnOut = document.getElementById('btnOut');

    if (btnIn)  btnIn.onclick  = function(){ window.submitAttendance && window.submitAttendance('checkin'); };
    if (btnOut) btnOut.onclick = function(){ window.submitAttendance && window.submitAttendance('checkout'); };

    if (!window.refreshLocation) {
      window.refreshLocation = function(){ console.warn('[chamcong] refreshLocation: data.js chưa sẵn sàng'); };
    }

    // Khởi tạo luồng chấm công + bật quan sát trạng thái
    if (window.initChamCong) window.initChamCong();
    observeHeaderStatus();

    console.log('[chamcong] ready + toast');
  }

  ready(bind);
})();
