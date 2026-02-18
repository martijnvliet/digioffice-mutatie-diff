(function () {
  const selectedRows = new Set();
  let ensureScheduled = false;

  function clearSelection() {
    selectedRows.forEach((row) => row.classList.remove("do-selected"));
    selectedRows.clear();
  }

  function getGridContainer() {
    return document.querySelector('[id$="_grdChangeLog"]');
  }

  function getGrid() {
    const container = getGridContainer();
    if (!container) return null;
    return container.querySelector(".table-data table");
  }


  function getLegendRow(container) {
    if (!container) return null;

    const directPrev = container.previousElementSibling;
    if (directPrev?.classList.contains("table-legend-row")) {
      return directPrev;
    }

    return container.parentElement?.querySelector(".table-legend-row") || null;
  }

  function getRefreshAnchor(container) {
    if (!container) return null;

    return container.querySelector(
      [
        "[title*=\"refresh\" i]",
        "[aria-label*=\"refresh\" i]",
        "[class*=\"refresh\" i]",
        ".fa-refresh",
        ".fa-sync",
        ".fa-rotate-right"
      ].join(",")
    );
  }

  function mountCompareButton(btn, container) {
    const refreshAnchor = getRefreshAnchor(container);
    const legendRow = getLegendRow(container);

    let slot = document.getElementById("do-compare-slot");
    if (!slot) {
      slot = document.createElement("div");
      slot.id = "do-compare-slot";
    }

    if (legendRow?.parentElement) {
      if (slot.parentElement !== legendRow.parentElement) {
        legendRow.parentElement.insertBefore(slot, legendRow.nextSibling);
      }

      if (btn.parentElement !== slot) {
        slot.appendChild(btn);
      }
      return;
    }

    if (refreshAnchor) {
      const controlGroup =
        refreshAnchor.closest(".menu,.btn-group,.toolbar,.tools,.actions,div,li") ||
        refreshAnchor.parentElement;
      const slotParent = controlGroup?.parentElement || container;

      if (slot.parentElement !== slotParent) {
        slotParent.insertBefore(slot, controlGroup ? controlGroup.nextSibling : slotParent.firstChild);
      }

      if (btn.parentElement !== slot) {
        slot.appendChild(btn);
      }
      return;
    }

    if (slot.parentElement !== container) {
      container.insertBefore(slot, container.firstChild);
    }

    if (btn.parentElement !== slot) {
      slot.appendChild(btn);
    }
  }

  function ensureButton() {
    const grid = getGrid();
    const container = getGridContainer();
    const existingBtn = document.getElementById("do-compare-btn");
    const existingSlot = document.getElementById("do-compare-slot");

    if (!grid || !container) {
      if (existingBtn) existingBtn.remove();
      if (existingSlot) existingSlot.remove();
      clearSelection();
      return;
    }

    if (existingBtn) {
      mountCompareButton(existingBtn, container);
      return;
    }

    const btn = document.createElement("button");
    btn.id = "do-compare-btn";
    btn.type = "button";
    btn.innerText = "Vergelijk mutaties";
    btn.onclick = openComparison;

    mountCompareButton(btn, container);
  }

  function smartFormat(text) {
    if (!text) return "";

    const looksLikeMarkup =
      text.includes("<") &&
      text.includes(">") &&
      /<\/?[a-zA-Z]/.test(text);

    if (!looksLikeMarkup) return text;

    const xml = text.replace(/>\s*</g, ">\n<");
    let formatted = "";
    let indent = 0;

    xml.split("\n").forEach((line) => {
      if (line.match(/^<\/.+/)) indent--;

      formatted += `${"  ".repeat(Math.max(indent, 0))}${line}\n`;

      if (line.match(/^<[^!?/].*[^/]>$/)) indent++;
    });

    return formatted.trim();
  }

  function enableRowTracking() {
    document.addEventListener(
      "click",
      (e) => {
        const gridContainer = getGridContainer();
        const clickTarget = e.target instanceof Node ? e.target : null;

        if (!gridContainer || !clickTarget || !gridContainer.contains(clickTarget)) {
          clearSelection();
          return;
        }

        const row = clickTarget.closest(".table-data tbody tr[id][vi]");
        if (!row || !row.querySelector("td")) return;

        if (!e.ctrlKey) {
          clearSelection();
        }

        if (selectedRows.has(row)) {
          selectedRows.delete(row);
          row.classList.remove("do-selected");
        } else {
          selectedRows.add(row);
          row.classList.add("do-selected");
        }
      },
      true
    );
  }

  function getSelectedRows() {
    return Array.from(selectedRows);
  }

  function renderFormattedDiff(oldText, newText) {
    const oldFormatted = smartFormat(decodeHtml(oldText || ""));
    const newFormatted = smartFormat(decodeHtml(newText || ""));
    return renderDiff(oldFormatted, newFormatted);
  }

  function openComparison() {
    const rows = getSelectedRows();

    if (!rows.length) {
      alert("Selecteer minimaal één mutatieregel.");
      return;
    }

    const overlay = document.createElement("div");
    overlay.id = "do-overlay";

    let html = `
<div class="do-modal">
  <div class="do-header">
    <h2>Mutatievergelijking</h2>
    <div class="do-legend">
      <span class="legend-added">toegevoegd</span>
      <span class="legend-removed">verwijderd</span>
    </div>
  </div>
`;

    rows.forEach((row) => {
      const veld = row.querySelector('td[col="6"] span')?.innerText ?? "";
      const oud = row.querySelector('td[col="7"] span')?.innerText ?? "";
      const nieuw = row.querySelector('td[col="8"] span')?.innerText ?? "";

      const diff = renderFormattedDiff(oud, nieuw);

      html += `
<div>
  <div class="do-field-title">${escapeHtml(veld)}</div>
  <div class="do-columns">
    <div class="do-old">${diff.left}</div>
    <div class="do-new">${diff.right}</div>
  </div>
</div>`;
    });

    html += '<button id="do-close" type="button">Sluiten</button></div>';

    overlay.innerHTML = html;
    document.body.appendChild(overlay);

    document.getElementById("do-close").onclick = () => overlay.remove();

    const olds = overlay.querySelectorAll(".do-old");
    const news = overlay.querySelectorAll(".do-new");

    olds.forEach((oldCol, i) => {
      const newCol = news[i];

      oldCol.addEventListener("scroll", () => {
        newCol.scrollTop = oldCol.scrollTop;
      });

      newCol.addEventListener("scroll", () => {
        oldCol.scrollTop = newCol.scrollTop;
      });
    });
  }

  function observeDom() {
    const observer = new MutationObserver((mutations) => {
      const relevantMutation = mutations.some((mutation) => {
        const target = mutation.target;
        if (!(target instanceof Element)) return false;
        return !target.closest("#do-overlay") && target.id !== "do-compare-btn";
      });

      if (!relevantMutation) return;
      scheduleEnsureButton();
    });

    const root = document.body || document.documentElement;
    if (!root) return;

    observer.observe(root, {
      childList: true,
      subtree: true
    });
  }

  function scheduleEnsureButton() {
    if (ensureScheduled) return;
    ensureScheduled = true;

    requestAnimationFrame(() => {
      ensureScheduled = false;
      ensureButton();
    });
  }

  function init() {
    enableRowTracking();
    observeDom();
    scheduleEnsureButton();
  }

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
