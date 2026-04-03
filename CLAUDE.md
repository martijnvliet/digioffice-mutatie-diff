# CLAUDE.md — DigiOffice Mutatie Diff

This file documents the codebase structure, conventions, and development workflows for AI assistants working on this project.

## Project Overview

**DigiOffice Mutatie Diff** is a Chromium browser extension (Manifest V3) that adds a side-by-side mutation diff viewer to the DigiOffice web application. It targets the change-log grid (`*_grdChangeLog`) inside DigiOffice, adds a "Vergelijk mutaties" (Compare mutations) button, and renders a modal with line-by-line and word-by-word diff highlighting.

The UI language is Dutch.

## Repository Layout

```
digioffice-mutatie-diff/
├── manifest.json   # MV3 extension config (entry point)
├── diff.js         # Pure diff algorithm and HTML renderer
├── content.js      # DigiOffice DOM integration and modal UI
├── styles.css      # All extension styling
├── Icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```

There is no build step, no package manager, and no test framework. All files are plain vanilla JS/CSS loaded directly by the browser extension runtime.

## File Responsibilities

### `manifest.json`
- MV3 configuration; declares that `diff.js` and `content.js` are loaded (in that order) as content scripts on every page (`*://*/*`) at `document_idle`.
- `all_frames: true` and `match_about_blank: true` ensure the extension works inside iframes (DigiOffice uses them).

### `diff.js`
Loaded first; defines global helper functions used by `content.js`.

| Function | Purpose |
|---|---|
| `decodeHtml(str)` | Decodes HTML entities via a temporary `<textarea>` |
| `escapeHtml(str)` | Escapes `&`, `<`, `>` for safe HTML injection |
| `similarity(a, b)` | Character-level similarity ratio (0–1) used for pairing heuristic |
| `buildLcsMatrix(a, b)` | Builds LCS (Longest Common Subsequence) DP matrix over string arrays |
| `diffLines(oldLines, newLines)` | Produces a list of `{type, old, new}` records using the LCS matrix |
| `tryPairRemovedAdded(diff)` | Post-processes diff to pair nearby `removed`+`added` entries into `changed` when similarity > 0.5; removes paired entries |
| `wordDiff(a, b)` | Simple positional word diff (split on whitespace); returns `{left, right}` HTML strings with `wdiff-removed`/`wdiff-added` spans |
| `renderDiff(oldText, newText)` | Orchestrates the full pipeline: decode → split lines → `diffLines` → `tryPairRemovedAdded` → render HTML; returns `{left, right}` |

Diff entry types after `tryPairRemovedAdded`:
- `equal` — line unchanged; shown on both sides
- `removed` — line only in old; left side colored, right side empty placeholder
- `added` — line only in new; left side empty placeholder, right side colored
- `changed` — paired removed+added; both sides shown with word-level highlighting
- `paired` — consumed during pairing; filtered out before rendering

### `content.js`
Wrapped in an IIFE. Manages all DigiOffice-specific logic.

Key responsibilities and their implementation:

| Concern | Implementation |
|---|---|
| Grid detection | `getGridContainer()` — `querySelector('[id$="_grdChangeLog"]')` |
| Table detection | `getGrid()` — `.table-data table` inside the container |
| Row multi-select | `enableRowTracking()` — captures click events at capture phase; Ctrl+click toggles, plain click resets selection; adds/removes `do-selected` CSS class |
| Cell extraction | `getCellValue(row, col)` — reads `td[col="N"]`; prefers `title` attribute over `textContent`; prefers multiline candidate over single-line; picks longest when equal |
| Text normalization | `normalizeGridText(value)` — decodes HTML entities, replaces `\u00a0` with space, unescapes literal `\r\n`/`\n`/`\r` sequences |
| XML/HTML formatting | `smartFormat(text)` — detects markup by `<`/`>` heuristic; naively indents tags for readability |
| Comparison modal | `openComparison()` — builds HTML string for all selected rows, appends overlay to `document.body`; columns 6/7/8 = field name / old value / new value |
| Scroll sync | Bidirectional sync of `scrollTop`/`scrollLeft` between `.do-old` and `.do-new` using an `isSyncing` guard |
| Copy to clipboard | `.do-copy-btn` buttons use `navigator.clipboard.writeText`; label swaps to "Gekopieerd" + checkmark for 1.5 s; `extractPlainText` strips `.ln` line-number spans |
| Column width | `autoAdjustColumnWidth()` — clones each diff line offscreen to measure natural width; sets `flex: 0 0 <w>px` when content overflows |
| Button injection | `ensureButton()` — inserts `#do-compare-btn` into `.menu-right` if present, else prepends to container |
| DOM observation | `MutationObserver` on `document.body` triggers `scheduleEnsureButton()` via `requestAnimationFrame` to batch re-checks |

