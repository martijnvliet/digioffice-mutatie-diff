function decodeHtml(str) {
  const txt = document.createElement("textarea");
  txt.innerHTML = str ?? "";
  return txt.value;
}

function escapeHtml(str) {
  return (str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildLcsMatrix(a, b) {
  const matrix = Array(a.length + 1)
    .fill(null)
    .map(() => Array(b.length + 1).fill(0));

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

function diffSequences(a, b) {
  const matrix = buildLcsMatrix(a, b);
  const result = [];

  let i = 0;
  let j = 0;

  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      result.push({ type: "equal", value: a[i] });
      i++;
      j++;
    } else if (matrix[i + 1][j] >= matrix[i][j + 1]) {
      result.push({ type: "removed", value: a[i] });
      i++;
    } else {
      result.push({ type: "added", value: b[j] });
      j++;
    }
  }

  while (i < a.length) result.push({ type: "removed", value: a[i++] });
  while (j < b.length) result.push({ type: "added", value: b[j++] });

  return result;
}

function diffLines(oldLines, newLines) {
  return diffSequences(oldLines, newLines).map((part) => ({
    type: part.type,
    old: part.type === "added" ? "" : part.value,
    new: part.type === "removed" ? "" : part.value
  }));
}

function tryPairRemovedAdded(diff) {
  let i = 0;
  while (i < diff.length) {
    if (diff[i].type === "equal") {
      i++;
      continue;
    }

    const removeds = [];
    const addeds = [];
    while (i < diff.length && diff[i].type !== "equal") {
      if (diff[i].type === "removed") removeds.push(diff[i]);
      else if (diff[i].type === "added") addeds.push(diff[i]);
      i++;
    }

    const pairCount = Math.min(removeds.length, addeds.length);
    for (let k = 0; k < pairCount; k++) {
      removeds[k].type = "changed";
      removeds[k].new = addeds[k].new;
      addeds[k].type = "paired";
    }
  }

  return diff.filter((d) => d.type !== "paired");
}

function wordDiff(a, b) {
  const aw = a.split(/(\s+)/);
  const bw = b.split(/(\s+)/);
  const parts = diffSequences(aw, bw);

  let left = "";
  let right = "";

  for (const p of parts) {
    const html = escapeHtml(p.value);
    if (p.type === "equal") {
      left += html;
      right += html;
    } else if (p.type === "removed") {
      if (p.value !== "") left += `<span class="wdiff-removed">${html}</span>`;
    } else {
      if (p.value !== "") right += `<span class="wdiff-added">${html}</span>`;
    }
  }

  return { left, right };
}

// Cap the LCS line matrix to keep memory + time reasonable on huge diffs.
const LCS_CELL_LIMIT = 1_500_000;

function renderLargeDiff(oldLines, newLines) {
  const dump = (lines, cls) =>
    lines
      .map(
        (line, idx) =>
          `<div class="${cls}"><span class="ln">${idx + 1}</span>${escapeHtml(line)}</div>`
      )
      .join("");

  return {
    left: dump(oldLines, ""),
    right: dump(newLines, ""),
    truncated: true
  };
}

function renderDiff(oldText, newText) {
  oldText = decodeHtml(oldText || "");
  newText = decodeHtml(newText || "");

  const oldLines = oldText.replace(/\r\n/g, "\n").split("\n");
  const newLines = newText.replace(/\r\n/g, "\n").split("\n");

  if (oldLines.length * newLines.length > LCS_CELL_LIMIT) {
    return renderLargeDiff(oldLines, newLines);
  }

  let diff = diffLines(oldLines, newLines);
  diff = tryPairRemovedAdded(diff);

  let left = "";
  let right = "";
  let oldLn = 1;
  let newLn = 1;

  for (const part of diff) {
    if (part.type === "equal") {
      left += `<div><span class="ln">${oldLn}</span>${escapeHtml(part.old)}</div>`;
      right += `<div><span class="ln">${newLn}</span>${escapeHtml(part.new)}</div>`;
      oldLn++;
      newLn++;
    } else if (part.type === "removed") {
      left += `<div class="diff-removed"><span class="ln">${oldLn}</span>${escapeHtml(part.old)}</div>`;
      right += `<div class="diff-removed-empty"><span class="ln"></span></div>`;
      oldLn++;
    } else if (part.type === "added") {
      left += `<div class="diff-empty"><span class="ln"></span></div>`;
      right += `<div class="diff-added"><span class="ln">${newLn}</span>${escapeHtml(part.new)}</div>`;
      newLn++;
    } else if (part.type === "changed") {
      const wd = wordDiff(part.old, part.new);
      left += `<div class="diff-removed"><span class="ln">${oldLn}</span>${wd.left}</div>`;
      right += `<div class="diff-added"><span class="ln">${newLn}</span>${wd.right}</div>`;
      oldLn++;
      newLn++;
    }
  }

  return { left, right };
}
