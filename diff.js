
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
      if (wa) left += `<span class="wdiff-removed">${escapeHtml(wa)}</span>`;
      if (wb) right += `<span class="wdiff-added">${escapeHtml(wb)}</span>`;
    }
  }

  return { left, right };
}

function buildLcsMatrix(a, b) {
  const matrix = Array(a.length + 1).fill(null).map(() =>
    Array(b.length + 1).fill(0)
  );

  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      if (a[i] === b[j]) {
        matrix[i][j] = matrix[i + 1][j + 1] + 1;
      } else {
        matrix[i][j] = Math.max(matrix[i + 1][j], matrix[i][j + 1]);
      }
    }
  }

  return matrix;
}

function diffLines(oldLines, newLines) {
  const matrix = buildLcsMatrix(oldLines, newLines);
  const result = [];

  let i = 0;
  let j = 0;

  while (i < oldLines.length && j < newLines.length) {
    if (oldLines[i] === newLines[j]) {
      result.push({ type: "equal", old: oldLines[i], new: newLines[j] });
      i++;
      j++;
    } else if (matrix[i + 1][j] >= matrix[i][j + 1]) {
      result.push({ type: "removed", old: oldLines[i], new: "" });
      i++;
    } else {
      result.push({ type: "added", old: "", new: newLines[j] });
      j++;
    }
  }

  while (i < oldLines.length) {
    result.push({ type: "removed", old: oldLines[i++], new: "" });
  }

  while (j < newLines.length) {
    result.push({ type: "added", old: "", new: newLines[j++] });
  }

  return result;
}

function tryPairRemovedAdded(diff) {
  for (let i = 0; i < diff.length; i++) {
    const current = diff[i];

    if (current.type !== "removed") continue;

    for (let j = i + 1; j < diff.length; j++) {
      const candidate = diff[j];

      if (candidate.type !== "added") continue;

      if (
        (current.old.trim() === "" && candidate.new.trim() !== "") ||
        similarity(current.old, candidate.new) > 0.5
      ) {
        current.type = "changed";
        current.new = candidate.new;
        candidate.type = "paired";
        break;
      }
    }
  }

  return diff.filter(d => d.type !== "paired");
}


function similarity(a, b) {
  const minLen = Math.min(a.length, b.length);
  let same = 0;

  for (let i = 0; i < minLen; i++) {
    if (a[i] === b[i]) same++;
  }

  return same / Math.max(a.length, b.length);
}

function renderDiff(oldText, newText) {
  oldText = decodeHtml(oldText || "");
  newText = decodeHtml(newText || "");

  const oldLines = oldText.replace(/\r\n/g, "\n").split("\n");
  const newLines = newText.replace(/\r\n/g, "\n").split("\n");

  let diff = diffLines(oldLines, newLines);
  diff = tryPairRemovedAdded(diff);

  let left = "";
  let right = "";

  diff.forEach((part, index) => {

  const ln = `<span class="ln">${index + 1}</span>`;

  if (part.type === "equal") {
    left += `<div>${ln}${escapeHtml(part.old)}</div>`;
    right += `<div>${ln}${escapeHtml(part.new)}</div>`;
  }

  if (part.type === "removed") {
    left += `<div class="diff-removed">${ln}${escapeHtml(part.old)}</div>`;
    right += `<div class="diff-removed-empty">${ln}</div>`;
  }

  if (part.type === "added") {
    left += `<div class="diff-empty">${ln}</div>`;
    right += `<div class="diff-added">${ln}${escapeHtml(part.new)}</div>`;
  }

  if (part.type === "changed") {
    const wd = wordDiff(part.old, part.new);

    left += `<div class="diff-removed">${ln}${wd.left}</div>`;
    right += `<div class="diff-added">${ln}${wd.right}</div>`;
  }

});

// ✅ return NA de loop
return { left, right };

}