Execution order inside `init()`:
1. `enableRowTracking()` — attach click listener
2. `observeDom()` — start MutationObserver
3. `scheduleEnsureButton()` — immediate check

`init()` is deferred with `DOMContentLoaded` if the document is still loading, otherwise called synchronously.

### `styles.css`
All classes are prefixed with `do-` (DigiOffice) to avoid conflicts with the host page.

Key classes:

| Class / ID | Purpose |
|---|---|
| `#do-compare-btn` | "Vergelijk mutaties" button; brand color `#2f4f79` |
| `#do-overlay` | Full-screen semi-transparent backdrop |
| `.do-modal` | Resizable modal (`resize: both`); `80vw × 80vh`, min `600×400px` |
| `.do-header` | Sticky title bar |
| `.do-content` | Scrollable content area |
| `.do-columns` | Flex row containing `.do-col` items |
| `.do-old` / `.do-new` | Diff panes; `overflow-x: scroll`; `max-height: 52vh`; monospace `Consolas 13px` |
| `.ln` | Line number span; `48px` wide; non-selectable |
| `.diff-added` / `.diff-removed` | Line-level backgrounds (`#e6ffed` / `#ffeef0`) |
| `.diff-empty` / `.diff-removed-empty` | Placeholder lines |
| `.wdiff-added` / `.wdiff-removed` | Word-level backgrounds (stronger: `#acf2bd` / `#fdb8c0`) |
| `.do-selected` | Selected row outline (`2px solid #2f4f79`) |
| `.do-copy-btn` | Copy button in column header |

Note: `.diff-added`, `.diff-removed`, `.wdiff-added`, and `.wdiff-removed` are each defined twice in the file (duplicates). This is harmless but should not be increased.

## Development Workflow

### Loading the extension locally

1. Open `chrome://extensions` (or `edge://extensions`).
2. Enable **Developer mode**.
3. Click **Load unpacked** and select this directory.
4. After any file change, click the reload icon next to the extension in `chrome://extensions`.

### Testing

There is no automated test suite. Manual testing steps:
1. Load the extension as unpacked.
2. Open a DigiOffice instance in the browser.
3. Navigate to a page containing a change-log grid.
4. Verify the "Vergelijk mutaties" button appears in the toolbar.
5. Ctrl+click multiple rows, then click the button to open the diff modal.
6. Verify diff highlighting, scroll sync, and copy buttons work correctly.

### Making changes

- **`diff.js`** is purely algorithmic; it has no DOM dependencies. Changes here should preserve the `renderDiff(oldText, newText) → {left, right}` interface consumed by `content.js`.
- **`content.js`** depends on the DigiOffice DOM structure. The grid container ID selector `[id$="_grdChangeLog"]` and column indices (6 = field, 7 = old, 8 = new) are the main coupling points.
- **`styles.css`** — all selectors are scoped to `do-*` IDs/classes. Do not use generic element selectors that could conflict with DigiOffice's own styles.
- **`manifest.json`** — script load order matters: `diff.js` must be listed before `content.js` because `content.js` calls `renderDiff` and `escapeHtml` defined in `diff.js`.

## Key Conventions

- No external dependencies; keep the extension self-contained.
- All user-visible text is in Dutch.
- DOM IDs used by the extension: `do-overlay`, `do-compare-btn`, `do-compare-slot`, `do-close`. Check for existence before inserting (`ensureButton` pattern).
- The IIFE wrapper in `content.js` isolates module state (`selectedRows`, `ensureScheduled`) from the global scope.
- `diff.js` functions are intentionally global (not wrapped) so `content.js` can call them as content scripts share a global scope within the same extension.
- Avoid `innerHTML` injection of user-supplied text without `escapeHtml`; field names and values from the grid must always be escaped before embedding in HTML strings.
