// map.js — Leaflet + Realtime + Splitter + Zone UI (ngăn kéo) + Tìm xe + Bảng xe
/* global L */
import { createVehiclesLayer } from "./vehMarkers.js";
import { createGeoZones } from "./geoZones.js";
import { attachMapContext } from "./mapContext.js";
import { attachVehFinderControl } from "./vehFinderCtrl.js";
import { attachVehTablePanel } from "./vehTablePanel.js";

// ====== Cấu hình API qua proxy ======
const API_CONFIG = {
  realtimeUrl: "/api/proxy/gps/realtimeAll",
  historyUrl: "/api/proxy/gps/history",
};
const MAP_INIT = { lat: 10.776, lng: 106.7, zoom: 12 };
const $ = (id) => document.getElementById(id);

// ====== Helpers ======
const toNum = (x) =>
  typeof x === "number"
    ? x
    : typeof x === "string"
    ? Number(x.replace(",", ".").trim())
    : NaN;
const pick = (o, keys) => {
  if (!o || typeof o !== "object") return undefined;
  for (const k of keys) {
    if (o[k] != null) return o[k];
    const alt = Object.keys(o).find(
      (key) => key.toLowerCase() === String(k).toLowerCase()
    );
    if (alt && o[alt] != null) return o[alt];
  }
};
const CAR_STATUS = {
  0: { text: "Đang chạy", color: "#28a745" },
  1: { text: "Bật máy", color: "#20c997" },
  2: { text: "Dừng xe", color: "#dc3545" },
  3: { text: "Đỗ xe", color: "#6c757d" },
  4: { text: "Quá tốc độ", color: "#dc3545" },
  5: { text: "Mất tín hiệu", color: "#fd7e14" },
  6: { text: "SOS", color: "#dc3545" },
  7: { text: "Lệch tuyến", color: "#fd7e14" },
  8: { text: "Vào khu vực", color: "#17a2b8" },
  9: { text: "Ra khỏi khu vực", color: "#17a2b8" },
  10: { text: "Dừng không tắt máy", color: "#007bff" },
};
const getCarStatus = (code) =>
  CAR_STATUS[Number(code)] || { text: "Không xác định", color: "#6c757d" };

// ====== Chuẩn hoá record xe ======
function normalizeOne(raw) {
  const plate = pick(raw, [
    "VehicleNo",
    "vehicleNo",
    "Plate",
    "plate",
    "BSX",
    "license",
    "licensePlate",
    "LicensePlate",
  ]);
  const lat = toNum(
    pick(raw, ["Latitude", "latitude", "Lat", "lat", "GPS_Lat", "gps_lat"])
  );
  const lng = toNum(
    pick(raw, [
      "Longitude",
      "longitude",
      "Lng",
      "lng",
      "Lon",
      "lon",
      "Long",
      "GPS_Lng",
      "gps_lng",
    ])
  );
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !plate) return null;
  const dir =
    toNum(pick(raw, ["Direction", "direction", "Heading", "heading", "dir"])) ||
    0;
  const speed =
    toNum(pick(raw, ["Speed", "speed", "Velocity", "velocity", "v"])) || 0;
  const time =
    pick(raw, ["OperateDate", "operateDate", "Time", "time", "timestamp"]) ||
    "";
  const statusCode = pick(raw, ["CarStatus", "carStatus", "Status", "status"]);
  const address = pick(raw, ["Address", "address"]) || "";
  const status = getCarStatus(statusCode);
  return {
    plate,
    plateKey: plate.replace(/[^A-Z0-9]/gi, "").toUpperCase(),
    lat,
    lng,
    dir,
    speed,
    time,
    statusCode,
    status,
    address,
  };
}
function normalizeArray(resp) {
  const arr = Array.isArray(resp?.result)
    ? resp.result
    : Array.isArray(resp?.data)
    ? resp.data
    : Array.isArray(resp?.Data)
    ? resp.Data
    : Array.isArray(resp)
    ? resp
    : [];
  const out = [];
  for (const it of arr) {
    const n = normalizeOne(it);
    if (n) out.push(n);
  }
  return out;
}

