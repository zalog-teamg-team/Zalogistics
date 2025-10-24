// reader.js — load/save headers,data,fmt (+exists, +saveFinal)
// Giữ NGUYÊN API cũ để không vỡ main/dataOps/dataStore:
//   - new DataReader(baseUrl?)
//   - buildUrl(kind, date?)
//   - load(kind, date) -> { header, rows, fmt, url, version }
//   - loadFinal()      -> { url, sheets:{khachhang,nhanvien,phuongtien,mucluong?}, loadedAt }
//   - exists(kind, date) -> boolean
//   - save(kind, date, {headers,data,fmt}, {version?, force?})
//   - saveFinal({ khachhang:{headers,rows}, nhanvien:{...}, phuongtien:{...}, mucluong?:{...} })
//
// Điều chỉnh tối ưu:
//  - fetch dùng { cache: 'no-cache' } để tận dụng 304 (revalidate) thay vì 'no-store'
//  - exists(): chỉ 1 lần GET (no-cache) thay cho HEAD→GET kép (tránh CORS edge và giảm round-trip)
//  - Chuẩn hoá fmt đầu vào, tránh rác khóa/tham số
//  - Cache trong phiên cho bảng tháng (map theo key) và final_data

export class DataReader {
  constructor(baseUrl) {
    const fromWindow =
      (typeof window !== "undefined" && window.DATA_BASE_URL) || "/filejson/";
    this.baseUrl = String(baseUrl || fromWindow).replace(/\/+$/, "") + "/";
    this.cache = { tables: new Map(), final: null };
  }

  prefix(kind) {
    const map = {
      logchuyen: "Logchuyen",
      chamcong: "Chamcong",
      congno: "Congno",
      luong: "Luongthang", // Sửa: Luong → Luongthang
      chuyen: "Luongchuyen", // Sửa: Chuyen → Luongchuyen
      mucluong: "Mucluong",
    };
    const p = map[kind];
    if (!p) throw new Error(`Loại dữ liệu không hỗ trợ: ${kind}`);
    return p;
  }

  parts(date) {
    const d = date instanceof Date ? date : new Date(date || Date.now());
    return {
      mm: String(d.getMonth() + 1).padStart(2, "0"),
      yyyy: String(d.getFullYear()),
    };
  }

  buildUrl(kind, date) {
    if (kind === "final") return this.baseUrl + "final_data.json";
    // if (kind === "mucluong") return this.baseUrl + "Mucluong.json";
    const { mm, yyyy } = this.parts(date);
    // New format: /filejson/MM.YYYY/Filename.MM.YYYY.json
    const monthDir = `${mm}.${yyyy}`;
    const filename = `${this.prefix(kind)}.${monthDir}.json`;
    return `${this.baseUrl}${monthDir}/${filename}`;
  }

