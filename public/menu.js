// menu.js — Dropdown Tabs (full file)
// Giữ 3 mục cũ + thêm 5 mục mới:
//  - Lương (tháng)  → kind='luong'   (ensure + open)
//  - Chuyến (tháng) → kind='chuyen'  (ensure + open)
//  - 3 mục mở rộng (disabled)
//
// Không sửa logic cũ; chỉ gọi __sheetApp.switchTab(kind).
// Nếu có window.Monthly.ensure(kind,{open:false}) thì dùng để tạo file tháng trước khi mở.
(function () {
  // ====== Label chuẩn cho từng kind ======
  const LABELS = {
    logchuyen: 'Log chuyến',
    chamcong:  'Chấm công',
    congno:    'Công nợ',
    luong:     'Lương (tháng)',
    chuyen:    'Chuyến (tháng)',
    extra1:    '— Mở rộng 1',
    extra2:    '— Mở rộng 2',
    extra3:    '— Mở rộng 3',
  };

  // ====== Helpers DOM / Status ======
  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
  const statusEl = () => $('#status');
  const setStatus = (m) => { const el = statusEl(); if (el) el.textContent = m || ''; };

  // Cập nhật nhãn hiển thị ở góc trái
  function updateCurrentLabel(kind, fallbackLabel) {
    const label = LABELS[kind] || fallbackLabel || kind;
    const el = $('.current-tab');
    if (el) el.textContent = label;
    // cập nhật document.title nhẹ cho đồng bộ
    try {
      const monthLabel = ($('#monthDisplay')?.textContent || '').trim();
      document.title = `${label}${monthLabel ? ' - ' + monthLabel : ''}`;
    } catch(_) {}
  }

  // Đặt trạng thái active trong menu
  function updateMenuActive(panel, kind) {
    $$('.dropdown-item', panel).forEach(btn =>
      btn.classList.toggle('active', (btn.dataset.tab || '') === kind)
    );
  }

  // Bật/tắt dropdown
  function openMenu(trigger, panel) {
    panel?.classList.add('show');
    trigger?.setAttribute('aria-expanded', 'true');
  }
  function closeMenu(trigger, panel) {
    panel?.classList.remove('show');
    trigger?.setAttribute('aria-expanded', 'false');
  }
  function isOpen(panel) { return panel?.classList.contains('show'); }

  // Chuyển tab bằng API sẵn có (không đổi logic cũ)
  function switchTab(kind, label) {
    updateCurrentLabel(kind, label); // cập nhật ngay để tránh “lag”
    updateMenuActive($('.dropdown-content'), kind);

    const ok = typeof window.__sheetApp?.switchTab === 'function'
      ? !!window.__sheetApp.switchTab(kind)
      : false;

    if (!ok) {
      // Fallback (nếu có #tabs)
      const btn = $(`#tabs .tab[data-tab="${kind}"]`);
      if (btn) {
        $$('#tabs .tab').forEach(b=>{
          const act = b===btn;
          b.classList.toggle('active', act);
          b.setAttribute('aria-selected', act ? 'true':'false');
        });
        btn.click(); // main.js lắng nghe click
      }
    }
  }

  // Đảm bảo file tháng rồi mở (nếu có Monthly.ensure)
  async function ensureAndOpen(kind, label) {
    try {
      if (window.Monthly?.ensure) {
        await window.Monthly.ensure(kind, { open: false, setStatus });
      }
      switchTab(kind, label);
    } catch (err) {
      console.error(err);
      setStatus(`Lỗi mở ${label.toLowerCase()}: ${err.message || err}`);
    }
  }

  // Thêm các item mới nếu chưa có
  function ensureExtraItems(panel) {
    if (!panel) return;

    const get = (k) => panel.querySelector(`.dropdown-item[data-tab="${k}"]`);
    const addItem = (k, text, opts={}) => {
      if (get(k)) return;
      const b = document.createElement('button');
      b.className = 'dropdown-item';
      b.dataset.tab = k;
      b.textContent = text;
      if (opts.title)   b.title = opts.title;
      if (opts.disabled) b.disabled = true;
      panel.appendChild(b);
    };

    // 2 mục hoạt động
    addItem('luong',  LABELS.luong,  { title: 'Mở Lương tháng (tạo nếu thiếu)' });
    addItem('chuyen', LABELS.chuyen, { title: 'Mở Chuyến tháng (tạo nếu thiếu)' });

    // Ngăn cách
    if (!panel.querySelector('hr.sep')) {
      const hr = document.createElement('hr');
      hr.className = 'sep';
      panel.appendChild(hr);
    }

    // 3 mục mở rộng (disabled)
    addItem('extra1', LABELS.extra1, { disabled: true, title: 'Sắp có' });
    addItem('extra2', LABELS.extra2, { disabled: true, title: 'Sắp có' });
    addItem('extra3', LABELS.extra3, { disabled: true, title: 'Sắp có' });
  }

  // ====== Init ======
  document.addEventListener('DOMContentLoaded', () => {
    // Cấu trúc menu:
    // <div class="menu-dropdown">
    //   <button class="menu-trigger">☰</button>
    //   <div class="dropdown-content">
    //     <button class="dropdown-item active" data-tab="logchuyen">Log chuyến</button>
    //     <button class="dropdown-item" data-tab="chamcong">Chấm công</button>
    //     <button class="dropdown-item" data-tab="congno">Công nợ</button>
    //     <!-- sẽ được thêm 5 mục mới ở cuối -->
    //   </div>
    // </div>

    const root    = $('.menu-dropdown') || $('.dropdown');
    if (!root) return;

    const trigger = $('.menu-trigger', root) || $('[data-role="menu-trigger"]', root) || $('button', root);
    const panel   = $('.dropdown-content', root) || $('.dropdown-content');

    // Thêm 5 mục mới
    ensureExtraItems(panel);

    // Toggle
    trigger?.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      if (!panel) return;
      isOpen(panel) ? closeMenu(trigger, panel) : openMenu(trigger, panel);
    });

    // Click item
    panel?.addEventListener('pointerdown', (e) => {
      const it = e.target.closest('.dropdown-item');
      if (!it) return;
      e.preventDefault();

      if (it.hasAttribute('disabled')) return;

      const kind  = it.dataset.tab || '';
      const label = it.textContent?.trim() || LABELS[kind] || kind;
      closeMenu(trigger, panel);

      // 2 mục mới: ensure + open
      if (kind === 'luong' || kind === 'chuyen') {
        ensureAndOpen(kind, label);
        return;
      }

      // 3 mục cũ: giữ nguyên hành vi (chỉ chuyển tab)
      if (kind) switchTab(kind, label);
    });

    // Đóng khi click ra ngoài / ESC
    document.addEventListener('click', (e) => {
      if (!panel) return;
      const inMenu = root.contains(e.target);
      if (!inMenu && isOpen(panel)) closeMenu(trigger, panel);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isOpen(panel)) closeMenu(trigger, panel);
    });

    // A11y: điều hướng phím
    panel?.addEventListener('keydown', (e) => {
      const items = $$('.dropdown-item', panel).filter(x => !x.disabled);
      if (!items.length) return;
      const i = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); items[(i+1+items.length)%items.length]?.focus(); }
      if (e.key === 'ArrowUp')   { e.preventDefault(); items[(i-1+items.length)%items.length]?.focus(); }
      if (e.key === 'Enter')     { e.preventDefault(); document.activeElement?.dispatchEvent(new PointerEvent('pointerdown', { bubbles:true })); }
    });

    // ARIA
    trigger?.setAttribute('aria-haspopup','true');
    trigger?.setAttribute('aria-expanded','false');
    $$('.dropdown-item', panel).forEach(el => { el.setAttribute('role','menuitem'); el.setAttribute('tabindex','0'); });

    // Đồng bộ nhãn ban đầu theo tab đang active (nếu có)
    const active = $('.dropdown-item.active', panel);
    if (active) updateCurrentLabel(active.dataset.tab || 'chamcong', active.textContent?.trim());
  });
})();
