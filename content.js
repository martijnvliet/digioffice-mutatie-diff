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

    if (legendRow) {
      const rightControls = legendRow.lastElementChild instanceof Element
        ? legendRow.lastElementChild
        : null;
      const menuRoot = rightControls?.querySelector("ul.menu, .menu") || null;

      if (rightControls) {
        if (menuRoot?.parentElement === rightControls) {
          if (slot.parentElement !== rightControls) {
            rightControls.insertBefore(slot, menuRoot.nextSibling);
          }

          if (slot.previousElementSibling !== menuRoot) {
            rightControls.insertBefore(slot, menuRoot.nextSibling);
          }
        } else if (slot.parentElement !== rightControls) {
          rightControls.appendChild(slot);
        }

        if (btn.parentElement !== slot) {
          slot.appendChild(btn);
        }
        return;
      }

      if (legendRow.parentElement && slot.parentElement !== legendRow.parentElement) {
        legendRow.parentElement.insertBefore(slot, legendRow);
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
        slotParent.insertBefore(slot, controlGroup || slotParent.firstChild);
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

        const ignoreClearTarget =
          clickTarget instanceof Element &&
          clickTarget.closest("#do-compare-btn, #do-compare-slot, #do-overlay");

        if (ignoreClearTarget) {
          return;
        }

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


  function normalizeGridText(value) {
    if (!value) return "";

    let text = decodeHtml(value).replace(/\u00a0/g, " ").trim();

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
      const veld = getCellValue(row, 6);
      const oud = getCellValue(row, 7);
      const nieuw = getCellValue(row, 8);

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


  const csharpSuggestions = [
    "using",
    "namespace",
    "public",
    "private",
    "class",
    "void",
    "var",
    "new",
    "return",
    "if",
    "else",
    "foreach",
    "WSWerkstroomEntity",
    "WSProcesEntity",
    "BouwInkoopContractEntity",
    "EntityTools",
    "MetaDataFields",
    "GetMetaDataField",
    "RegistrationValue"
  ];

  const powershellSuggestions = [
    "$Document",
    "$docinfo",
    "$CurrentDocInfo",
    "$usercontrol",
    "$EntityTools",
    "$null",
    "$true",
    "$false",
    "if",
    "else",
    "foreach",
    "-eq",
    "-ne",
    "-and",
    "-or",
    "-not",
    "GetMetaDataField",
    "RegistrationValue"
  ];

  const autocompleteState = {
    panel: null,
    textarea: null,
    items: [],
    selectedIndex: 0,
    prefixStart: 0,
    prefixEnd: 0
  };

  function getEditorLanguage(textarea) {
    const title = document.title.toLowerCase();
    const iframeSrc = document.querySelector("#ifmExpressie")?.getAttribute("src") || "";
    const value = textarea.value || "";

    if (title.includes("c#") || iframeSrc.includes("Programmeertaal=2")) {
      return "csharp";
    }

    if (title.includes("powershell") || value.includes("$")) {
      return "powershell";
    }

    return "powershell";
  }

  function closeAutocomplete() {
    if (autocompleteState.panel) {
      autocompleteState.panel.remove();
    }

    autocompleteState.panel = null;
    autocompleteState.textarea = null;
    autocompleteState.items = [];
    autocompleteState.selectedIndex = 0;
  }

  function getPrefixInfo(value, cursorPos) {
    let start = cursorPos;

    while (start > 0 && /[A-Za-z0-9_$]/.test(value[start - 1])) {
      start -= 1;
    }

    return {
      start,
      end: cursorPos,
      prefix: value.slice(start, cursorPos)
    };
  }

  function getSuggestions(prefix, language) {
    const source = language === "csharp" ? csharpSuggestions : powershellSuggestions;
    const normalizedPrefix = prefix.toLowerCase();

    if (!normalizedPrefix) {
      return source.slice(0, 12);
    }

    return source
      .filter((item) => item.toLowerCase().startsWith(normalizedPrefix))
      .slice(0, 12);
  }

  function insertSuggestion(textarea, suggestion) {
    const value = textarea.value;
    const before = value.slice(0, autocompleteState.prefixStart);
    const after = value.slice(autocompleteState.prefixEnd);

    textarea.value = `${before}${suggestion}${after}`;

    const newPos = before.length + suggestion.length;
    textarea.setSelectionRange(newPos, newPos);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));

    closeAutocomplete();
    textarea.focus();
  }

  function highlightSelectedSuggestion() {
    if (!autocompleteState.panel) return;

    autocompleteState.panel
      .querySelectorAll("button")
      .forEach((button, index) => button.classList.toggle("do-intellisense-active", index === autocompleteState.selectedIndex));
  }

  function openAutocomplete(textarea, suggestions, prefixInfo) {
    closeAutocomplete();

    const panel = document.createElement("div");
    panel.id = "do-intellisense-panel";

    suggestions.forEach((suggestion, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "do-intellisense-item";
      button.textContent = suggestion;
      button.addEventListener("click", (event) => {
        event.preventDefault();
        insertSuggestion(textarea, suggestion);
      });
      panel.appendChild(button);

      if (index === 0) {
        button.classList.add("do-intellisense-active");
      }
    });

    document.body.appendChild(panel);

    const rect = textarea.getBoundingClientRect();
    panel.style.left = `${window.scrollX + rect.left}px`;
    panel.style.top = `${window.scrollY + rect.bottom + 4}px`;

    autocompleteState.panel = panel;
    autocompleteState.textarea = textarea;
    autocompleteState.items = suggestions;
    autocompleteState.selectedIndex = 0;
    autocompleteState.prefixStart = prefixInfo.start;
    autocompleteState.prefixEnd = prefixInfo.end;
  }

  function triggerAutocomplete(textarea, force = false) {
    const selectionStart = textarea.selectionStart || 0;
    const prefixInfo = getPrefixInfo(textarea.value, selectionStart);

    if (!force && !prefixInfo.prefix) {
      closeAutocomplete();
      return;
    }

    const language = getEditorLanguage(textarea);
    const suggestions = getSuggestions(prefixInfo.prefix, language);

    if (!suggestions.length) {
      closeAutocomplete();
      return;
    }

    openAutocomplete(textarea, suggestions, prefixInfo);
  }

  function isAutocompleteTarget(target) {
    return target instanceof HTMLTextAreaElement && (
      target.id.includes("Expressie") ||
      target.id.includes("txtCode") ||
      target.classList.contains("triggerSaveButtons")
    );
  }

  function handleAutocompleteKeydown(event) {
    const target = event.target;
    if (!isAutocompleteTarget(target)) return;

    if (event.ctrlKey && event.code === "Space") {
      event.preventDefault();
      triggerAutocomplete(target, true);
      return;
    }

    if (event.key === ".") {
      setTimeout(() => triggerAutocomplete(target, true), 0);
      return;
    }

    if (!autocompleteState.panel || autocompleteState.textarea !== target) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      autocompleteState.selectedIndex = (autocompleteState.selectedIndex + 1) % autocompleteState.items.length;
      highlightSelectedSuggestion();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      autocompleteState.selectedIndex =
        (autocompleteState.selectedIndex - 1 + autocompleteState.items.length) % autocompleteState.items.length;
      highlightSelectedSuggestion();
    } else if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      const selected = autocompleteState.items[autocompleteState.selectedIndex];
      if (selected) {
        insertSuggestion(target, selected);
      }
    } else if (event.key === "Escape") {
      closeAutocomplete();
    } else if (event.key.length === 1 || event.key === "Backspace") {
      setTimeout(() => triggerAutocomplete(target, true), 0);
    }
  }

  function enableEditorAutocomplete() {
    document.addEventListener("keydown", handleAutocompleteKeydown, true);

    document.addEventListener("click", (event) => {
      const target = event.target;
      const insidePanel = target instanceof Element && target.closest("#do-intellisense-panel");
      if (!insidePanel && target !== autocompleteState.textarea) {
        closeAutocomplete();
      }
    });

    document.addEventListener("scroll", () => {
      if (!autocompleteState.panel || !autocompleteState.textarea) return;
      const rect = autocompleteState.textarea.getBoundingClientRect();
      autocompleteState.panel.style.left = `${window.scrollX + rect.left}px`;
      autocompleteState.panel.style.top = `${window.scrollY + rect.bottom + 4}px`;
    }, true);
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
    enableEditorAutocomplete();
    scheduleEnsureButton();
  }

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