// ====== Gọi realtime ======
async function eupFetchRealtime() {
  try {
    // Get auth token from window.auth if available
    const token =
      window.auth?.getAccessToken?.() || localStorage.getItem("accessToken");

    const headers = { "Content-Type": "application/json" };

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(API_CONFIG.realtimeUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({}),
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (data.status !== 1 || !Array.isArray(data.result)) return [];
    return normalizeArray(data);
  } catch (err) {
    console.error("[map] Lỗi API:", err.message);
    return [];
  }
}

// ====== Splitter (map/data) ======
function initSplitter() {
  const app = $("app"),
    splitter = $("splitter"),
    left = $("pane-data"),
    right = $("pane-map");
  if (!app || !splitter || !left || !right) return;
  const LS = "ui.splitLeftPct",
    MIN_L = 320,
    MIN_R = 260,
    W = splitter.getBoundingClientRect().width || 8;
  const apply = (pct) => {
    const v = Math.max(10, Math.min(90, Math.round(pct)));
    app.style.setProperty("--split-left", String(v));
    try {
      localStorage.setItem(LS, String(v));
    } catch {}
  };
  const read = () => {
    try {
      const n = Number(localStorage.getItem(LS));
      if (Number.isFinite(n) && n >= 10 && n <= 90) return n;
    } catch {}
    return 70;
  };
  apply(read());
  let drag = false,
    rect = null;
  const move = (e) => {
    if (!drag || !rect) return;
    const x = e.clientX - rect.left;
    const px = Math.max(MIN_L, Math.min(rect.width - MIN_R - W, x));
    apply((px / rect.width) * 100);
  };
  const stop = () => {
    drag = false;
    rect = null;
    document.body.classList.remove("resizing");
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", stop, true);
  };
  splitter.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    rect = app.getBoundingClientRect();
    drag = true;
    document.body.classList.add("resizing");
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, true);
  });
  splitter.addEventListener("dblclick", () => apply(70));
  window.addEventListener("resize", () =>
    window.dispatchEvent(new Event("app:resized"))
  );
}

// ====== Zone UI (Status bar + Drawer) ======
function ensureZoneUI() {
  const pane =
    document.getElementById("pane-map") ||
    document.querySelector('#pane-map,[data-pane="map"]');
  const host = document.getElementById("mapHost");
  if (!pane) return;

  // Status bar (text)
  if (!document.getElementById("zoneStatusBar")) {
    const bar = document.createElement("div");
    bar.id = "zoneStatusBar";
    bar.className = "zone-status-bar";
    bar.setAttribute("role", "status");
    bar.setAttribute("aria-live", "polite");
    bar.textContent = "—";
    if (host) pane.insertBefore(bar, host);
    else pane.appendChild(bar);
  }

  // Drawer (ẩn/hiện danh sách khu vực)
  if (!document.getElementById("zoneDrawer")) {
    const wrap = document.createElement("div");
    wrap.id = "zoneDrawer";
    wrap.className = "zone-drawer collapsed"; // mặc định ẩn
    wrap.style.setProperty("--zone-drawer-w", String(drawerReadW()) + "px");
    wrap.innerHTML = `
      <div class="drawer">
        <button id="zoneHandle" class="zone-handle" title="Bấm để mở/đóng — kéo để thay đổi độ rộng">
          <span class="chev">›</span>
        </button>
        <div class="zone-panel">
          <div id="zoneList" class="zone-list"></div>
        </div>
      </div>`;
    // đặt ngay sau mapHost để định vị tương đối
    if (host && host.parentElement === pane)
      pane.insertBefore(wrap, host.nextSibling);
    else pane.appendChild(wrap);
    installDrawerHandlers(wrap);
  }
}
const renderZoneStatus = (texts) => {
  const el = $("zoneStatusBar");
  const s = Array.isArray(texts) ? texts.filter(Boolean) : [];
  if (el) el.textContent = s.length ? s.join(" • ") : "—";
};