  async fetchWithMeta(url, init) {
    const res = await fetch(url, {
      cache: "no-cache", // revalidate → có thể nhận 304 nhanh hơn
      credentials: "same-origin",
      ...init,
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(
        `HTTP ${res.status} ${res.statusText} ${
          t ? `: ${t.slice(0, 200)}` : ""
        }`
      );
    }
    const json = await res.json();
    const lastMod = res.headers.get("Last-Modified");
    const version = lastMod ? Math.floor(new Date(lastMod).getTime()) : 0;
    return { json, version };
  }

  // Parse sheet JSON: { headers:[], data:[[]], fmt?:{"r,c":{...}} }
  parseSheet(payload) {
    if (
      !payload ||
      !Array.isArray(payload.headers) ||
      !Array.isArray(payload.data)
    ) {
      throw new Error(
        'Sheet JSON phải có dạng: { "headers": [], "data": [ [] ] }'
      );
    }

    const header = payload.headers.map((v) => (v == null ? "" : String(v)));
    const rows = payload.data.map((row) =>
      Array.isArray(row)
        ? row.map((v) => (v == null ? "" : String(v)))
        : [String(row)]
    );

    const cols = Math.max(header.length, ...rows.map((r) => r.length));
    const H = header.slice();
    while (H.length < cols) H.push("");
    const R = rows.map((r) => {
      const rr = r.slice(0, cols);
      while (rr.length < cols) rr.push("");
      return rr;
    });

    // fmt (optional) — lọc key hợp lệ và field có ích
    const fmtIn =
      payload && typeof payload.fmt === "object" && payload.fmt
        ? payload.fmt
        : {};
    const fmt = {};
    for (const [k, v] of Object.entries(fmtIn)) {
      if (!v || typeof v !== "object") continue;
      const out = {};
      if (v.bold) out.bold = true;
      if (v.italic) out.italic = true;
      if (v.underline) out.underline = true;
      if (v.align) out.align = String(v.align);
      if (v.color) out.color = String(v.color);
      if (v.bg) out.bg = String(v.bg);
      if (v.font) out.font = String(v.font);
      if (v.fontSize != null && Number.isFinite(Number(v.fontSize)))
        out.fontSize = Number(v.fontSize);
      if (Object.keys(out).length) fmt[k] = out;
    }

    return { header: H, rows: R, fmt };
  }

  // Build month folder if not exists
  async ensureMonthFolder(date) {
    const { mm, yyyy } = this.parts(date);
    const monthDisplay = `${mm}.${yyyy}`;

    const buildUrl =
      (typeof window !== "undefined" && window.BUILD_MONTH_URL) ||
      "/api/month/build";

    try {
      const res = await fetch(`${buildUrl}?monthdisplay=${monthDisplay}`, {
        method: "GET",
        cache: "no-cache",
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
          authorization: `Bearer ${localStorage.getItem("accessToken")}`,
        },
      });

      if (!res.ok) {
        console.warn(`Failed to build month ${monthDisplay}:`, res.status);
        return false;
      }

      const result = await res.json();
      console.log(`Month ${monthDisplay} ready:`, result.status);
      return true;
    } catch (e) {
      console.error(`Error building month ${monthDisplay}:`, e.message);
      return false;
    }
  }

  // LOAD bảng theo tháng (với auto-build month)
  async load(kind, date) {
    const url = this.buildUrl(kind, date);
    const key = `${kind}:${url}`;

    // Check cache first
    if (this.cache.tables.has(key))
      return { ...this.cache.tables.get(key), url };

    try {
      // Try to load the file
      const { json, version } = await this.fetchWithMeta(url);
      const parsed = this.parseSheet(json);
      const packed = { ...parsed, version };
      this.cache.tables.set(key, packed);
      return { ...packed, url };
    } catch (firstError) {
      // If 404, try to build the month folder and retry
      if (firstError.message.includes("404")) {
        console.log(`File not found, building month folder...`);
        await this.ensureMonthFolder(date);

        // Retry loading after building
        try {
          const { json, version } = await this.fetchWithMeta(url);
          const parsed = this.parseSheet(json);
          const packed = { ...parsed, version };
          this.cache.tables.set(key, packed);
          return { ...packed, url };
        } catch (retryError) {
          throw retryError;
        }
      }
      throw firstError;
    }
  }

