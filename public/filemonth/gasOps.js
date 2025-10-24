// filemonth/gasOps.js — SMART UPDATE: Chỉ ghi khi có thay đổi thực sự

export function getGASUrl() {
  let url = window.GAS_URL || (window.CONFIG && window.CONFIG.GAS_URL) || "";
  return url ? String(url).split("#")[0].replace(/\?+$/, "").trim() : "";
}

export function needGASUrl(setStatus) {
  const u = getGASUrl();
  if (!u) {
    setStatus &&
      setStatus("Thiếu GAS_URL trong /config/config.js (không mở cửa sổ).");
    console.error("[DataOps] Missing window.GAS_URL");
  }
  return u;
}

// Helper: Map sheet names tiếng Việt có dấu về key chuẩn
function mapSheetNameToKey(sheetName) {
  const name = String(sheetName || "")
    .toLowerCase()
    .trim();

  if (name.includes("khách") && name.includes("hàng")) return "khachhang";
  if (name.includes("nhân") && name.includes("viên")) return "nhanvien";
  if (name.includes("phương") && name.includes("tiện")) return "phuongtien";

  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

export function normalizeFinal(obj) {
  const result = { khachhang: null, nhanvien: null, phuongtien: null };

  console.log("[normalizeFinal] Available keys:", Object.keys(obj || {}));

  Object.keys(obj || {}).forEach((sheetName) => {
    const key = mapSheetNameToKey(sheetName);
    console.log(`[normalizeFinal] Sheet "${sheetName}" → key "${key}"`);

    if (key && result.hasOwnProperty(key)) {
      const s = obj[sheetName] || {};
      const headers = Array.isArray(s.headers)
        ? s.headers
        : Array.isArray(s.header)
        ? s.header
        : [];
      const data = Array.isArray(s.data)
        ? s.data
        : Array.isArray(s.rows)
        ? s.rows
        : [];

      result[key] = { headers, data };
      console.log(
        `[normalizeFinal] Mapped "${sheetName}" → ${headers.length} headers, ${data.length} rows`
      );
    }
  });

  ["khachhang", "nhanvien", "phuongtien"].forEach((key) => {
    if (!result[key] && obj[key]) {
      const s = obj[key] || {};
      const headers = Array.isArray(s.headers)
        ? s.headers
        : Array.isArray(s.header)
        ? s.header
        : [];
      const data = Array.isArray(s.data)
        ? s.data
        : Array.isArray(s.rows)
        ? s.rows
        : [];
      result[key] = { headers, data };
      console.log(
        `[normalizeFinal] Direct key "${key}" → ${headers.length} headers, ${data.length} rows`
      );
    }
  });

  Object.keys(result).forEach((key) => {
    if (!result[key]) {
      result[key] = { headers: [], data: [] };
      console.warn(`[normalizeFinal] No data for "${key}" - using empty`);
    }
  });

  return result;
}

export async function loadFinalPack() {
  const base =
    (typeof window !== "undefined" && window.DATA_BASE_URL) || "/filejson/";
  const url =
    String(base).replace(/\/+$/, "/") + "final_data.json?_=" + Date.now();
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  const json = await res.json();
  return normalizeFinal(json);
}

// ===== SMART COMPARISON =====
function arraysEqual(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  return a.every((val, i) => val === b[i]);
}

function sheetsEqual(sheet1, sheet2) {
  if (!sheet1 || !sheet2) return false;

  // So sánh headers
  if (!arraysEqual(sheet1.headers, sheet2.headers)) {
    console.log("[sheetsEqual] Headers differ");
    return false;
  }

  // So sánh số lượng rows
  if (sheet1.data.length !== sheet2.data.length) {
    console.log(
      "[sheetsEqual] Row count differs:",
      sheet1.data.length,
      "vs",
      sheet2.data.length
    );
    return false;
  }

  // So sánh từng row
  for (let i = 0; i < sheet1.data.length; i++) {
    if (!arraysEqual(sheet1.data[i], sheet2.data[i])) {
      console.log("[sheetsEqual] Row", i, "differs");
      return false;
    }
  }

  return true;
}

function dataPacksEqual(pack1, pack2) {
  const keys = ["khachhang", "nhanvien", "phuongtien"];
  return keys.every((key) => sheetsEqual(pack1[key], pack2[key]));
}

// ===== SMART SAVE =====
export async function saveFinalPack(sheets) {
  console.log("[saveFinalPack] Input sheets:", {
    khachhang:
      sheets.khachhang?.headers?.length +
      " headers, " +
      sheets.khachhang?.data?.length +
      " rows",
    nhanvien:
      sheets.nhanvien?.headers?.length +
      " headers, " +
      sheets.nhanvien?.data?.length +
      " rows",
    phuongtien:
      sheets.phuongtien?.headers?.length +
      " headers, " +
      sheets.phuongtien?.data?.length +
      " rows",
  });

  const pack = {
    khachhang: {
      headers: sheets.khachhang?.headers || [],
      data: sheets.khachhang?.data || [],
    },
    nhanvien: {
      headers: sheets.nhanvien?.headers || [],
      data: sheets.nhanvien?.data || [],
    },
    phuongtien: {
      headers: sheets.phuongtien?.headers || [],
      data: sheets.phuongtien?.data || [],
    },
  };

  // Kiểm tra dữ liệu không rỗng
  const totalRows =
    pack.khachhang.data.length +
    pack.nhanvien.data.length +
    pack.phuongtien.data.length;
  if (totalRows === 0) {
    throw new Error(
      "Dữ liệu rỗng! Không thể save vì sẽ ghi đè mất dữ liệu hiện tại."
    );
  }

  console.log("[saveFinalPack] Saving pack:", {
    khachhang: pack.khachhang.data.length + " rows",
    nhanvien: pack.nhanvien.data.length + " rows",
    phuongtien: pack.phuongtien.data.length + " rows",
  });

  const base =
    (typeof window !== "undefined" && window.SAVE_URL_BASE) || "/api/filejson/";
  const url = String(base).replace(/\/+$/, "/") + "final_data.json";
  const res = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(pack, null, 2),
    cache: "no-store",
    credentials: "same-origin",
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${res.statusText} ${t}`);
  }

  return await res.json().catch(() => ({}));
}

// ===== SMART SYNC FROM GAS =====
export async function syncFinalFromGAS(setStatus) {
  const GAS = needGASUrl(setStatus);
  if (!GAS) return;

  try {
    setStatus && setStatus("Đang kiểm tra thay đổi từ Apps Script…");

    // 1) Load current local data
    let currentData;
    try {
      currentData = await loadFinalPack();
      console.log("[syncFinalFromGAS] Current local data loaded");
    } catch (err) {
      console.log("[syncFinalFromGAS] No local data, will force update");
      currentData = null;
    }

    // 2) Fetch new data from GAS
    setStatus && setStatus("Đang tải dữ liệu mới từ Apps Script…");
    const res = await fetch(`${GAS}?action=final`, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);

    const json = await res.json();
    console.log("[syncFinalFromGAS] GAS response:", json);

    const newData = normalizeFinal(json);
    console.log("[syncFinalFromGAS] Normalized new data:", newData);

    // 3) SMART COMPARISON
    if (currentData && dataPacksEqual(currentData, newData)) {
      console.log("[syncFinalFromGAS] No changes detected, skipping save");
      setStatus &&
        setStatus("Dữ liệu không thay đổi, không cần cập nhật.", true);
      return;
    }

    console.log("[syncFinalFromGAS] Changes detected, updating...");
    setStatus && setStatus("Phát hiện thay đổi, đang lưu…");

    // 4) Save only if different
    await saveFinalPack(newData);
    setStatus && setStatus("Đã cập nhật final_data.json từ Apps Script.", true);
    window.__sheetApp?.reloadFinal?.();
  } catch (err) {
    console.error("[syncFinalFromGAS] Error:", err);
    setStatus && setStatus("Lỗi đồng bộ final_data: " + err.message);
  }
}

// filemonth/gasOps.js
export async function buildMonthlyFilesViaGAS(setStatus, month = "") {
  const GAS = needGASUrl(setStatus);
  if (!GAS) return;

  try {
    setStatus && setStatus("Apps Script đang tạo file JSON tháng…");
    const url = `${GAS}?action=build${
      month ? `&month=${encodeURIComponent(month)}` : ""
    }`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);

    let out = {};
    try {
      out = await res.json();
    } catch (_) {}
    const m = out?.results?.monthly_files || out?.monthly_files || null;
    const sum = m
      ? `Tổng: ${m.total ?? "-"}, tạo mới: ${m.successful ?? "-"}, bỏ qua: ${
          m.skipped ?? "-"
        }, lỗi: ${
          Array.isArray(m.errors) ? m.errors.length : m.errorCount ?? "-"
        }`
      : "";
    setStatus && setStatus(`Đã tạo file JSON tháng trên server. ${sum}`, true);

    return out; // trả về để caller có thể quyết định reload
  } catch (err) {
    console.error(err);
    setStatus && setStatus("Lỗi tạo file tháng: " + err.message);
  }
}
