// /src/monthly.js — ONE FILE ONLY
// Kiểm tra tồn tại (và có thể tạo) các file tháng: MM.YYYY/Luongchuyen.MM.YYYY.json, Luongthang.MM.YYYY.json
// KHÔNG sửa reader/main; chỉ dùng #monthDisplay + DATA_BASE_URL / SAVE_URL_BASE
// API public: window.Monthly.check(kind), .create(kind), .ensure(kind,{open,withFmt,headers}), .open(kind)

(function () {
  // ---- Config mặc định cho 2 loại ----
  const DEFAULTS = {
    luong: {
      prefix: "Luongthang", // Sửa: Luong → Luongthang
      headers: [
        "Mã NV",
        "Tên nhân viên",
        "Chức vụ",
        "BHXH",
        "LCB BHXH",
        "Lương TG",
        "TCa",
        "CN",
        "#1",
        "#2",
        "#3",
        "#4",
        "TC",
        "Ghép",
        "Tổng cộng",
        "Hiệu xuất",
        "Phụ cấp",
        "Thưởng",
        "Phạt",
        "Tổng Cộng",
        "Tạm ứng",
        "Thực lãnh",
        "Ghi chú",
      ],
    },
    chuyen: {
      prefix: "Luongchuyen", // Sửa: Chuyen → Luongchuyen
      headers: [
        "ID chuyến",
        "Ngày",
        "Mã NV",
        "Tên nhân viên",
        "Chức vụ",
        "Số xe",
        "Khách hàng",
        "Số lượng",
        "Ca",
        "#1",
        "#2",
        "#3",
        "#",
        "Note",
      ],
    },
  };

  // ---- Helpers ----
  function getSelectedMonth() {
    const el = document.getElementById("monthDisplay");
    const s = (el?.textContent || "").trim(); // "MM/YYYY"
    const m = s.match(/^(\d{2})\/(\d{4})$/);
    if (!m) throw new Error("Không đọc được tháng từ #monthDisplay (MM/YYYY).");
    return { MM: m[1], YYYY: m[2], label: s };
  }
  const baseRead = () =>
    (window.DATA_BASE_URL || "/filejson/").replace(/\/+$/, "/");
  const baseWrite = () =>
    (window.SAVE_URL_BASE || "/api/filejson/").replace(/\/+$/, "/");

  function buildUrls(kind) {
    const cfg = DEFAULTS[kind];
    if (!cfg) throw new Error("Loại không hỗ trợ: " + kind);
    const { MM, YYYY } = getSelectedMonth();
    // New format: MM.YYYY/Filename.MM.YYYY.json
    const monthDir = `${MM}.${YYYY}`;
    const name = `${cfg.prefix}.${MM}.${YYYY}.json`;
    return {
      readUrl: baseRead() + monthDir + "/" + name,
      writeUrl: baseWrite() + monthDir + "/" + name,
      name,
      monthDir,
    };
  }

  async function headOrGet(url) {
    try {
      const r = await fetch(url, {
        method: "HEAD",
        cache: "no-store",
        credentials: "same-origin",
      });
      if (r.ok) return true;
    } catch {}
    try {
      const r = await fetch(url, {
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
      });
      return r.ok;
    } catch {
      return false;
    }
  }
  async function putJson(url, body) {
    const r = await fetch(url, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        authorization: `Bearer ${
          window.SAVE_API_KEY || localStorage.getItem("accessToken") || ""
        }`,
      },
      body: JSON.stringify(body),
      cache: "no-store",
      credentials: "same-origin",
    });
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      throw new Error(`PUT ${url} → ${r.status} ${t}`);
    }
    return r.json().catch(() => ({}));
  }

  function makeEmpty(kind, opt) {
    const headers =
      opt && Array.isArray(opt.headers) && opt.headers.length
        ? opt.headers
        : DEFAULTS[kind].headers;
    const sheet = { headers, data: [] };
    if (opt?.withFmt) sheet.fmt = {};
    return sheet;
  }

  // ---- Core API ----
  async function check(kind) {
    const { readUrl, name } = buildUrls(kind);
    const exists = await headOrGet(readUrl);
    return { kind, name, exists, url: readUrl };
  }

  async function create(kind, opt = {}) {
    const { readUrl, writeUrl, name } = buildUrls(kind);
    const exists = await headOrGet(readUrl);
    if (exists && !opt.overwrite)
      return { kind, name, created: false, url: readUrl, note: "exists" };
    const payload = makeEmpty(kind, opt);
    await putJson(writeUrl, payload);
    return { kind, name, created: true, url: readUrl };
  }

  async function ensure(kind, opt = {}) {
    const { readUrl, writeUrl, name } = buildUrls(kind);
    const exists = await headOrGet(readUrl);
    if (!exists) {
      const payload = makeEmpty(kind, opt);
      await putJson(writeUrl, payload);
      if (opt.setStatus) opt.setStatus(`Đã tạo ${name}`);
      if (opt.open) open(kind).catch(() => {});
      return { kind, name, created: true, url: readUrl };
    }
    if (opt.setStatus) opt.setStatus(`Đã có ${name}`);
    if (opt.open) open(kind).catch(() => {});
    return { kind, name, created: false, url: readUrl };
  }

  async function open(kind) {
    // KHÔNG đụng logic cũ: chỉ thử mở nếu app có route `kind`
    if (window.__sheetApp?.switchTab) {
      const ok = window.__sheetApp.switchTab(kind);
      if (!ok) console.warn(`[Monthly] App chưa hỗ trợ tab "${kind}"`);
    } else {
      console.warn("[Monthly] __sheetApp.switchTab chưa sẵn sàng.");
    }
  }

  // ---- Expose ----
  window.Monthly = {
    check,
    create,
    ensure,
    open,
    kinds: Object.keys(DEFAULTS),
  };
})();