  // final_data.json (+ Mucluong.json nếu có)
  async loadFinal() {
    if (this.cache.final) return this.cache.final;

    // 1) Load final_data.json
    const url = this.buildUrl("final");
    const { json } = await this.fetchWithMeta(url);

    // Chuẩn hoá key sheet theo alias mềm
    const norm = (s) =>
      String(s || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^\w\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();

    // Alias key đích
    const wanted = {
      khachhang: ["khach hang", "khachhang", "kh", "customer", "customers"],
      nhanvien: [
        "nhan vien",
        "nhanvien",
        "nv",
        "employee",
        "employees",
        "nhan-su",
        "nhansu",
      ],
      phuongtien: [
        "phuong tien",
        "phuongtien",
        "vehicle",
        "vehicles",
        "xe",
        "phuong_tien",
      ],
      mucluong: [
        "mucluong",
        "muc luong",
        "muc_luong",
        "bang mucluong",
        "bang muc luong",
      ],
    };

    const unifyKey = (name) => {
      const n = norm(name);
      for (const [k, arr] of Object.entries(wanted)) {
        if (arr.some((a) => n.includes(a))) return k;
      }
      return "";
    };

    // Gộp sheets
    const sheets = {};
    if (json && typeof json === "object") {
      // Có thể là dạng { sheets: {A:{headers,data}, B:{...}} } hoặc { A:{headers,data}, B:{...} }
      const bag =
        json.sheets && typeof json.sheets === "object" ? json.sheets : json;
      for (const [name, v] of Object.entries(bag)) {
        if (!v || typeof v !== "object") continue;
        const k = unifyKey(name);
        if (!k) continue;
        const header = Array.isArray(v.headers)
          ? v.headers.map((x) => String(x ?? ""))
          : [];
        const rows = Array.isArray(v.data)
          ? v.data.map((r) =>
              Array.isArray(r)
                ? r.map((x) => String(x ?? ""))
                : [String(r ?? "")]
            )
          : [];
        sheets[k] = { header, rows };
      }
    }

    // 2) Cố gắng đọc thêm Mucluong.json nếu chưa có
    if (!sheets.mucluong) {
      try {
        const { json: mucl } = await this.fetchWithMeta(
          this.buildUrl("mucluong")
        );
        if (mucl && Array.isArray(mucl.headers) && Array.isArray(mucl.data)) {
          sheets.mucluong = {
            header: mucl.headers.map((x) => String(x ?? "")),
            rows: mucl.data.map((r) =>
              Array.isArray(r)
                ? r.map((x) => String(x ?? ""))
                : [String(r ?? "")]
            ),
          };
        }
      } catch {
        /* optional */
      }
    }

    this.cache.final = { url, sheets, loadedAt: Date.now() };
    return this.cache.final;
  }

  // NEW: kiểm tra file tháng đã tồn tại (1 lần GET revalidate)
  async exists(kind, date) {
    const url = this.buildUrl(kind, date);
    try {
      const res = await fetch(url, {
        method: "GET",
        cache: "no-cache",
        credentials: "same-origin",
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  // SAVE sheet (PUT REST), có kèm fmt và kiểm soát version
  async save(kind, date, payload, opts = {}) {
    if (typeof opts === "number") opts = { version: opts };
    const version = Number(opts.version || 0);
    const force = !!opts.force;

    const { mm, yyyy } = this.parts(date);
    const monthDir = `${mm}.${yyyy}`;
    const fname = `${this.prefix(kind)}.${monthDir}.json`;

    const base =
      (typeof window !== "undefined" && window.SAVE_URL_BASE) ||
      "/api/filejson/";
    // New format: /api/filejson/MM.YYYY/Filename.MM.YYYY.json
    const url = String(base).replace(/\/+$/, "/") + monthDir + "/" + fname;

    const toBody = () =>
      JSON.stringify({
        headers: payload.headers || [],
        data: payload.data || [],
        fmt: payload.fmt || {},
      });

    const attempt = async (forceHeader) => {
      const res = await fetch(url, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-version": forceHeader ? "0" : String(version || 0),
        },
        body: toBody(),
        cache: "no-cache",
        credentials: "same-origin",
      });
      return res;
    };

    let res = await attempt(force);
    if (res.status === 409) res = await attempt(true); // xung đột phiên → ép ghi

    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(
        `HTTP ${res.status} ${res.statusText} ${
          t ? `: ${t.slice(0, 200)}` : ""
        }`
      );
    }

    // invalidate cache bảng tương ứng
    const keyPrefix = `${kind}:${this.buildUrl(kind, date)}`;
    this.cache.tables.delete(keyPrefix);
    return await res.json().catch(() => ({}));
  }

  // SAVE final_data.json
  async saveFinal(sheets) {
    const pack = { sheets: {} };
    for (const [k, v] of Object.entries(sheets || {})) {
      if (!v || typeof v !== "object") continue;
      const headers = Array.isArray(v.headers)
        ? v.headers
        : Array.isArray(v.header)
        ? v.header
        : [];
      const data = Array.isArray(v.rows)
        ? v.rows
        : Array.isArray(v.data)
        ? v.data
        : [];
      pack.sheets[k] = {
        headers: headers.map((x) => String(x ?? "")),
        data: data.map((r) =>
          Array.isArray(r) ? r.map((x) => String(x ?? "")) : [String(r ?? "")]
        ),
      };
    }

    const base =
      (typeof window !== "undefined" && window.SAVE_URL_BASE) ||
      "/api/filejson/";
    const url = String(base).replace(/\/+$/, "/") + "final_data.json";

    const res = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pack),
      cache: "no-cache",
      credentials: "same-origin",
    });

    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(
        `HTTP ${res.status} ${res.statusText} ${
          t ? `: ${t.slice(0, 200)}` : ""
        }`
      );
    }

    this.cache.final = null; // invalidate final cache
    return await res.json().catch(() => ({}));
  }
}

// Singleton tiện dụng
export const reader = new DataReader();
export default reader;