function renderZoneList(summary) {
  const box = $("zoneList");
  if (!box) return;
  const rows = Array.isArray(summary) ? summary : [];

  // Tính dòng ALL
  let tIn = 0,
    tStop = 0,
    tOut = 0;
  for (const r of rows) {
    tIn += Number(r.inside) || 0;
    tStop += Number(r.stopped) || 0;
    tOut += Number(r.outside) || 0;
  }

  let html = `<div class="zone-list-header"><div class="col name">Khu vực</div><div class="col in">Trong</div><div class="col stop">Đỗ/Dừng</div><div class="col out">Ngoài</div></div>`;

  // Dòng tổng "All"
  html += `<button class="zone-row all" data-zone-id="__ALL__" title="Phóng toàn bộ khu vực">
      <span class="name">All</span>
      <span class="in badge">${tIn}</span>
      <span class="stop badge">${tStop}</span>
      <span class="out badge">${tOut}</span>
    </button>`;

  // Các khu vực
  for (const r of rows) {
    html += `<button class="zone-row" data-zone-id="${
      r.zoneId
    }" title="Phóng tới khu vực">
      <span class="name">${r.name || r.zoneId}</span>
      <span class="in badge">${Number(r.inside) || 0}</span>
      <span class="stop badge">${Number(r.stopped) || 0}</span>
      <span class="out badge">${Number(r.outside) || 0}</span>
    </button>`;
  }
  box.innerHTML = html;
}

function setupZoneListClick(map) {
  const box = $("zoneList");
  if (!box || !map) return;
  box.addEventListener("click", (e) => {
    const row = e.target.closest(".zone-row");
    if (!row) return;
    const id = row.getAttribute("data-zone-id");
    if (id === "__ALL__") {
      // fit toàn bộ các khu vực
      const zones = window.GeoZones?.getZones?.() || [];
      let b = null;
      for (const z of zones) {
        try {
          const bb =
            z.type === "circle"
              ? L.circle(z.center, { radius: z.radius }).getBounds()
              : Array.isArray(z.coords) && z.coords.length >= 3
              ? L.polygon(z.coords).getBounds()
              : null;
          if (bb) b = b ? b.extend(bb) : bb;
        } catch {}
      }
      if (b) map.fitBounds(b.pad(0.2));
      return;
    }
    // fit 1 khu vực
    const zones = window.GeoZones?.getZones?.() || [];
    const z = zones.find((x) => String(x.id) === String(id));
    if (!z) return;
    try {
      let b = null;
      if (z.type === "circle")
        b = L.circle(z.center, { radius: z.radius }).getBounds();
      else if (Array.isArray(z.coords) && z.coords.length >= 3)
        b = L.polygon(z.coords).getBounds();
      if (b) map.fitBounds(b.pad(0.2));
    } catch (err) {
      console.warn("fit zone bounds error:", err);
    }
  });
}

// ====== Drawer helpers ======
function drawerReadOpen() {
  try {
    return localStorage.getItem("ui.zoneDrawerOpen") === "1";
  } catch {}
  return false;
}
function drawerSetOpen(open) {
  const dr = $("zoneDrawer");
  if (!dr) return;
  dr.classList.toggle("open", open);
  dr.classList.toggle("collapsed", !open);
  const chev = dr.querySelector(".chev");
  if (chev) chev.textContent = open ? "‹" : "›";
  try {
    localStorage.setItem("ui.zoneDrawerOpen", open ? "1" : "0");
  } catch {}
}
function drawerReadW() {
  try {
    const n = Number(localStorage.getItem("ui.zoneDrawerW"));
    if (Number.isFinite(n) && n >= 360 && n <= 800) return n;
  } catch {}
  return 480;
}
function drawerSetW(px) {
  const dr = $("zoneDrawer");
  if (!dr) return;
  dr.style.setProperty("--zone-drawer-w", px + "px");
  try {
    localStorage.setItem("ui.zoneDrawerW", String(px));
  } catch {}
}

