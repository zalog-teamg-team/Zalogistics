// mapContext.js — Context menu & Zone tools (create/edit/delete/export)
// Lưu kép: LocalStorage + Server (/api/zones), khôi phục từ server trước.
// Giữ nguyên UI/luồng cũ.
/* global L */
import { toRad, haversineMeters, pointInZone } from "./geoMath.js";

export function attachMapContext(map) {
  if (!map) return;
  const Geo = window.GeoZones;

  // ---------- helpers ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const slug = (s) =>
    String(s || "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\w]+/g, "_")
      .replace(/^_|_$/g, "")
      .toUpperCase();
  function uniqueZoneId(name) {
    const base = slug(name || "ZONE");
    const ids = new Set((Geo?.getZones?.() || []).map((z) => z.id));
    if (!ids.has(base)) return base;
    let i = 2,
      id = base + "_2";
    while (ids.has(id)) {
      i++;
      id = base + "_" + i;
    }
    return id;
  }

  // ---------- LocalStorage persistence (giữ nguyên) ----------
  const ZONE_LS = "map.zones";
  function persistZonesLS() {
    try {
      const zones = Geo?.getZones?.() || [];
      const data = {
        header: {
          version: "1.0",
          type: "zones",
          exportedAt: new Date().toISOString(),
          crs: "EPSG:4326",
          app: "css-map",
        },
        zones,
      };
      localStorage.setItem(ZONE_LS, JSON.stringify(data));
    } catch (e) {}
  }
  function restoreZonesLS() {
    try {
      const raw = JSON.parse(localStorage.getItem(ZONE_LS) || "null");
      if (raw && Array.isArray(raw.zones)) Geo?.setZones?.(raw.zones);
    } catch (e) {}
  }

  // ---------- Server persistence (NEW) ----------
  const ZONES_API = window.ZONES_API_BASE || "/api/zones";
  let _lastHash = "";
  const hash = (zones) => {
    try {
      const s = JSON.stringify(zones);
      let h = 0;
      for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
      return String(h);
    } catch {
      return "";
    }
  };

  async function persistZonesServer() {
    try {
      const zones = Geo?.getZones?.() || [];
      const h = hash(zones);
      if (h && h === _lastHash) return; // không đổi → bỏ qua
      _lastHash = h;

      // Get auth token
      const token =
        window.auth?.getAccessToken?.() || localStorage.getItem("accessToken");
      const headers = {
        "Content-Type": "application/json",
        "x-version": String(window.__zonesVersion || 0),
      };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      await fetch(`${ZONES_API}/save`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          header: {
            version: "1.0",
            type: "zones",
            savedAt: new Date().toISOString(),
          },
          zones,
        }),
      })
        .then((r) => r.json())
        .then((j) => {
          if (j && j.version) window.__zonesVersion = j.version;
        })
        .catch(() => {});
    } catch (e) {}
  }
  async function restoreZonesServer() {
    try {
      // Get auth token
      const token =
        window.auth?.getAccessToken?.() || localStorage.getItem("accessToken");
      const headers = {};
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const rs = await fetch(`${ZONES_API}/load`, {
        method: "GET",
        headers,
      });
      if (!rs.ok) return false;
      const j = await rs.json();
      if (j && Array.isArray(j.zones) && j.zones.length) {
        Geo?.setZones?.(j.zones);
        window.__zonesVersion = j.version || 0;
        _lastHash = hash(j.zones);
        return true;
      }
    } catch (e) {}
    return false;
  }

  // Ghi kép
  function persistZones() {
    persistZonesLS();
    persistZonesServer();
  }

  // ---------- hit-test ----------
  function zoneAt(latlng) {
    const zones = Geo?.getZones?.() || [];
    for (const z of zones) {
      if (pointInZone(latlng.lat, latlng.lng, z)) return z;
    }
    return null;
  }

  // ---------- Modals ----------
  function ensureModalBase(id, title) {
    let box = document.getElementById(id);
    if (box) return box;
    box = document.createElement("div");
    box.id = id;
    box.className = "poi-modal hidden";
    box.innerHTML = `
      <div class="poi-dialog" role="dialog" aria-modal="true" aria-label="${title}">
        <div class="poi-title">${title}</div>
        <div class="poi-form"></div>
        <div class="poi-actions">
          <button data-role="ok">Lưu</button>
          <button data-role="cancel" class="ghost">Hủy</button>
        </div>
      </div>`;
    document.body.appendChild(box);
    return box;
  }
  function showModal(box) {
    box.classList.remove("hidden");
  }
  function hideModal(box) {
    box.classList.add("hidden");
  }

  // --- Create zone ---
  const createBox = ensureModalBase("zoneModal", "Tạo vùng (khu vực)");
  $('.poi-actions [data-role="ok"]', createBox).textContent = "Tạo";

  function openCreateZone(latlng) {
    const form = createBox.querySelector(".poi-form");
    form.innerHTML = `
      <label>Tên vùng <input id="zoneName" placeholder="VD: KHO A"></label>
      <label>Loại vùng
        <select id="zoneType">
          <option value="circle">Hình tròn</option>
          <option value="polygon">Đa giác</option>
        </select>
      </label>
      <label id="rowRadius">Bán kính (m) <input id="zoneRadius" type="number" min="10" step="10" value="200"></label>
      <div class="zone-hint" style="grid-column:1 / span 2; color:#64748b; font-size:12px">
        • <b>Hình tròn</b>: dùng tọa độ click làm tâm (& bán kính ở trên).<br/>
        • <b>Đa giác</b>: bấm “Bắt đầu vẽ”, nhấp để thêm đỉnh, double-click để kết thúc, ESC để hủy.
      </div>
    `;
    let seedLL = latlng || map.getCenter();
    const btnOk = createBox.querySelector('.poi-actions [data-role="ok"]');
    const btnCancel = createBox.querySelector(
      '.poi-actions [data-role="cancel"]'
    );

    btnOk.onclick = () => {
      const name =
        createBox.querySelector("#zoneName").value.trim() || "Vùng mới";
      const kind = createBox.querySelector("#zoneType").value;
      if (kind === "circle") {
        const r = Math.max(
          10,
          Number(createBox.querySelector("#zoneRadius").value) || 200
        );
        const id = uniqueZoneId(name);
        Geo?.addZone?.({
          id,
          name,
          type: "circle",
          center: [seedLL.lat, seedLL.lng],
          radius: r,
        });
        persistZones(); // lưu ngay
        hideModal(createBox);
      } else {
        const id = uniqueZoneId(name);
        Geo?.startDraw?.({ id, name });
        // Với polygon: geozone:summary (do geoZones.js emit ngay) → persistZones()
        const once = () => {
          persistZones();
          window.removeEventListener("geozone:summary", once);
        };
        window.addEventListener("geozone:summary", once, { once: true });
        hideModal(createBox);
      }
    };
    btnCancel.onclick = () => hideModal(createBox);
    showModal(createBox);
  }

  // --- Edit zone (draggable handles) ---
  const editBox = ensureModalBase("zoneEditModal", "Chỉnh sửa vùng");

  function beginCircleEdit(z) {
    const g = L.layerGroup().addTo(map);
    const circle = L.circle(z.center, {
      radius: z.radius,
      color: "#2563eb",
      weight: 2,
      fillColor: "#60a5fa",
      fillOpacity: 0.15,
    }).addTo(g);
    const handleCenter = L.marker(z.center, {
      draggable: true,
      zIndexOffset: 500,
      icon: L.divIcon({
        className: "",
        html: '<div style="width:12px;height:12px;border-radius:50%;background:#fff;border:2px solid #2563eb;box-shadow:0 1px 3px rgba(0,0,0,.35)"></div>',
        iconSize: [0, 0],
        iconAnchor: [6, 6],
      }),
    }).addTo(g);
    const degLng = 1 / (111320 * Math.cos(toRad(z.center[0]) || 1e-6));
    const edge = L.marker([z.center[0], z.center[1] + z.radius * degLng], {
      draggable: true,
      zIndexOffset: 500,
      icon: L.divIcon({
        className: "",
        html: '<div style="width:12px;height:12px;border-radius:50%;background:#fff;border:2px solid #2563eb;box-shadow:0 1px 3px rgba(0,0,0,.35)"></div>',
        iconSize: [0, 0],
        iconAnchor: [6, 6],
      }),
    }).addTo(g);

    handleCenter.on("drag", () => {
      const c = handleCenter.getLatLng();
      circle.setLatLng(c);
      const r = circle.getRadius();
      const deg = 1 / (111320 * Math.cos(toRad(c.lat) || 1e-6));
      edge.setLatLng([c.lat, c.lng + r * deg]);
    });
    edge.on("drag", () => {
      const c = handleCenter.getLatLng();
      const e = edge.getLatLng();
      const r = Math.max(10, haversineMeters(c.lat, c.lng, e.lat, e.lng));
      circle.setRadius(r);
      const inp = editBox.querySelector("#zeRadius");
      if (inp) inp.value = Math.round(r);
    });

    return {
      group: g,
      shape: circle,
      handles: [handleCenter, edge],
      kind: "circle",
    };
  }
  function beginPolygonEdit(z) {
    const g = L.layerGroup().addTo(map);
    const pts = (z.coords || []).map((p) => [p[0], p[1]]);
    const poly = L.polygon(pts, {
      color: "#2563eb",
      weight: 2,
      fillColor: "#60a5fa",
      fillOpacity: 0.15,
    }).addTo(g);
    const handles = pts.map((p, idx) => {
      const h = L.marker(p, {
        draggable: true,
        zIndexOffset: 500,
        icon: L.divIcon({
          className: "",
          html: '<div style="width:12px;height:12px;border-radius:50%;background:#fff;border:2px solid #2563eb;box-shadow:0 1px 3px rgba(0,0,0,.35)"></div>',
          iconSize: [0, 0],
          iconAnchor: [6, 6],
        }),
      }).addTo(g);
      h.on("drag", () => {
        const ll = h.getLatLng();
        pts[idx] = [ll.lat, ll.lng];
        poly.setLatLngs(pts);
      });
      return h;
    });
    return { group: g, shape: poly, handles, pts, kind: "polygon" };
  }
  let editSession = null;
  function stopEdit() {
    if (!editSession) return;
    try {
      editSession.group.remove();
    } catch {}
    editSession = null;
  }

  function openEditZone(z) {
    const form = editBox.querySelector(".poi-form");
    form.innerHTML = `
      <label>Tên vùng <input id="zeName" value="${(z.name || z.id).replace(
        /"/g,
        "&quot;"
      )}"></label>
      <label id="rowZeR" style="display:${
        z.type === "circle" ? "" : "none"
      }">Bán kính (m) <input id="zeRadius" type="number" min="10" step="10" value="${
      z.type === "circle" ? Math.round(z.radius || 0) : ""
    }"></label>
      <div class="zone-hint" style="grid-column:1 / span 2; color:#64748b; font-size:12px">
        • Kéo các <b>điểm tròn xanh</b> trên bản đồ để chỉnh hình. Vẫn kéo được khi hộp thoại mở.
      </div>`;
    stopEdit();
    editSession =
      z.type === "circle" ? beginCircleEdit(z) : beginPolygonEdit(z);
    const rInp = editBox.querySelector("#zeRadius");
    if (rInp && editSession.kind === "circle") {
      rInp.oninput = () => {
        const v = Math.max(10, Number(rInp.value) || 0);
        editSession.shape.setRadius(v);
        const c = editSession.handles[0].getLatLng();
        const deg = 1 / (111320 * Math.cos(toRad(c.lat) || 1e-6));
        editSession.handles[1].setLatLng([c.lat, c.lng + v * deg]);
      };
    }
    const btnOk = editBox.querySelector('.poi-actions [data-role="ok"]');
    const btnCancel = editBox.querySelector(
      '.poi-actions [data-role="cancel"]'
    );
    btnOk.onclick = () => {
      const name =
        editBox.querySelector("#zeName").value.trim() || z.name || z.id;
      if (editSession.kind === "circle") {
        const c = editSession.handles[0].getLatLng();
        const r = Math.max(
          10,
          Number(editBox.querySelector("#zeRadius")?.value) ||
            editSession.shape.getRadius() ||
            0
        );
        Geo?.addZone?.({
          id: z.id,
          name,
          type: "circle",
          center: [c.lat, c.lng],
          radius: r,
        });
      } else {
        const pts = editSession.pts || [];
        if (pts.length >= 3)
          Geo?.addZone?.({
            id: z.id,
            name,
            type: "polygon",
            coords: pts.map((p) => [p[0], p[1]]),
          });
      }
      persistZones(); // lưu ngay sau khi lưu chỉnh sửa
      hideModal(editBox);
      stopEdit();
    };
    btnCancel.onclick = () => {
      hideModal(editBox);
      stopEdit();
    };
    showModal(editBox);
  }

  // ---------- Context menu ----------
  let menu = document.getElementById("mapCtxMenu");
  if (!menu) {
    menu = document.createElement("div");
    menu.id = "mapCtxMenu";
    menu.className = "map-ctx hidden";
    menu.innerHTML = `
      <button data-act="view">📌 Xem điểm trong Google Map</button>
      <button data-act="dir">🧭 Chỉ đường</button>
      <hr/>
      <button data-act="zone">📐 Tạo vùng (khu vực)</button>
      <button data-act="zone-edit" data-disabled="true">✏️ Chỉnh sửa vùng</button>
      <button data-act="zone-delete" data-disabled="true">🗑️ Xóa vùng</button>
      <hr/>
      <button data-act="zone-export">⬇️ Xuất vùng (JSON)</button>`;
    document.body.appendChild(menu);
  }
  function showMenu(x, y, latlng) {
    const z = zoneAt(latlng);
    menu.dataset.hit = z ? z.id : "";
    const btnE = menu.querySelector('[data-act="zone-edit"]');
    const btnD = menu.querySelector('[data-act="zone-delete"]');
    if (z) {
      btnE.removeAttribute("data-disabled");
      btnD.removeAttribute("data-disabled");
      btnE.style.opacity = btnD.style.opacity = "1";
    } else {
      btnE.setAttribute("data-disabled", "true");
      btnD.setAttribute("data-disabled", "true");
      btnE.style.opacity = btnD.style.opacity = ".5";
    }
    const vw = innerWidth,
      vh = innerHeight,
      W = 300,
      H = 240;
    if (x + W > vw) x = vw - W - 8;
    if (y + H > vh) y = vh - H - 8;
    menu.style.left = x + "px";
    menu.style.top = y + "px";
    menu.classList.remove("hidden");
  }
  function hideMenu() {
    menu.classList.add("hidden");
  }
  function exportZones() {
    const zones = Geo?.getZones?.() || [];
    const data = {
      header: {
        version: "1.0",
        type: "zones",
        exportedAt: new Date().toISOString(),
        crs: "EPSG:4326",
        app: "css-map",
      },
      zones,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "zones.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 700);
  }
  function removeZoneById(id) {
    const zones = Geo?.getZones?.() || [];
    Geo?.setZones?.(zones.filter((z) => z.id !== id));
    persistZones();
  }

  menu.addEventListener("click", (e) => {
    const act = e.target.getAttribute("data-act");
    if (!act || e.target.getAttribute("data-disabled")) return;
    const ll = map.getCenter();
    if (act === "view") {
      window.open(
        `https://www.google.com/maps?q=${ll.lat},${ll.lng}`,
        "_blank"
      );
    }
    if (act === "dir") {
      window.open(
        `https://www.google.com/maps/dir/?api=1&destination=${ll.lat},${ll.lng}`,
        "_blank"
      );
    }
    if (act === "zone") {
      openCreateZone(ll);
    }
    if (act === "zone-edit") {
      const id = menu.dataset.hit;
      const z = (Geo?.getZones?.() || []).find((t) => t.id === id);
      if (z) openEditZone(z);
      else alert("Hãy bấm chuột phải bên trong một vùng.");
    }
    if (act === "zone-delete") {
      const id = menu.dataset.hit;
      if (!id) return;
      const z = (Geo?.getZones?.() || []).find((t) => t.id === id);
      if (z && confirm(`Xóa vùng “${z.name || z.id}”?`)) {
        removeZoneById(id);
      }
    }
    if (act === "zone-export") {
      exportZones();
    }
    hideMenu();
  });
  document.addEventListener("click", (e) => {
    if (!menu.contains(e.target)) hideMenu();
  });
  map.on("movestart zoomstart", hideMenu);
  map.on("contextmenu", (e) => {
    const ev = e.originalEvent;
    showMenu(ev.clientX, ev.clientY, e.latlng);
  });

  // ---------- Init: khôi phục vĩnh viễn ----------
  (async () => {
    const ok = await restoreZonesServer(); // ưu tiên server
    if (!ok) {
      restoreZonesLS(); // fallback LS
      await persistZonesServer(); // seed ngược lên server
    }
  })();

  // Lưu mỗi khi có summary (khi tạo/sửa/xóa vùng — geoZones.js đã emit ngay)
  window.addEventListener("geozone:summary", persistZones);
  window.addEventListener("beforeunload", persistZones); // chốt thêm khi đóng tab

  return { exportZonesJSON: exportZones };
}
