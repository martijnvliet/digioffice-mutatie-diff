(function () {
  if (window.__digiofficeMutatieDiffLoaded) return;
  window.__digiofficeMutatieDiffLoaded = true;

  const selectedRows = new Set();
  let ensureScheduled = false;
  let domObserver = null;

  function clearSelection() {
    selectedRows.forEach((row) => row.classList.remove("do-selected"));
    selectedRows.clear();
    updateButtonState();
  }

  function updateButtonState() {
    const btn = document.getElementById("do-compare-btn");
    if (!btn) return;
    const enabled = selectedRows.size > 0;
    btn.disabled = !enabled;
    btn.title = enabled
      ? `Vergelijk ${selectedRows.size} geselecteerde mutatie${selectedRows.size === 1 ? "" : "s"}`
      : "Selecteer eerst één of meer regels in de grid";
  }

  function getGridContainer() {
    return document.querySelector('[id$="_grdChangeLog"]');
  }

  function getGrid() {
    const container = getGridContainer();
    if (!container) return null;
    return container.querySelector(".table-data table");
  }

  // State-machine XML/HTML pretty-printer that respects quoted attribute
  // values (so `<tag attr="a>b">` is not split mid-attribute), and skips
  // indent changes inside comments, CDATA and processing instructions.
  function smartFormat(text) {
    if (!text) return "";

    if (!/<\/?[a-zA-Z][^>]*>/.test(text)) return text;

    const segments = [];
    let i = 0;
    while (i < text.length) {
      if (text.startsWith("<!--", i)) {
        const end = text.indexOf("-->", i + 4);
        const stop = end === -1 ? text.length : end + 3;
        segments.push({ kind: "comment", text: text.slice(i, stop) });
        i = stop;
        continue;
      }
      if (text.startsWith("<![CDATA[", i)) {
        const end = text.indexOf("]]>", i + 9);
        const stop = end === -1 ? text.length : end + 3;
        segments.push({ kind: "cdata", text: text.slice(i, stop) });
        i = stop;
        continue;
      }
      if (text[i] === "<") {
        let j = i + 1;
        let inQuote = null;
        while (j < text.length) {
          const c = text[j];
          if (inQuote) {
            if (c === inQuote) inQuote = null;
          } else if (c === '"' || c === "'") {
            inQuote = c;
          } else if (c === ">") {
            j++;
            break;
          }
          j++;
        }
        const raw = text.slice(i, j);
        let kind = "tag";
        if (raw.startsWith("<?")) kind = "processing";
        else if (raw.startsWith("<!")) kind = "declaration";
        else if (raw.startsWith("</")) kind = "close";
        else if (/\/\s*>$/.test(raw)) kind = "selfclose";
        else kind = "open";
        segments.push({ kind, text: raw });
        i = j;
      } else {
        let j = i;
        while (j < text.length && text[j] !== "<") j++;
        const chunk = text.slice(i, j);
        if (chunk.trim()) segments.push({ kind: "text", text: chunk.trim() });
        i = j;
      }
    }

    let formatted = "";
    let indent = 0;
    const PAD = (n) => "  ".repeat(Math.max(n, 0));

    for (const seg of segments) {
      if (seg.kind === "close") indent--;
      formatted += PAD(indent) + seg.text + "\n";
      if (seg.kind === "open") indent++;
    }

    return formatted.trim();
  }

  function normalizeWhitespace(text) {
    return text
      .split("\n")
      .map((line) => line.replace(/[ \t]+/g, " ").trim())
      .filter((line) => line.length > 0)
      .join("\n");
  }

  function renderFormattedDiff(oldText, newText, opts = {}) {
    let oldFormatted = smartFormat(decodeHtml(oldText || "")).trimEnd();
    let newFormatted = smartFormat(decodeHtml(newText || "")).trimEnd();

    if (opts.ignoreWhitespace) {
      oldFormatted = normalizeWhitespace(oldFormatted);
      newFormatted = normalizeWhitespace(newFormatted);
    }

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

        const row = clickTarget.closest(".table-data tbody tr[id][vi]");
        if (!row || !row.querySelector("td")) return;

        if (!e.ctrlKey) clearSelection();

        if (selectedRows.has(row)) {
          selectedRows.delete(row);
          row.classList.remove("do-selected");
        } else {
          selectedRows.add(row);
          row.classList.add("do-selected");
        }

        updateButtonState();
      },
      true
    );
  }

  function getSelectedRows() {
    return Array.from(selectedRows);
  }

  function normalizeGridText(value) {
    if (!value) return "";

    let text = decodeHtml(value).replace(/ /g, " ").trim();

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

    const multiline = candidates.find((candidate) => candidate.includes("\n"));
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

  function buildPanelToolbar() {
    return `
    <div class="do-panel-toolbar">
      <div class="do-search">
        <input type="search" class="do-search-input" placeholder="Zoek in deze diff..." aria-label="Zoek in diff" />
        <span class="do-search-count" aria-live="polite"></span>
        <button type="button" class="do-icon-btn" data-search-prev title="Vorige treffer (Shift+Enter)" aria-label="Vorige treffer">&#x25B2;</button>
        <button type="button" class="do-icon-btn" data-search-next title="Volgende treffer (Enter)" aria-label="Volgende treffer">&#x25BC;</button>
      </div>
      <div class="do-nav">
        <button type="button" class="do-icon-btn do-nav-btn" data-change-prev title="Vorige wijziging (P)" aria-label="Vorige wijziging">&#x25B2; Wijziging</button>
        <button type="button" class="do-icon-btn do-nav-btn" data-change-next title="Volgende wijziging (N)" aria-label="Volgende wijziging">&#x25BC; Wijziging</button>
      </div>
    </div>`;
  }

  function buildPanelHtml(field, index, useSidebar) {
    const safeVeld = escapeHtml(field.veld);
    const titleHtml = useSidebar
      ? ""
      : `<div class="do-field-title">${safeVeld}</div>`;
    const truncatedNotice = field.diff.truncated
      ? `<div class="do-truncated-notice">Diff is te groot voor een regel-vergelijking; de oude en nieuwe tekst worden ongekleurd naast elkaar getoond.</div>`
      : "";

    return `
  <div id="do-panel-${index}" class="do-field-block do-panel${index === 0 ? " active" : ""}" role="${useSidebar ? "tabpanel" : "group"}" ${useSidebar ? `aria-labelledby="do-sidebar-item-${index}"` : ""} data-panel-idx="${index}">
    ${titleHtml}
    ${buildPanelToolbar()}
    ${truncatedNotice}
    <div class="do-columns">
      <div class="do-col">
        <div class="do-col-header do-col-header--old">
          <span class="do-col-label">Oud</span>
          <button class="do-copy-btn" data-copy="old" type="button" title="Kopieer oude tekst" aria-label="Kopieer oude tekst">
            <i class="fa-solid fa-copy"></i>
            <span class="btn-label">Kopieer</span>
          </button>
        </div>
        <div class="do-old">${field.diff.left}</div>
      </div>

      <div class="do-col">
        <div class="do-col-header do-col-header--new">
          <span class="do-col-label">Nieuw</span>
          <button class="do-copy-btn" data-copy="new" type="button" title="Kopieer nieuwe tekst" aria-label="Kopieer nieuwe tekst">
            <i class="fa-solid fa-copy"></i>
            <span class="btn-label">Kopieer</span>
          </button>
        </div>
        <div class="do-new">${field.diff.right}</div>
      </div>
    </div>
  </div>`;
  }

  function openComparison() {
    const rows = getSelectedRows();
    if (!rows.length) return;

    const cols = detectColumnIndices();
    let ignoreWhitespace = false;

    function buildFields() {
      return rows.map((row) => ({
        veld: getCellValue(row, cols.veld),
        datum: getCellValue(row, cols.datum),
        diff: renderFormattedDiff(
          getCellValue(row, cols.oud),
          getCellValue(row, cols.nieuw),
          { ignoreWhitespace }
        )
      }));
    }

    let fields = buildFields();
    const useSidebar = fields.length > 1;
    const summary = `${fields.length} veld${fields.length === 1 ? "" : "en"} geselecteerd`;

    const sidebarHtml = useSidebar
      ? `<aside class="do-sidebar" aria-label="Velden">
    <div class="do-sidebar-header">Velden (${fields.length})</div>
    <div class="do-sidebar-list" role="listbox" aria-label="Velden">${fields
      .map((f, i) => {
        const safeVeld = escapeHtml(f.veld);
        const safeDatum = escapeHtml(f.datum);
        const tooltip = f.datum ? `${safeVeld} — ${safeDatum}` : safeVeld;
        const dateSpan = f.datum
          ? `<span class="do-sidebar-date">${safeDatum}</span>`
          : "";
        return `<button id="do-sidebar-item-${i}" class="do-sidebar-item${i === 0 ? " active" : ""}" type="button" role="option" aria-selected="${i === 0 ? "true" : "false"}" aria-controls="do-panel-${i}" tabindex="${i === 0 ? "0" : "-1"}" data-panel-idx="${i}" title="${tooltip}"><span class="do-sidebar-name">${safeVeld}</span>${dateSpan}</button>`;
      })
      .join("")}</div>
  </aside>`
      : "";

    const overlay = document.createElement("div");
    overlay.id = "do-overlay";

    overlay.innerHTML = `
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
  <div class="do-body">
    ${sidebarHtml}
    <div class="do-content">${fields.map((f, i) => buildPanelHtml(f, i, useSidebar)).join("")}</div>
  </div>

  <div class="do-footer">
    <label class="do-toggle">
      <input type="checkbox" id="do-ignore-ws" />
      <span>Negeer witregels</span>
    </label>
    <button id="do-close" type="button" class="do-close-btn">Sluiten</button>
  </div>
</div>`;

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
        return;
      }
      // Global shortcuts when not in input
      const tag = e.target?.tagName;
      const inEditable = tag === "INPUT" || tag === "TEXTAREA" || e.target?.isContentEditable;
      if (!inEditable && (e.key === "n" || e.key === "p")) {
        const active = overlay.querySelector(".do-panel.active");
        if (active?.__navigateChange) {
          e.preventDefault();
          active.__navigateChange(e.key === "n" ? 1 : -1);
        }
      }
    }
    document.addEventListener("keydown", onKeyDown);

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeOverlay();
    });

    // Focus trap inside the modal
    overlay.addEventListener("keydown", (e) => {
      if (e.key !== "Tab") return;
      const focusables = overlay.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    });

    overlay.querySelector("#do-close").onclick = closeOverlay;
    overlay.querySelector("#do-close-x").onclick = closeOverlay;

    // === SIDEBAR ===
    const sidebarItems = Array.from(
      overlay.querySelectorAll(".do-sidebar-item")
    );
    let panels = Array.from(overlay.querySelectorAll(".do-panel"));

    function activatePanel(idx) {
      sidebarItems.forEach((b, i) => {
        const active = i === idx;
        b.classList.toggle("active", active);
        b.setAttribute("aria-selected", active ? "true" : "false");
        b.tabIndex = active ? 0 : -1;
      });
      panels.forEach((p, i) => p.classList.toggle("active", i === idx));
      const activePanel = panels[idx];
      if (activePanel) autoAdjustColumnWidth(activePanel);
    }

    sidebarItems.forEach((btn, i) => {
      btn.addEventListener("click", () => activatePanel(i));
    });

    const sidebarList = overlay.querySelector(".do-sidebar-list");
    if (sidebarList) {
      sidebarList.addEventListener("keydown", (e) => {
        let dir = 0;
        if (e.key === "ArrowDown" || e.key === "ArrowRight") dir = 1;
        else if (e.key === "ArrowUp" || e.key === "ArrowLeft") dir = -1;
        else return;
        e.preventDefault();
        const cur = sidebarItems.findIndex((b) =>
          b.classList.contains("active")
        );
        const next = (cur + dir + sidebarItems.length) % sidebarItems.length;
        activatePanel(next);
        sidebarItems[next].focus();
      });
    }

    function attachPanelHandlers() {
      panels.forEach((panel) => {
        attachScrollSync(panel);
        attachCopyButtons(panel);
        attachNavigation(panel);
        attachSearch(panel);
      });
    }

    function attachScrollSync(panel) {
      const oldCol = panel.querySelector(".do-old");
      const newCol = panel.querySelector(".do-new");
      if (!oldCol || !newCol) return;
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
    }

    function attachCopyButtons(panel) {
      panel.querySelectorAll(".do-copy-btn").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const isOld = btn.dataset.copy === "old";
          const container = btn
            .closest(".do-col")
            .querySelector(isOld ? ".do-old" : ".do-new");
          const text = extractPlainText(container);
          try {
            await navigator.clipboard.writeText(text);
            btn.innerHTML = `<i class="fa-solid fa-check"></i><span class="btn-label">Gekopieerd</span>`;
            btn.classList.add("copied");
            setTimeout(() => {
              btn.innerHTML = `<i class="fa-solid fa-copy"></i><span class="btn-label">Kopieer</span>`;
              btn.classList.remove("copied");
            }, 1500);
          } catch (err) {
            console.error("Clipboard error:", err);
          }
        });
      });
    }

    function attachNavigation(panel) {
      const oldCol = panel.querySelector(".do-old");
      const newCol = panel.querySelector(".do-new");
      if (!oldCol || !newCol) return;

      const oldLines = Array.from(oldCol.children);
      const newLines = Array.from(newCol.children);
      const total = Math.max(oldLines.length, newLines.length);

      const isChange = (line) =>
        !!line &&
        (line.classList.contains("diff-removed") ||
          line.classList.contains("diff-added") ||
          line.classList.contains("diff-empty") ||
          line.classList.contains("diff-removed-empty"));

      const changeIndices = [];
      for (let i = 0; i < total; i++) {
        if (isChange(oldLines[i]) || isChange(newLines[i])) {
          if (
            changeIndices.length === 0 ||
            changeIndices[changeIndices.length - 1] !== i - 1
          ) {
            changeIndices.push(i);
          } else {
            changeIndices[changeIndices.length - 1] = i;
          }
        }
      }
      const navTargets = [];
      // Re-derive starts of change blocks (above logic merged into latest; redo cleanly)
      let inBlock = false;
      for (let i = 0; i < total; i++) {
        const change = isChange(oldLines[i]) || isChange(newLines[i]);
        if (change && !inBlock) navTargets.push(i);
        inBlock = change;
      }

      let cur = -1;
      function navigate(dir) {
        if (!navTargets.length) return;
        if (cur === -1) {
          cur = dir > 0 ? 0 : navTargets.length - 1;
        } else {
          cur = (cur + dir + navTargets.length) % navTargets.length;
        }
        const idx = navTargets[cur];
        const target = oldLines[idx] || newLines[idx];
        target?.scrollIntoView({ behavior: "smooth", block: "center" });
      }

      panel.querySelector("[data-change-prev]")
        ?.addEventListener("click", () => navigate(-1));
      panel.querySelector("[data-change-next]")
        ?.addEventListener("click", () => navigate(1));

      const navBtns = panel.querySelectorAll("[data-change-prev], [data-change-next]");
      navBtns.forEach((b) => {
        if (!navTargets.length) b.disabled = true;
      });

      panel.__navigateChange = navigate;
    }

    function attachSearch(panel) {
      const input = panel.querySelector(".do-search-input");
      const counter = panel.querySelector(".do-search-count");
      const oldCol = panel.querySelector(".do-old");
      const newCol = panel.querySelector(".do-new");
      if (!input || !counter || !oldCol || !newCol) return;

      let matches = [];
      let cur = -1;
      let debounceTimer;

      function clearMarks() {
        [oldCol, newCol].forEach((col) => {
          col.querySelectorAll(".do-search-match, .do-search-current").forEach((el) => {
            el.classList.remove("do-search-match", "do-search-current");
          });
        });
      }

      function update() {
        const q = input.value.trim().toLowerCase();
        clearMarks();
        matches = [];
        cur = -1;

        if (q) {
          [oldCol, newCol].forEach((col) => {
            Array.from(col.children).forEach((line) => {
              if (line.textContent.toLowerCase().includes(q)) {
                line.classList.add("do-search-match");
                matches.push(line);
              }
            });
          });
          if (matches.length) {
            cur = 0;
            matches[0].classList.add("do-search-current");
            matches[0].scrollIntoView({ behavior: "smooth", block: "center" });
          }
        }
        renderCount();
      }

      function renderCount() {
        if (!input.value.trim()) {
          counter.textContent = "";
        } else {
          counter.textContent = matches.length
            ? `${cur + 1} / ${matches.length}`
            : "geen";
        }
      }

      function navigate(dir) {
        if (!matches.length) return;
        matches[cur]?.classList.remove("do-search-current");
        cur = (cur + dir + matches.length) % matches.length;
        matches[cur].classList.add("do-search-current");
        matches[cur].scrollIntoView({ behavior: "smooth", block: "center" });
        renderCount();
      }

      input.addEventListener("input", () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(update, 120);
      });
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          if (matches.length) navigate(e.shiftKey ? -1 : 1);
          else update();
        }
      });
      panel.querySelector("[data-search-prev]")
        ?.addEventListener("click", () => navigate(-1));
      panel.querySelector("[data-search-next]")
        ?.addEventListener("click", () => navigate(1));
    }

    attachPanelHandlers();

    // Ignore-whitespace toggle
    const ignoreWsToggle = overlay.querySelector("#do-ignore-ws");
    ignoreWsToggle?.addEventListener("change", () => {
      ignoreWhitespace = ignoreWsToggle.checked;
      const activeIdx = panels.findIndex((p) => p.classList.contains("active"));
      fields = buildFields();
      const content = overlay.querySelector(".do-content");
      content.innerHTML = fields
        .map((f, i) => buildPanelHtml(f, i, useSidebar))
        .join("");
      panels = Array.from(overlay.querySelectorAll(".do-panel"));
      attachPanelHandlers();
      activatePanel(activeIdx >= 0 ? activeIdx : 0);
    });

    // Auto-focus close-x once the modal is in the DOM
    setTimeout(() => overlay.querySelector("#do-close-x")?.focus(), 0);

    const initialPanel = panels[0];
    if (initialPanel) autoAdjustColumnWidth(initialPanel);
  }

  function extractPlainText(container) {
    const lines = [];
    container.querySelectorAll("div").forEach((div) => {
      const clone = div.cloneNode(true);
      const ln = clone.querySelector(".ln");
      if (ln) ln.remove();
      lines.push(clone.innerText);
    });
    return lines.join("\n");
  }

  function autoAdjustColumnWidth(scope) {
    const columns = scope.querySelectorAll(".do-old, .do-new");
    columns.forEach((col) => {
      const lines = col.querySelectorAll("div");
      let maxWidth = 0;
      lines.forEach((line) => {
        const clone = line.cloneNode(true);
        clone.style.position = "absolute";
        clone.style.visibility = "hidden";
        clone.style.whiteSpace = "pre";
        clone.style.width = "auto";
        document.body.appendChild(clone);
        const width = clone.scrollWidth;
        document.body.removeChild(clone);
        if (width > maxWidth) maxWidth = width;
      });
      const currentWidth = col.clientWidth;
      if (maxWidth > currentWidth) {
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
      if (menuRight && btn.parentElement !== menuRight) {
        menuRight.insertBefore(btn, menuRight.firstChild);
      }
      updateButtonState();
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

    updateButtonState();
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
