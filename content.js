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

        const ignoreClearTarget =
          clickTarget instanceof Element &&
          clickTarget.closest(
            "#do-compare-btn, #do-compare-slot, #do-overlay"
          );

        if (ignoreClearTarget) return;

        if (
          !gridContainer ||
          !clickTarget ||
          !gridContainer.contains(clickTarget)
        ) {
          clearSelection();
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
  </div>

  <div class="do-content">
`;

rows.forEach((row) => {

  const veld = getCellValue(row, 6);
  const oud = getCellValue(row, 7);
  const nieuw = getCellValue(row, 8);

  const diff = renderFormattedDiff(oud, nieuw);

  html += `
  <div class="do-field-block">
    <div class="do-field-title">${escapeHtml(veld)}</div>

    <div class="do-columns">
      <div class="do-col">
        <div class="do-col-header">
          <button class="do-copy-btn" data-copy="old" title="Kopieer oude tekst">
            <i class="fa-solid fa-copy"></i>
            <span class="btn-label">Oud</span>
          </button>
        </div>
        <div class="do-old">${diff.left}</div>
      </div>

      <div class="do-col">
        <div class="do-col-header">
          <button class="do-copy-btn" data-copy="new" title="Kopieer nieuwe tekst">
            <i class="fa-solid fa-copy"></i>
            <span class="btn-label">Nieuw</span>
          </button>
        </div>
        <div class="do-new">${diff.right}</div>
      </div>
    </div>
  </div>
  `;
});

// ✅ NU pas afsluiten
html += `
  </div>

  <div class="do-footer">
    <button id="do-close" type="button" class="do-close-btn">
      Sluiten
    </button>
  </div>
</div>`;


  overlay.innerHTML = html;
  document.body.appendChild(overlay);

  document.getElementById("do-close").onclick = () =>
    overlay.remove();

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

		  // Bewaar originele tekst
		  const originalLabel = isOld ? "Oud" : "Nieuw";

		  // Zet check-icoon
		  btn.innerHTML = `
			<i class="fa-solid fa-check"></i>
			Gekopieerd
		  `;

		  btn.classList.add("copied");

		  setTimeout(() => {
			btn.innerHTML = `
			  <i class="fa-solid fa-copy"></i>
			  ${originalLabel}
			`;
			btn.classList.remove("copied");
		  }, 1500);

		} catch (err) {
		  console.error("Clipboard error:", err);
		}

	  });

	});

  autoAdjustColumnWidth(overlay);
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
	  
  function autoAdjustColumnWidth(overlay) {
	  const columns = overlay.querySelectorAll(".do-old, .do-new");

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
	  const existingBtn = document.getElementById("do-compare-btn");

	  if (!grid || !container) return;

	  if (existingBtn) return;

	  const legendRow = container.parentElement?.querySelector(".table-legend-row");
	  const menuRight = legendRow?.querySelector(".menu-right");

	  const btn = document.createElement("button");
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

  function observeDom() {
    const observer = new MutationObserver(() => {
      scheduleEnsureButton();
    });

    observer.observe(document.body, {
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
