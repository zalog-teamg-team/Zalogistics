// src/luong/luong.init.js
// Tạo/đồng bộ bảng Lương_MM_YYYY từ danh sách Nhân viên trong final_data.json.
// Lấy 3 cột: Mã NV, Tên nhân viên, Chức vụ -> cho 3 cột đầu của sheet Lương.
// Phần còn lại để trống để các bước sau tính (#1..#4, TC, CN, ...).

export function registerLuongInit({
  bus,
  store,
  reader,
  model,
  renderer,
  sel,
  setStatus,
} = {}) {
  if (!bus || !store || !reader || !model || !renderer || !sel) {
    throw new Error(
      "registerLuongInit: thiếu dependency (bus/store/reader/model/renderer/sel)"
    );
  }

  // ===== Utils =====
  const norm = (s) =>
    String(s ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\w\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function parseMonthFromUI() {
    const el = document.getElementById("monthDisplay"); // "MM/YYYY"
    const s = (el?.textContent || "").trim();
    const m = s.match(/^(\d{2})\/(\d{4})$/);
    if (!m) throw new Error("Không đọc được tháng (MM/YYYY) từ #monthDisplay.");
    return new Date(Number(m[2]), Number(m[1]) - 1, 1);
  }

  async function ensureLuongKey(date) {
    try {
      const tmp = await store.getOrFetch(reader, "luong", date);
      return tmp.key;
    } catch {
      const mm = String(date.getMonth() + 1).padStart(2, "0");
      const yy = date.getFullYear();
      return `luong:${mm}-${yy}`;
    }
  }

  // ===== Headers chuẩn của Lương (theo yêu cầu) =====
  const LUONG_HEADERS = [
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
  ];

  function emptyRow() {
    const r = new Array(LUONG_HEADERS.length);
    for (let i = 0; i < r.length; i++) r[i] = "";
    return r;
  }

  // ===== Lấy danh sách NV từ final_data.json =====
  async function loadNhanVienSheet() {
    const { sheets } = await reader.loadFinal();
    const nv = sheets?.nhanvien || {};
    const headers = nv.headers || nv.header || [];
    const rows = nv.data || nv.rows || [];

    // Tìm cột Mã NV / Tên nhân viên / Chức vụ (nhiều alias)
    const H = headers.map(norm);

    const iMa = findCol(H, ["mã nv", "ma nv", "ma_nv", "manv", "code", "id"]);
    const iTen = findCol(H, [
      "tên nhân viên",
      "ten nhan vien",
      "ho ten",
      "ho va ten",
      "ten",
    ]);
    const iCV = findCol(H, [
      "chức vụ",
      "chuc vu",
      "chuc_vu",
      "chuc danh",
      "chức danh",
      "role",
      "vi tri",
      "position",
    ]);

    if (iMa < 0 || iTen < 0 || iCV < 0) {
      throw new Error(
        'Nhân viên: thiếu cột "Mã NV" hoặc "Tên nhân viên" hoặc "Chức vụ".'
      );
    }
    return { rows, idx: { iMa, iTen, iCV } };
  }

  function findCol(Hnorm, aliases) {
    // exact first
    for (const a of aliases) {
      const i = Hnorm.findIndex((h) => h === norm(a));
      if (i >= 0) return i;
    }
    // contains fallback
    for (const a of aliases) {
      const i = Hnorm.findIndex((h) => h.includes(norm(a)));
      if (i >= 0) return i;
    }
    return -1;
  }

  // ===== Tạo/sync bảng Lương từ danh sách NV =====
  async function makeLuongFromNhanVien(
    date,
    { appendIfExists = false, autoSave = false } = {}
  ) {
    setStatus && setStatus("Đang đọc danh sách Nhân viên…");
    const { rows, idx } = await loadNhanVienSheet();

    // Chuẩn bị doc lương hiện tại (nếu có)
    let existing = null,
      key = await ensureLuongKey(date);
    try {
      const got = await store.getOrFetch(reader, "luong", date);
      existing = got?.doc || null;
      key = got?.key || key;
    } catch {}

    // Map mã NV đã có trong doc lương (để sync/append)
    let exHeader = existing?.header || existing?.headers || [];
    let exRows = existing?.rows || existing?.data || [];

    // Nếu chưa có doc lương hoặc appendIfExists=false => reset sạch
    if (!appendIfExists || !Array.isArray(exHeader) || exHeader.length === 0) {
      exHeader = LUONG_HEADERS.slice();
      exRows = [];
    } else {
      // Bảo đảm header đúng đủ cột (thêm cột thiếu về cuối)
      const need = LUONG_HEADERS.slice();
      for (const h of need)
        if (!exHeader.some((x) => norm(x) === norm(h))) exHeader.push(h);
      // nắn chiều dài mỗi dòng theo header hiện tại
      for (const r of exRows) while (r.length < exHeader.length) r.push("");
    }

    // Index cột đầu của exHeader
    const colMa = exHeader.findIndex((h) => norm(h) === norm("Mã NV"));
    const colTen = exHeader.findIndex((h) => norm(h) === norm("Tên nhân viên"));
    const colCV = exHeader.findIndex((h) => norm(h) === norm("Chức vụ"));
    const atLeast = (i) => (i >= 0 ? i : 0);

    // Map <maNVnorm, rowIndex> để cập nhật nếu có
    const exMap = new Map();
    for (let i = 0; i < exRows.length; i++) {
      const k = norm(exRows[i][atLeast(colMa)]);
      if (k) exMap.set(k, i);
    }

    // Duyệt danh sách NV -> đưa vào 3 cột đầu, giữ nguyên cột khác
    let added = 0,
      updated = 0;
    for (const nv of rows) {
      const ma = String(nv[idx.iMa] ?? "").trim();
      const ten = String(nv[idx.iTen] ?? "").trim();
      const cv = String(nv[idx.iCV] ?? "").trim();
      if (!ma && !ten) continue;

      const keyMa = norm(ma);
      if (exMap.has(keyMa)) {
        const i = exMap.get(keyMa);
        exRows[i][atLeast(colMa)] = ma;
        exRows[i][atLeast(colTen)] = ten;
        exRows[i][atLeast(colCV)] = cv;
        updated++;
      } else {
        const r = emptyRow();
        r[atLeast(colMa)] = ma;
        r[atLeast(colTen)] = ten;
        r[atLeast(colCV)] = cv;
        exRows.push(r);
        added++;
      }
    }

    // Ghi vào store & render
    const doc = {
      header: exHeader,
      rows: exRows,
      fmt: {},
      dirty: false,
      version: 0,
    };
    store.docs.set(key, doc);
    store.toModel(key, model, renderer);
    renderer.render();

    // Focus ô đầu tiên để thấy đã nhập
    try {
      sel.setActive(0, 0);
      bus.emit("selection.changed");
    } catch {}

    setStatus &&
      setStatus(
        `Lương: ${exRows.length} dòng • thêm ${added}, cập nhật ${updated}`
      );

    // (Tuỳ chọn) Lưu ra file JSON tháng
    if (autoSave) {
      try {
        await reader.save("luong", date, {
          headers: exHeader,
          data: exRows,
          fmt: {},
        });
        const mm = String(date.getMonth() + 1).padStart(2, "0");
        const yyyy = date.getFullYear();
        setStatus &&
          setStatus(`Đã lưu ${mm}.${yyyy}/Luongthang.${mm}.${yyyy}.json`);
      } catch (e) {
        console.warn("[Luong.init] Lưu thất bại:", e);
        setStatus && setStatus("Tạo bảng Lương xong (chưa lưu vì lỗi).");
      }
    }
  }

  // ===== Public actions =====
  async function run() {
    try {
      const date = parseMonthFromUI();
      await makeLuongFromNhanVien(date, {
        appendIfExists: false,
        autoSave: false,
      });
    } catch (e) {
      console.error("[Luong.init] Lỗi:", e);
      setStatus && setStatus("Lỗi tạo bảng Lương – xem console");
    }
  }

  bus.registerAction?.("luong.init", () => run());
  window.LuongCalc = Object.assign(window.LuongCalc || {}, {
    luongInit: () => run(),
  });
}
