// filemonth/dropdown-menu.js — Data menu ONLY (không đụng Tab dropdown)
// - Giữ portal dropdown (chuột/Touch mượt)
// - 3 actions gốc:
//    + taofile     -> buildMonthlyFilesViaGAS(setStatus, month?)
//    + updatefinal -> syncFinalFromGAS(setStatus)
//    + capnhat     -> mở Final Editor (dynamic import)
// - Mở rộng: mucluong -> mở Mucluong.json editor (dynamic import)

import { syncFinalFromGAS, buildMonthlyFilesViaGAS } from "./gasOps.js";

document.addEventListener("DOMContentLoaded", () => {
  // Chỉ thao tác với khối menu dữ liệu (không đụng Tab dropdown)
  const dataBox =
    document.querySelector(".data-ops-dropdown") ||
    document.querySelector('[data-dropdown="data-ops"]');
  if (!dataBox) return;

  const dTrigger =
    dataBox.querySelector(".data-ops-trigger") ||
    dataBox.querySelector('[data-role="data-ops-trigger"]') ||
    dataBox.querySelector("button");
  const dContent =
    dataBox.querySelector(".data-ops-content") ||
    dataBox.querySelector('.dropdown-content[data-scope="data-ops"]') ||
    dataBox.querySelector(".dropdown-content");

  const statusEl = document.getElementById("status");
  const setStatus = (m, ok = false) => {
    if (!statusEl) return;
    statusEl.textContent = m || "";
    statusEl.style.color = ok ? "var(--ok,#08934a)" : "";
  };

  // ===== Portal + positioning =====
  let open = false,
    placeholder = null,
    swallowNextClick = false;

  dTrigger?.addEventListener(
    "pointerdown",
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      swallowNextClick = true;
      toggleData();
    },
    { capture: true }
  );

  dTrigger?.addEventListener("click", (e) => {
    if (swallowNextClick) {
      swallowNextClick = false;
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    toggleData();
  });

  function toggleData() {
    open ? closeData() : openData();
  }

  function portalize() {
    if (!dContent || dContent.classList.contains("portal")) return;
    placeholder = document.createElement("i");
    placeholder.className = "ops-placeholder";
    dataBox.insertBefore(placeholder, dContent);
    document.body.appendChild(dContent);
    dContent.classList.add("portal");
    const st = dContent.style;
    if (getComputedStyle(dContent).position !== "fixed") {
      st.position = "fixed";
      st.zIndex = "4000";
    }
    position();
  }
  function deportalize() {
    if (!dContent || !placeholder) return;
    placeholder.parentNode.insertBefore(dContent, placeholder);
    placeholder.remove();
    placeholder = null;
    dContent.classList.remove("portal");
    const st = dContent.style;
    st.removeProperty("position");
    st.removeProperty("z-index");
    st.removeProperty("left");
    st.removeProperty("top");
    st.removeProperty("--ops-left");
    st.removeProperty("--ops-top");
  }
  function position() {
    const r = dTrigger.getBoundingClientRect();
    const prev = dContent.style.visibility;
    dContent.style.visibility = "hidden";
    dContent.classList.add("show");

    const w = dContent.offsetWidth || 240;
    const h = dContent.offsetHeight || 180;
    const pad = 8;

    let left = Math.min(r.left, Math.max(0, window.innerWidth - w - pad));
    let top = r.bottom + 4;
    if (top + h + pad > window.innerHeight)
      top = Math.max(pad, window.innerHeight - h - pad);

    dContent.style.setProperty("--ops-left", `${left}px`);
    dContent.style.setProperty("--ops-top", `${top}px`);
    dContent.style.left = `${left}px`;
    dContent.style.top = `${top}px`;
    dContent.style.visibility = prev || "";
  }
  function openData() {
    portalize();
    dContent?.classList.add("show");
    dTrigger?.setAttribute("aria-expanded", "true");
    open = true;
    position();
    focusFirstItem();
  }
  function closeData() {
    dContent?.classList.remove("show");
    dTrigger?.setAttribute("aria-expanded", "false");
    open = false;
    deportalize();
  }

  document.addEventListener(
    "click",
    (e) => {
      if (open && !dContent.contains(e.target) && !dTrigger.contains(e.target))
        closeData();
    },
    { capture: true }
  );
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && open) closeData();
  });
  window.addEventListener("resize", () => {
    if (open) position();
  });
  window.addEventListener(
    "scroll",
    () => {
      if (open) position();
    },
    true
  );

  // ===== Helpers =====
  function getSelectedMonth() {
    // Đọc #monthDisplay 'MM/YYYY' -> 'YYYY-MM' (rỗng: để server hiểu là tháng hiện tại)
    const el = document.getElementById("monthDisplay");
    const s = (el?.textContent || "").trim();
    const m = s.match(/^(\d{2})\/(\d{4})$/);
    if (!m) return "";
    const [_, MM, YYYY] = m;
    return `${YYYY}-${MM}`;
  }
  function focusFirstItem() {
    const items = Array.from(
      dContent.querySelectorAll(
        "[data-action].ops-item, [data-action].dropdown-item"
      )
    );
    (items[0] || dContent).focus?.();
  }

  // A11y điều hướng
  dContent?.addEventListener("keydown", (e) => {
    const items = Array.from(
      dContent.querySelectorAll(
        "[data-action].ops-item:not([disabled]), [data-action].dropdown-item:not([disabled])"
      )
    );
    if (!items.length) return;
    const i = items.indexOf(document.activeElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      items[(i + 1 + items.length) % items.length]?.focus();
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      items[(i - 1 + items.length) % items.length]?.focus();
    }
    if (e.key === "Enter") {
      e.preventDefault();
      document.activeElement?.dispatchEvent(
        new PointerEvent("click", { bubbles: true })
      );
    }
  });

  // ===== Actions =====
  dContent?.addEventListener("click", async (e) => {
    const it = e.target.closest("[data-action]");
    if (!it) return;
    if (it.hasAttribute("disabled")) return;

    const act = (it.dataset.action || "").toLowerCase();
    closeData();

    try {
      if (act === "taofile" || act === "build" || act === "create") {
        const month = getSelectedMonth(); // "YYYY-MM"
        await buildMonthlyFilesViaGAS(setStatus, month);
        // nạp lại dữ liệu của tab/tháng đang hiển thị
        document.getElementById("btn-load")?.click(); // gọi loadCurrent()
        return;
      }

      if (act === "update" || act === "updatefinal" || act === "sync") {
        await syncFinalFromGAS(setStatus);
        return;
      }
      if (act === "capnhat" || act === "edit" || act === "form") {
        // Final Editor (KH/NV/PT)
        const { openFinalEditor } = await import("./catalogEditor.js"); // lazy load
        openFinalEditor({
          onSaved() {
            setStatus("Đã lưu final_data.json.", true);
            window.__sheetApp?.reloadFinal?.();
          },
        });
        return;
      }
      if (act === "mucluong") {
        // Mở danh mục Mức lương (Mucluong.json)
        const { openMucluongEditor } = await import("./catalogEditor.js"); // lazy load
        openMucluongEditor({
          onSaved() {
            setStatus("Đã lưu Mucluong.json.", true);
          },
        });
        return;
      }

      // Không khớp action
      setStatus("Hành động không hỗ trợ: " + act);
    } catch (err) {
      console.error(err);
      setStatus(err.message || "Có lỗi xảy ra");
    }
  });

  // ARIA roles cho item
  Array.from(
    dContent.querySelectorAll(
      "[data-action].ops-item, [data-action].dropdown-item"
    )
  ).forEach((el) => {
    el.setAttribute("role", "menuitem");
    el.setAttribute("tabindex", "0");
  });
});
