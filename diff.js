function decodeHtml(str) {
  const txt = document.createElement("textarea");
  txt.innerHTML = str ?? "";
  return txt.value;
}

function escapeHtml(str) {
  return (str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function diffChars(oldStr, newStr) {
  const result = [];
  let i = 0;
  let j = 0;

  while (i < oldStr.length || j < newStr.length) {
    if (oldStr[i] === newStr[j]) {
      result.push({ type: "equal", value: oldStr[i] });
      i++;
      j++;
    } else {
      if (oldStr[i]) {
        result.push({ type: "removed", value: oldStr[i] });
        i++;
      }
      if (newStr[j]) {
        result.push({ type: "added", value: newStr[j] });
        j++;
      }
    }
  }

  return result;
}

function wordDiff(a, b) {
  const aw = a.split(/(\s+)/);
  const bw = b.split(/(\s+)/);
  const max = Math.max(aw.length, bw.length);

  let left = "";
  let right = "";

  for (let i = 0; i < max; i++) {
    const wa = aw[i] ?? "";
    const wb = bw[i] ?? "";

    if (wa === wb) {
      left += escapeHtml(wa);
      right += escapeHtml(wb);
    } else {
      if (wa) {
        left += `<span class="wdiff-removed">${escapeHtml(wa)}</span>`;
      }
      if (wb) {
        right += `<span class="wdiff-added">${escapeHtml(wb)}</span>`;
      }
    }
  }

  return { left, right };
}

function renderDiff(oldText, newText) {
  oldText = decodeHtml(oldText || "");
  newText = decodeHtml(newText || "");

  const oldLines = oldText.split(/\r?\n/);
  const newLines = newText.split(/\r?\n/);
  const max = Math.max(oldLines.length, newLines.length);

  let left = "";
  let right = "";

  for (let i = 0; i < max; i++) {
    const o = oldLines[i] ?? "";
    const n = newLines[i] ?? "";

    let clsLeft = "";
    let clsRight = "";

    let renderedLeft = escapeHtml(o);
    let renderedRight = escapeHtml(n);

    if (o !== n) {
      clsLeft = o ? "diff-removed" : "";
      clsRight = n ? "diff-added" : "";

      const wd = wordDiff(o, n);
      renderedLeft = wd.left;
      renderedRight = wd.right;
    }

    left += `<div class="${clsLeft}"><span class="ln">${i + 1}</span>${renderedLeft}</div>`;
    right += `<div class="${clsRight}"><span class="ln">${i + 1}</span>${renderedRight}</div>`;
  }

  return { left, right };
}