function installDrawerHandlers(dr) {
  const handle = dr.querySelector("#zoneHandle");
  const onClick = (e) => {
    if (installDrawerHandlers._dragging) return;
    drawerSetOpen(!dr.classList.contains("open"));
  };
  let startX = 0,
    startW = drawerReadW();

  const onDown = (e) => {
    if (!dr.classList.contains("open")) {
      onClick(e);
      return;
    }
    installDrawerHandlers._dragging = true;
    startX = e.clientX;
    startW =
      parseFloat(getComputedStyle(dr).getPropertyValue("--zone-drawer-w")) ||
      drawerReadW();
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp, { once: true });
  };
  const onMove = (e) => {
    if (!installDrawerHandlers._dragging) return;
    const dx = e.clientX - startX;
    const nw = Math.max(360, Math.min(800, startW + dx));
    drawerSetW(nw);
  };
  const onUp = () => {
    installDrawerHandlers._dragging = false;
    document.removeEventListener("pointermove", onMove);
  };

  handle.addEventListener("pointerdown", onDown);
  handle.addEventListener("click", onClick);

  // init theo LS
  drawerSetW(drawerReadW());
  drawerSetOpen(drawerReadOpen());
}

// ====== Map chính ======
function initMap() {
  const host = $("mapHost");
  if (!host) {
    console.error("[map] #mapHost không tồn tại");
    return;
  }
  host.classList.add("has-map");
  host.innerHTML = "";
  const map = L.map(host, {
    zoomControl: true,
    attributionControl: true,
  }).setView([MAP_INIT.lat, MAP_INIT.lng], MAP_INIT.zoom);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 20,
    attribution: "&copy; OpenStreetMap",
  }).addTo(map);
  new ResizeObserver(() => map.invalidateSize()).observe(host);
  setTimeout(() => map.invalidateSize(), 0);
  window.addEventListener("app:resized", () => map.invalidateSize());

  // Lớp xe + khu vực
  const vehLayer = createVehiclesLayer(map);
  const geo = createGeoZones({ attachToWindow: true });
  geo.attachMap(map);
  if (Array.isArray(window.GEO_ZONES)) geo.setZones(window.GEO_ZONES);

  // UI khu vực
  ensureZoneUI();
  setupZoneListClick(map);
  window.addEventListener("geozone:events", (e) =>
    renderZoneStatus(e?.detail?.text || [])
  );
  window.addEventListener("geozone:summary", (e) =>
    renderZoneList(e?.detail?.summary || [])
  );

  // Menu chuột phải + chỉnh sửa vùng/POI
  attachMapContext(map);

  // ===== Control “Tìm xe” + Bảng xe + Tải (UI tối giản) =====
  let autoTimer = null;
  function toggleAuto(on) {
    if (autoTimer) {
      clearInterval(autoTimer);
      autoTimer = null;
    }
    if (on) {
      refresh(false);
      autoTimer = setInterval(() => refresh(false), 20000);
    }
  }

  async function refresh(fit) {
    try {
      const rows = await eupFetchRealtime();
      const n = rows.length;
      vehLayer.upsertFromRealtime(rows);
      if (fit || (!refresh._fittedOnce && n)) {
        const b = vehLayer.getBounds();
        if (b) map.fitBounds(b.pad(0.2));
        refresh._fittedOnce = true;
      }
      window.dispatchEvent(
        new CustomEvent("map:vehicles", { detail: vehLayer.getList() })
      );
      window.dispatchEvent(
        new CustomEvent("map:vehicles:raw", { detail: rows })
      );
      return rows;
    } catch (err) {
      console.error("[map] Refresh lỗi:", err);
      return [];
    }
  }

  // Panel "Bảng xe"
  const vehPanel = attachVehTablePanel(map, vehLayer);

  // Gắn control finder (có nút "Bảng")
  attachVehFinderControl(map, vehLayer, {
    onRefresh: () => refresh(true),
    onShowTable: () => vehPanel.toggle(),
    onToggleAuto: (on) => toggleAuto(on), // UI auto đang ẩn; vẫn giữ callback cho tương lai
  });

  setTimeout(() => toggleAuto(true), 100); // auto 20s chạy nền
}

// ====== Bootstrap ======
function init() {
  initSplitter();
  ensureZoneUI();
  initMap();
}
if (document.readyState === "loading")
  document.addEventListener("DOMContentLoaded", init);
else init();
