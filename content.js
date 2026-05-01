(function () {
  if (window.__digiofficeMutatieDiffLoaded) return;
  window.__digiofficeMutatieDiffLoaded = true;

  const selectedRows = new Set();
  let ensureScheduled = false;
  let domObserver = null;

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
      if (line.match(/^<[^!?/].*[^/]>$/) && !/<\//.test(line)) indent++;
    });

    return formatted.trim();
  }

  function renderFormattedDiff(oldText, newText) {
    const oldFormatted = smartFormat(decodeHtml(oldText || "")).trimEnd();
    const newFormatted = smartFormat(decodeHtml(newText || "")).trimEnd();
    return renderDiff(oldFormatted, newFormatted);
  }

  function enableRowTracking() {
    document.addEventListener(
      "click",
      (e) => {
        const gridContainer = getGridContainer();
        const clickTarget = e.target instanceof Node ? e.target : null;

        if (
          !gridContainer ||
          !clickTarget ||
          !gridContainer.contains(clickTarget)
        ) {
          return;
        }

        const row = clickTarget.closest(
          ".table-data tbody tr[id][vi]"
        );
        if (!row || !row.querySelector("td")) return;

        if (!e.ctrlKey) clearSelection();

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

  function normalizeGridText(value) {
    if (!value) return "";

    let text = decodeHtml(value)
      .replace(/\u00a0/g, " ")
      .trim();

    if (!text.includes("\n") && /\\r\\n|\\n|\\r/.test(text)) {
      text = text
        .replace(/\\r\\n/g, "\n")
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\n");
    }

    return text;
  }

  function getCellValue(row, col) {
    const td = row.querySelector(`td[col="${col}"]`);
    if (!td) return "";

    const span = td.querySelector("span");

    const candidates = [
      span?.getAttribute("title"),
      td.getAttribute("title"),
      span?.textContent,
      td.textContent
    ]
      .map(normalizeGridText)
      .filter(Boolean);

    if (!candidates.length) return "";

    const multiline = candidates.find((candidate) =>
      candidate.includes("\n")
    );

    if (multiline) return multiline;

    return candidates.sort((a, b) => b.length - a.length)[0];
  }

  const COLUMN_FALLBACKS = { datum: "0", veld: "6", oud: "7", nieuw: "8" };

  function detectColumnIndices() {
    const container = getGridContainer();
    if (!container) return { ...COLUMN_FALLBACKS };

    const wrap = container.parentElement || container;
    const headerCells = wrap.querySelectorAll(
      "th[col], thead [col], .table-header [col], [class*='header-row'] [col]"
    );

    const found = {};
    for (const cell of headerCells) {
      const colAttr = cell.getAttribute("col");
      if (!colAttr) continue;
      const text = (cell.getAttribute("title") || cell.textContent || "")
        .trim()
        .toLowerCase();
      if (!text) continue;

      if (found.datum === undefined && text.startsWith("datum")) found.datum = colAttr;
      if (found.veld === undefined && text.startsWith("veld")) found.veld = colAttr;
      if (found.oud === undefined && text.startsWith("oud")) found.oud = colAttr;
      if (found.nieuw === undefined && text.startsWith("nieuw")) found.nieuw = colAttr;
    }

    return { ...COLUMN_FALLBACKS, ...found };
  }

  function openComparison() {
  const rows = getSelectedRows();

  if (!rows.length) {
    alert("Selecteer minimaal één mutatieregel.");
    return;
  }

  const overlay = document.createElement("div");
  overlay.id = "do-overlay";

  const cols = detectColumnIndices();

  const fields = rows.map((row) => ({
    veld: getCellValue(row, cols.veld),
    datum: getCellValue(row, cols.datum),
    diff: renderFormattedDiff(getCellValue(row, cols.oud), getCellValue(row, cols.nieuw))
  }));

  const useTabs = fields.length > 1;
  const summary = `${fields.length} veld${fields.length === 1 ? "" : "en"} geselecteerd`;

  const tabsHtml = useTabs
    ? `<div class="do-tabs" role="tablist" aria-label="Velden">${fields
        .map((f, i) => {
          const safeVeld = escapeHtml(f.veld);
          const safeDatum = escapeHtml(f.datum);
          const tooltip = f.datum ? `${safeVeld} — ${safeDatum}` : safeVeld;
          const dateSpan = f.datum ? `<span class="do-tab-date">${safeDatum}</span>` : "";
          return `<button id="do-tab-${i}" class="do-tab${i === 0 ? " active" : ""}" type="button" role="tab" aria-selected="${i === 0 ? "true" : "false"}" aria-controls="do-panel-${i}" tabindex="${i === 0 ? "0" : "-1"}" data-panel-idx="${i}" title="${tooltip}"><span class="do-tab-name">${safeVeld}</span>${dateSpan}</button>`;
        })
        .join("")}</div>`
    : "";

  const panelsHtml = fields
    .map((f, i) => `
  <div id="do-panel-${i}" class="do-field-block do-panel${i === 0 ? " active" : ""}" role="${useTabs ? "tabpanel" : "group"}" ${useTabs ? `aria-labelledby="do-tab-${i}"` : ""} data-panel-idx="${i}">
    ${useTabs ? "" : `<div class="do-field-title">${escapeHtml(f.veld)}</div>`}

    <div class="do-columns">
      <div class="do-col">
        <div class="do-col-header do-col-header--old">
          <span class="do-col-label">Oud</span>
          <button class="do-copy-btn" data-copy="old" type="button" title="Kopieer oude tekst" aria-label="Kopieer oude tekst">
            <i class="fa-solid fa-copy"></i>
            <span class="btn-label">Kopieer</span>
          </button>
        </div>
        <div class="do-old">${f.diff.left}</div>
      </div>

      <div class="do-col">
        <div class="do-col-header do-col-header--new">
          <span class="do-col-label">Nieuw</span>
          <button class="do-copy-btn" data-copy="new" type="button" title="Kopieer nieuwe tekst" aria-label="Kopieer nieuwe tekst">
            <i class="fa-solid fa-copy"></i>
            <span class="btn-label">Kopieer</span>
          </button>
        </div>
        <div class="do-new">${f.diff.right}</div>
      </div>
    </div>
  </div>`)
    .join("");

  const html = `
<div class="do-modal" role="dialog" aria-modal="true" aria-labelledby="do-modal-title">
  <div class="do-header">
    <div class="do-header-main">
      <h2 id="do-modal-title">Mutatievergelijking</h2>
      <span class="do-summary">${escapeHtml(summary)}</span>
    </div>
    <div class="do-header-aside">
      <div class="do-legend" aria-hidden="true">
        <span class="do-legend-item"><span class="do-legend-dot do-legend-dot--removed"></span>Oud</span>
        <span class="do-legend-item"><span class="do-legend-dot do-legend-dot--added"></span>Nieuw</span>
      </div>
      <button id="do-close-x" type="button" class="do-close-x" aria-label="Sluiten" title="Sluiten (Esc)">&times;</button>
    </div>
  </div>
  ${tabsHtml}
  <div class="do-content">${panelsHtml}
  </div>

  <div class="do-footer">
    <button id="do-close" type="button" class="do-close-btn">
      Sluiten
    </button>
  </div>
</div>`;


  overlay.innerHTML = html;
  document.body.appendChild(overlay);

  const previouslyFocused =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;

  function closeOverlay() {
    document.removeEventListener("keydown", onKeyDown);
    overlay.remove();
    previouslyFocused?.focus?.();
  }

  function onKeyDown(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      closeOverlay();
    }
  }

  document.addEventListener("keydown", onKeyDown);

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeOverlay();
  });

  document.getElementById("do-close").onclick = closeOverlay;
  document.getElementById("do-close-x").onclick = closeOverlay;

  // === TABS ===
  const tabBtns = Array.from(overlay.querySelectorAll(".do-tab"));
  const panels = Array.from(overlay.querySelectorAll(".do-panel"));

  function activateTab(idx) {
    tabBtns.forEach((t, i) => {
      const active = i === idx;
      t.classList.toggle("active", active);
      t.setAttribute("aria-selected", active ? "true" : "false");
      t.tabIndex = active ? 0 : -1;
    });
    panels.forEach((p, i) => p.classList.toggle("active", i === idx));
    const activePanel = panels[idx];
    if (activePanel) autoAdjustColumnWidth(activePanel);
  }

  tabBtns.forEach((tab, i) => {
    tab.addEventListener("click", () => activateTab(i));
  });

  const tabsContainer = overlay.querySelector(".do-tabs");
  if (tabsContainer) {
    tabsContainer.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      const dir = e.key === "ArrowRight" ? 1 : -1;
      const cur = tabBtns.findIndex((t) => t.classList.contains("active"));
      const next = (cur + dir + tabBtns.length) % tabBtns.length;
      activateTab(next);
      tabBtns[next].focus();
    });
  }

  // === SCROLL SYNC ===
  const olds = overlay.querySelectorAll(".do-old");
  const news = overlay.querySelectorAll(".do-new");

  olds.forEach((oldCol, i) => {
    const newCol = news[i];
    let isSyncing = false;

    oldCol.addEventListener("scroll", () => {
      if (isSyncing) return;
      isSyncing = true;
      newCol.scrollTop = oldCol.scrollTop;
      newCol.scrollLeft = oldCol.scrollLeft;
      isSyncing = false;
    });

    newCol.addEventListener("scroll", () => {
      if (isSyncing) return;
      isSyncing = true;
      oldCol.scrollTop = newCol.scrollTop;
      oldCol.scrollLeft = newCol.scrollLeft;
      isSyncing = false;
    });
  });

	  // === COPY BUTTONS ===
	overlay.querySelectorAll(".do-copy-btn").forEach(btn => {

	  btn.addEventListener("click", async () => {

		const isOld = btn.dataset.copy === "old";
		const container = btn.closest(".do-col")
							 .querySelector(isOld ? ".do-old" : ".do-new");

		const text = extractPlainText(container);

		try {
		  await navigator.clipboard.writeText(text);

		  btn.innerHTML = `
			<i class="fa-solid fa-check"></i>
			<span class="btn-label">Gekopieerd</span>
		  `;
		  btn.classList.add("copied");

		  setTimeout(() => {
			btn.innerHTML = `
			  <i class="fa-solid fa-copy"></i>
			  <span class="btn-label">Kopieer</span>
			`;
			btn.classList.remove("copied");
		  }, 1500);

		} catch (err) {
		  console.error("Clipboard error:", err);
		}

	  });

	});

  const initialPanel = panels[0];
  if (initialPanel) autoAdjustColumnWidth(initialPanel);
}


	function extractPlainText(container) {
	  const lines = [];

	  container.querySelectorAll("div").forEach(div => {
		const clone = div.cloneNode(true);

		// verwijder line number
		const ln = clone.querySelector(".ln");
		if (ln) ln.remove();

		lines.push(clone.innerText);
	  });

	  return lines.join("\n");
	}
	  
  function autoAdjustColumnWidth(scope) {
	  const columns = scope.querySelectorAll(".do-old, .do-new");

	  columns.forEach(col => {
		const lines = col.querySelectorAll("div");
		let maxWidth = 0;

		lines.forEach(line => {
		  const clone = line.cloneNode(true);
		  clone.style.position = "absolute";
		  clone.style.visibility = "hidden";
		  clone.style.whiteSpace = "pre";
		  clone.style.width = "auto";
		  document.body.appendChild(clone);

		  const width = clone.scrollWidth;
		  document.body.removeChild(clone);

		  if (width > maxWidth) {
			maxWidth = width;
		  }
		});

		const currentWidth = col.clientWidth;

		if (maxWidth > currentWidth) {
		  // force smaller basis so overflow zichtbaar wordt
		  col.style.flex = "0 0 " + currentWidth + "px";
		} else {
		  col.style.flex = "1";
		}
	  });
	}


	function ensureButton() {
	  const grid = getGrid();
	  const container = getGridContainer();
	  if (!grid || !container) return;

	  const legendRow = container.parentElement?.querySelector(".table-legend-row");
	  const menuRight = legendRow?.querySelector(".menu-right");

	  let btn = document.getElementById("do-compare-btn");

	  if (btn) {
		// Re-home the button if menu-right became available later (or if a
		// re-render moved it elsewhere) so it doesn't stay in the fallback spot.
		if (menuRight && btn.parentElement !== menuRight) {
		  menuRight.insertBefore(btn, menuRight.firstChild);
		}
		return;
	  }

	  btn = document.createElement("button");
	  btn.id = "do-compare-btn";
	  btn.type = "button";
	  btn.innerText = "Vergelijk mutaties";
	  btn.onclick = openComparison;

	  if (menuRight) {
		menuRight.insertBefore(btn, menuRight.firstChild);
	  } else {
		container.prepend(btn);
	  }
	}

  function startObservingDom() {
    if (domObserver) return;

    domObserver = new MutationObserver(() => {
      const btn = document.getElementById("do-compare-btn");
      if (btn && btn.parentElement?.classList.contains("menu-right")) {
        return;
      }
      scheduleEnsureButton();
    });

    domObserver.observe(document.body, {
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
    startObservingDom();
    scheduleEnsureButton();
  }

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
