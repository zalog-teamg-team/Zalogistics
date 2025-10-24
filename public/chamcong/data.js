// data.js — NO FALLBACK, datalist cho cả Mã NV & Số xe
// - Gợi ý chỉ từ final_data.json -> API_URLS.finalData() + API_HEADERS()  (config.js)  ← SSOT
// - HTML khớp index2.html: có <input id="maNV" list="dsMaNV"> và <input id="soXe" list="dsSoXe">  ← datalist
// - chamcong.js gọi initChamCong() & submitAttendance() sau DOM ready

(function () {
  "use strict";

  // ================= Utils =================
  const $ = (id) => document.getElementById(id);
  const pad = (n) => String(n).padStart(2, "0");
  const norm = (s) =>
    String(s || "")
      .trim()
      .normalize("NFD")
      .replace(/\p{Diacritic}+/gu, "")
      .toLowerCase();

  function showStatus(msg, level = "info") {
    const el = $("loadStatus"); // dòng thông báo
    if (!el) return;
    el.textContent = msg;
    el.classList.remove("ok", "warn");
    if (level === "success") el.classList.add("ok");
    else if (level === "error") el.classList.add("warn");
  }

  function nowLocalISO() {
    const d = new Date(),
      t = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return t.toISOString().slice(0, 19); // YYYY-MM-DDTHH:mm:ss
  }
  function toYMD(v) {
    const s = String(v || "").trim();
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return m[0];
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
    return s.slice(0, 10);
  }

  // ================= Chuẩn cột =================
  const STD_HEADERS = [
    "Ngày",
    "Mã NV",
    "Tên nhân viên",
    "Ca",
    "Số xe",
    "Chức vụ",
    "Giờ vào",
    "Giờ ra",
    "Ghi chú",
    "Vị trí",
    "#",
  ];

  function keyOf(label) {
    const k = norm(label);
    if (k.includes("ngay")) return "ngay";
    if (
      k === "ma nv" ||
      (k.includes("ma") &&
        (k.includes("nv") ||
          k.includes("nhan") ||
          k.includes("emp") ||
          k.includes("staff")))
    )
      return "ma";
    if (k.includes("ten") || k.includes("name")) return "ten";
    if (k === "ca" || k.includes("shift")) return "ca";
    if (
      k.includes("so xe") ||
      k.includes("bien so") ||
      k.includes("license") ||
      k.includes("vehicle") ||
      k.includes("bsx")
    )
      return "soxe";
    if (
      k.includes("chuc vu") ||
      k.includes("position") ||
      k.includes("job title")
    )
      return "chuc";
    if (
      k.includes("gio vao") ||
      k.includes("checkin") ||
      k === "in" ||
      k.includes("bat dau")
    )
      return "vao";
    if (
      k.includes("gio ra") ||
      k.includes("checkout") ||
      k === "out" ||
      k.includes("ket thuc")
    )
      return "ra";
    if (k.includes("ghi chu") || k === "note") return "ghichu";
    if (
      k.includes("vi tri") ||
      k.includes("location") ||
      k.includes("gps") ||
      k.includes("lat")
    )
      return "vitri";
    if (k === "#" || k === "hash") return "sharp";
    return k;
  }
  function headerIndexMap(headers) {
    const H = (headers || []).map((h) => norm(h));
    const map = {
      ngay: -1,
      ma: -1,
      ten: -1,
      ca: -1,
      soxe: -1,
      chuc: -1,
      vao: -1,
      ra: -1,
      ghichu: -1,
      vitri: -1,
      sharp: -1,
    };
    for (let i = 0; i < H.length; i++) {
      const k = keyOf(H[i]);
      if (k in map && map[k] < 0) map[k] = i;
    }
    return map;
  }
  function ensureStdColumns(headers) {
    const have = headerIndexMap(headers);
    STD_HEADERS.forEach((h) => {
      if (have[keyOf(h)] < 0) headers.push(h);
    });
  }
  function padRows(rows, len) {
    for (const r of rows) {
      if (r.length < len) {
        r.length = len;
        for (let i = 0; i < len; i++)
          if (typeof r[i] === "undefined") r[i] = "";
      }
    }
  }

  // ================= Endpoints from config.js =================
  function monthFileName() {
    const m = window.currentMonth || new Date().getMonth() + 1;
    const y = window.currentYear || new Date().getFullYear();
    return `Chamcong_${pad(m)}_${y}.json`;
  }
  const readUrl = (f) =>
    window.API_URLS ? window.API_URLS.readUrl(f) : "/filejson/" + f;
  const writeUrl = (f) =>
    window.API_URLS ? window.API_URLS.writeUrl(f) : "/api/filejson/" + f;
  const finalData = () =>
    window.API_URLS ? window.API_URLS.finalData() : "/filejson/final_data.json";
  const apiHeaders = () =>
    typeof window.API_HEADERS === "function"
      ? window.API_HEADERS()
      : { "Content-Type": "application/json;charset=UTF-8" };

  // ================= IO tháng =================
  async function readMonthFile() {
    try {
      const res = await fetch(readUrl(monthFileName()), { cache: "no-cache" });
      if (!res.ok) throw 0;
      const obj = await res.json();
      const headers = Array.isArray(obj?.headers)
        ? obj.headers.slice()
        : Array.isArray(obj?.[0])
        ? obj[0].slice()
        : STD_HEADERS.slice();
      const data = Array.isArray(obj?.data)
        ? obj.data.slice()
        : Array.isArray(obj?.[0])
        ? obj.slice(1)
        : [];
      return { headers, data };
    } catch {
      return { headers: STD_HEADERS.slice(), data: [] };
    }
  }
  async function writeMonthFile(ds) {
    const body = JSON.stringify(
      { headers: ds.headers, data: ds.data },
      null,
      2
    );
    const res = await fetch(writeUrl(monthFileName()), {
      method: "PUT",
      headers: apiHeaders(),
      body,
    });
    if (!res.ok) throw new Error("WRITE_FAIL_" + res.status);
    return true;
  }

  // ================= GEO =================
  let lastCoords = null;
  async function refreshLocation() {
    if (!("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        lastCoords = {
          lat: +pos.coords.latitude.toFixed(6),
          lng: +pos.coords.longitude.toFixed(6),
          accuracy: pos.coords.accuracy,
        };
        const el = $("locationStatus");
        if (el)
          el.textContent = `GPS sẵn sàng (±${Math.round(
            pos.coords.accuracy
          )}m)`;
      },
      (err) => {
        const el = $("locationStatus");
        if (el) el.textContent = "Không lấy được vị trí";
        console.warn("[geo]", err?.message || err);
      },
      { enableHighAccuracy: true, maximumAge: 30000, timeout: 10000 }
    );
  }
  window.refreshLocation = refreshLocation;

  // ================= Build payload/row =================
  function getFormPayload(kind) {
    const iso = nowLocalISO();
    const ymd = iso.slice(0, 10);
    const hms = iso.slice(11, 19);
    const clean = (s) =>
      String(s || "")
        .replace(/\s+/g, " ")
        .trim();
    const p = {
      ngay: `${ymd} ${hms}`,
      ngayYMD: ymd,
      maNV: clean($("maNV")?.value),
      tenNV: clean($("tenNV")?.value),
      ca: clean($("ca")?.value),
      soXe: clean($("soXe")?.value),
      chucVu: clean($("chucVu")?.value),
      hash: clean($("hash")?.value),
      ghiChu: clean($("ghiChu")?.value),
      gioVao: kind === "in" ? hms : "",
      gioRa: kind === "out" ? hms : "",
      viTri: "",
    };
    if (lastCoords) {
      const acc =
        lastCoords.accuracy != null
          ? ` (±${Math.round(lastCoords.accuracy)}m)`
          : "";
      p.viTri = `${lastCoords.lat},${lastCoords.lng}${acc}`;
    }
    return p;
  }

  function buildRowByMap(headers, p) {
    ensureStdColumns(headers);
    const I = headerIndexMap(headers);
    const row = new Array(headers.length).fill("");
    if (I.ngay >= 0) row[I.ngay] = p.ngay;
    if (I.ma >= 0) row[I.ma] = p.maNV;
    if (I.ten >= 0) row[I.ten] = p.tenNV;
    if (I.ca >= 0) row[I.ca] = p.ca;
    if (I.soxe >= 0) row[I.soxe] = p.soXe;
    if (I.chuc >= 0) row[I.chuc] = p.chucVu;
    if (I.vao >= 0) row[I.vao] = p.gioVao;
    if (I.ra >= 0) row[I.ra] = p.gioRa;
    if (I.ghichu >= 0) row[I.ghichu] = p.ghiChu;
    if (I.vitri >= 0) row[I.vitri] = p.viTri;
    if (I.sharp >= 0) row[I.sharp] = p.hash;
    return row;
  }

  // ================= Strict match cho Check-out =================
  function makeStrictMatcher(headers, p) {
    const I = headerIndexMap(headers);
    const nameN = norm(p.tenNV);
    return function (r) {
      if (!r) return false;
      if (I.ngay >= 0 && toYMD(r[I.ngay]) !== p.ngayYMD) return false;
      if (I.ma >= 0 && String(r[I.ma] || "").trim() !== p.maNV) return false;
      if (I.ten >= 0 && norm(r[I.ten]) !== nameN) return false;
      if (I.ca >= 0 && String(r[I.ca] || "").trim() !== p.ca) return false;
      if (I.soxe >= 0 && String(r[I.soxe] || "").trim() !== p.soXe)
        return false;
      if (I.chuc >= 0 && String(r[I.chuc] || "").trim() !== p.chucVu)
        return false;
      if (I.sharp >= 0 && String(r[I.sharp] || "").trim() !== p.hash)
        return false;
      if (I.ra >= 0 && String(r[I.ra] || "").trim()) return false; // đã có giờ ra
      if (I.vao >= 0 && !String(r[I.vao] || "").trim()) return false; // chưa có giờ vào
      return true;
    };
  }

  // ================= Recent-by-MãNV =================
  const RECENT_NS = "cc:recentByMaNV:datalist";
  function _recent() {
    try {
      return JSON.parse(localStorage.getItem(RECENT_NS) || "{}") || {};
    } catch {
      return {};
    }
  }
  function saveRecentForMa(ma, st) {
    if (!ma) return;
    const m = _recent();
    m[ma] = Object.assign({}, m[ma] || {}, st, { at: Date.now() });
    localStorage.setItem(RECENT_NS, JSON.stringify(m));
  }
  function loadRecentForMa(ma) {
    const m = _recent();
    return m[ma] || null;
  }

  // ================= Check-in / Check-out =================
  async function doCheckIn() {
    const p = getFormPayload("in");
    if (!p.maNV) {
      alert("Nhập Mã NV");
      $("maNV")?.focus();
      return;
    }
    if (!p.tenNV) {
      alert("Nhập Họ tên");
      $("tenNV")?.focus();
      return;
    }
    if (!p.ca) {
      alert("Chọn Ca");
      $("ca")?.focus();
      return;
    }

    const ds = await readMonthFile();
    ensureStdColumns(ds.headers);
    padRows(ds.data, ds.headers.length);

    ds.data.push(buildRowByMap(ds.headers, p));
    await writeMonthFile(ds);

    saveRecentForMa(p.maNV, {
      soXe: p.soXe,
      ca: p.ca,
      hash: p.hash,
      chucVu: p.chucVu,
    });

    showStatus("Check-in thành công", "success");
    // Không clear form để tiện Check-out
  }

  async function doCheckOut() {
    const p = getFormPayload("out");
    if (!p.maNV) {
      alert("Nhập Mã NV");
      $("maNV")?.focus();
      return;
    }
    if (!p.tenNV) {
      alert("Nhập Họ tên");
      $("tenNV")?.focus();
      return;
    }
    if (!p.ca) {
      alert("Chọn Ca");
      $("ca")?.focus();
      return;
    }

    const ds = await readMonthFile();
    ensureStdColumns(ds.headers);
    padRows(ds.data, ds.headers.length);

    const I = headerIndexMap(ds.headers);
    const match = makeStrictMatcher(ds.headers, p);

    let found = -1;
    for (let i = ds.data.length - 1; i >= 0; i--) {
      if (match(ds.data[i])) {
        found = i;
        break;
      }
    }
    if (found < 0) {
      showStatus(
        "Không tìm thấy dòng check-in khớp 100% để ghi Giờ ra.",
        "error"
      );
      return;
    }

    if (I.ra >= 0) ds.data[found][I.ra] = p.gioRa;
    await writeMonthFile(ds);

    clearForm(); // clear sau khi Check-out thành công
    showStatus("Check-out thành công", "success");
  }

  async function submitAttendance(type) {
    try {
      showStatus(
        type === "checkin" ? "Đang check-in…" : "Đang check-out…",
        "info"
      );
      if (type === "checkin") await doCheckIn();
      else await doCheckOut();
    } catch (e) {
      console.error(e);
      showStatus("Lỗi ghi dữ liệu", "error");
    }
  }
  window.submitAttendance = submitAttendance; // chamcong.js sẽ gọi  :contentReference[oaicite:1]{index=1}

  // ================= Gợi ý (NO FALLBACK) =================
  const MA_INFO = new Map(); // ma -> {ten, chucVu, soXe}
  let TEN_SET = new Set();

  function populateDatalist(id, items /* [{value,label?}] */) {
    const dl = $(id);
    if (!dl) return;
    dl.innerHTML = items
      .map(
        (o) =>
          `<option value="${o.value}"${
            o.label ? ` label="${o.label}"` : ""
          }></option>`
      )
      .join("");
  }

  function setControlValue(id, value, force = true) {
    const el = $(id);
    if (!el) return;
    if (force || !el.value) el.value = value || "";
  }

  function fillFromMaNV({ force = true } = {}) {
    const ma = ($("maNV")?.value || "").trim();
    const info = MA_INFO.get(ma);
    if (!info) return;
    setControlValue("tenNV", info.ten, force);
    setControlValue("chucVu", info.chucVu, force);
    setControlValue("soXe", info.soXe, force);

    // rót lại Ca/# gần nhất nếu đang trống
    const r = loadRecentForMa(ma);
    if (r) {
      if ($("ca") && !$("ca").value) $("ca").value = r.ca || "";
      if ($("hash") && !$("hash").value) $("hash").value = r.hash || "";
    }
  }

  function attachAutoFill() {
    const maEl = $("maNV");
    if (!maEl) return;
    ["input", "change", "blur"].forEach((ev) =>
      maEl.addEventListener(ev, () => fillFromMaNV({ force: true }))
    );

    // hint tên
    const hintEl = $("tenStatus");
    const tenEl = $("tenNV");
    if (hintEl && tenEl) {
      tenEl.addEventListener("input", () => {
        const t = tenEl.value.trim();
        if (!t) {
          hintEl.textContent = "";
          return;
        }
        const ok = TEN_SET.has(norm(t));
        hintEl.textContent = ok
          ? "Tên tồn tại trong danh sách."
          : "Tên chưa khớp dữ liệu.";
        hintEl.classList.toggle("success", ok);
        hintEl.classList.toggle("error", !ok);
      });
    }
  }

  async function loadOptions() {
    showStatus("Đang tải danh sách nhân viên/xe…", "info");

    // 1) tải SSOT final_data.json
    const res = await fetch(finalData(), {
      cache: "no-cache",
      headers: apiHeaders(),
    });
    if (!res.ok) {
      showStatus("Không tải được final_data.json", "error");
      return;
    }
    const payload = await res.json();

    // 2) tách sheet nhân viên & phương tiện (nếu có)
    const takeSheet = (obj, names) => {
      if (!obj) return null;
      for (const k of names) {
        if (obj[k]) return obj[k];
      }
      if (Array.isArray(obj.sheets)) {
        const hit = obj.sheets.find((s) =>
          names.some((n) => norm(s?.name) === norm(n))
        );
        if (hit) return hit;
      }
      return null;
    };
    const nvSheet = takeSheet(payload, [
      "nhanvien",
      "Nhanvien",
      "Nhân viên",
      "employees",
    ]);
    const xeSheet = takeSheet(payload, [
      "phuongtien",
      "Phuongtien",
      "Phương tiện",
      "vehicles",
    ]);

    const extractHeaderRows = (sheet) => {
      if (!sheet) return { header: null, rows: null };
      let header = sheet.headers || sheet.header;
      let rows = sheet.data || sheet.rows;
      if (!header && Array.isArray(sheet) && sheet.length) {
        header = sheet[0];
        rows = sheet.slice(1);
      }
      return { header, rows };
    };

    const { header: Hnv, rows: Rnv } = extractHeaderRows(nvSheet);
    const { header: Hxe, rows: Rxe } = extractHeaderRows(xeSheet);

    const XE = new Set();

    // 3) Seed từ Nhân viên
    if (Array.isArray(Hnv) && Array.isArray(Rnv)) {
      const H = Hnv.map((h) => norm(h));
      const find = (names, fuzzy) => {
        for (let i = 0; i < H.length; i++) {
          for (const n of names) {
            const k = norm(n);
            if (H[i] === k || H[i].includes(k)) return i;
          }
        }
        if (fuzzy === "ma") {
          for (let i = 0; i < H.length; i++) {
            const h = H[i];
            if (
              h.includes("ma") &&
              (h.includes("nv") ||
                h.includes("nhan") ||
                h.includes("emp") ||
                h.includes("staff") ||
                h.includes("code"))
            )
              return i;
          }
        }
        if (fuzzy === "ten") {
          for (let i = 0; i < H.length; i++) {
            const h = H[i];
            if (h.includes("ten") || h.includes("name")) return i;
          }
        }
        return -1;
      };
      const iMa = find(
        [
          "Mã NV",
          "ma nv",
          "manv",
          "msnv",
          "employee id",
          "emp id",
          "staff id",
          "code",
        ],
        "ma"
      );
      const iTen = find(
        [
          "Tên nhân viên",
          "ten nhan vien",
          "ten nv",
          "ho ten",
          "name",
          "full name",
          "employee name",
        ],
        "ten"
      );
      const iCV = find(["Chức vụ", "chuc vu", "position", "job title"]);
      const iXe = find([
        "Số xe",
        "so xe",
        "bien so",
        "license",
        "vehicle number",
        "bsx",
      ]);

      for (const r of Rnv) {
        if (!Array.isArray(r)) continue;
        const ma = iMa >= 0 ? String(r[iMa] || "").trim() : "";
        if (!ma) continue;
        const ten = iTen >= 0 ? String(r[iTen] || "").trim() : "";
        const cv = iCV >= 0 ? String(r[iCV] || "").trim() : "";
        const xe = iXe >= 0 ? String(r[iXe] || "").trim() : "";

        const prev = MA_INFO.get(ma) || {};
        MA_INFO.set(ma, {
          ten: ten || prev.ten || "",
          chucVu: cv || prev.chucVu || "",
          soXe: xe || prev.soXe || "",
        });
        if (xe) XE.add(xe);
      }
    }

    // 4) Seed từ Phương tiện/vehicles (nếu có)
    if (Array.isArray(Hxe) && Array.isArray(Rxe)) {
      const H = Hxe.map((h) => norm(h));
      const iXe = (() => {
        for (let i = 0; i < H.length; i++) {
          const h = H[i];
          if (
            h.includes("so xe") ||
            h.includes("bien so") ||
            h.includes("license") ||
            h.includes("vehicle") ||
            h.includes("bsx")
          )
            return i;
        }
        return -1;
      })();
      if (iXe >= 0) {
        for (const r of Rxe) {
          if (!Array.isArray(r)) continue;
          const xe = String(r[iXe] || "").trim();
          if (xe) XE.add(xe);
        }
      }
    }

    // 5) Render datalist
    const maOptions = Array.from(MA_INFO.entries()).map(([m, info]) => ({
      value: m,
      label: info.ten ? `${m} - ${info.ten}` : m,
    }));
    populateDatalist("dsMaNV", maOptions);

    populateDatalist(
      "dsSoXe",
      Array.from(XE)
        .sort((a, b) => a.localeCompare(b, "vi"))
        .map((v) => ({ value: v }))
    );

    // 6) Seed TEN_SET để hint tên
    TEN_SET = new Set(
      Array.from(MA_INFO.values())
        .map((v) => norm(v.ten))
        .filter(Boolean)
    );

    showStatus(
      `Đã nạp ${MA_INFO.size} nhân viên • ${XE.size} số xe từ final_data.json`,
      "success"
    );
  }

  // ================= Clear form =================
  function clearForm() {
    ["maNV", "tenNV", "chucVu", "soXe", "ca", "hash", "ghiChu"].forEach(
      (id) => {
        const el = $(id);
        if (!el) return;
        el.value = el.tagName === "SELECT" ? "" : "";
      }
    );
    $("maNV")?.focus();
  }

  // ================= Init =================
  async function initChamCong() {
    try {
      await refreshLocation();
      await loadOptions(); // chỉ final_data.json (NO FALLBACK)
      attachAutoFill(); // auto fill theo Mã NV (ghi đè)
      showStatus("Sẵn sàng chấm công", "success");
    } catch (e) {
      console.error(e);
      showStatus("Lỗi khởi tạo", "error");
    }
  }
  window.initChamCong = initChamCong; // chamcong.js gọi  :contentReference[oaicite:2]{index=2}
})();
