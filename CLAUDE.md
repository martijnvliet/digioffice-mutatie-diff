# CLAUDE.md — DigiOffice Mutatie Diff

This file documents the codebase structure, conventions, and development workflows for AI assistants working on this project.

## Project Overview

**DigiOffice Mutatie Diff** is a Chromium browser extension (Manifest V3) that adds a side-by-side mutation diff viewer to the DigiOffice web application. It targets the change-log grid (`*_grdChangeLog`) inside DigiOffice, adds a "Vergelijk mutaties" (Compare mutations) button, and renders a modal with line-by-line and word-by-word diff highlighting.

The UI language is Dutch.

## Repository Layout

```
digioffice-mutatie-diff/
├── manifest.json   # MV3 extension config (entry point)
├── background.js   # Service worker: per-host permission + injection
├── popup.html      # Toolbar popup UI
├── popup.css       # Toolbar popup styling
├── popup.js        # Toolbar popup logic (permission request/revoke)
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

## Permission Model

The extension uses an **opt-in per-host** model:

- `manifest.json` declares **no static `content_scripts`**. Instead it declares `optional_host_permissions: ["*://*/*"]`, a `background` service worker, and a toolbar `action`.
- `background.js` keeps a set of dynamic content-script registrations (`chrome.scripting.registerContentScripts`) in sync with the granted origins. Each granted origin gets a registration that auto-injects `diff.js`, `content.js` and `styles.css` into all matching pages and frames on every navigation, including SPA iframe loads — without relying on tab events.
- On service-worker startup the background also calls `scanAllTabs()`, which iterates open tabs and updates each one's badge / triggers an explicit injection. This covers tabs that were already open when the extension was installed, reloaded, or when the service worker restarted.
- For every tab whose URL matches `/digioffice/i`:
  - If the host's origin is granted → keep the toolbar badge clear and ensure scripts are present.
  - If not granted → the toolbar action gets a `?` badge.
- Clicking the toolbar action opens `popup.html`, which shows the current host and either an **Activeer** or **Deactiveer** button. "Activeer" calls `chrome.permissions.request({ origins: [origin] })`; the browser's native prompt handles consent.
- `chrome.permissions.onAdded` re-syncs registrations and injects into matching open tabs so the user doesn't have to reload. `chrome.permissions.onRemoved` unregisters the corresponding script and clears the badge; scripts already injected stay alive until the tab is reloaded (the popup reloads the tab on deactivate).

## File Responsibilities

### `manifest.json`
- MV3 configuration. No `content_scripts` block — injection is fully dynamic via `background.js`.
- `permissions: ["scripting", "tabs"]` — needed to read tab URLs and inject code.
- `optional_host_permissions: ["*://*/*"]` — Chrome only grants the specific origins the user approves via the popup; the broad pattern is the umbrella under which per-host grants are possible.
- `background.service_worker = background.js`.
- `action.default_popup = popup.html` — the toolbar icon opens the activation popup.

### `background.js`
Service worker. Responsibilities:
- `init()` runs at the top of the file and is therefore re-executed on every service-worker startup (extension load, browser start, idle wakeup). It calls `syncContentScripts()` and then `scanAllTabs()`.
- `syncContentScripts()` reconciles `chrome.scripting.getRegisteredContentScripts()` against `chrome.permissions.getAll().origins`. For each granted origin it ensures a dynamic registration exists with `id = "do-" + sanitised(origin)`, `matches: [origin]`, `runAt: "document_idle"`, `allFrames: true`, and the bundled `diff.js` / `content.js` / `styles.css`. Registrations whose origin is no longer granted are unregistered.
- On `tabs.onUpdated` / `tabs.onActivated` → `handleTab(tab)`:
  - Not a DigiOffice URL → clear badge.
  - DigiOffice URL, permission granted → `inject(tab)` (idempotent thanks to the IIFE guard in `content.js`) + clear badge + title "Actief".
  - DigiOffice URL, no permission → show `?` badge + title "Klik om te activeren".
- `chrome.permissions.onAdded` → re-syncs registrations and injects into matching open tabs.
- `chrome.permissions.onRemoved` → re-syncs registrations (unregister) and refreshes all tab badges.
- `inject(tab)` uses `chrome.scripting.executeScript({ allFrames: true, files: ["diff.js", "content.js"] })` followed by `insertCSS` for `styles.css`. This is the fallback path for tabs that were loaded before the dynamic registration existed; future page loads are covered by the registration alone.

### `popup.html` / `popup.css` / `popup.js`
Toolbar popup (280px). `popup.js`:
- Reads the active tab, parses its URL.
- If URL doesn't contain "digioffice" → shows an informational message, no action buttons.
- If the origin (`protocol://host/*`) is already granted → shows **Deactiveer** button, which calls `chrome.permissions.remove` and reloads the tab.
- Otherwise → shows **Activeer** button, which calls `chrome.permissions.request`; on success the popup closes and the background worker handles injection via `permissions.onAdded`.

### `diff.js`
Loaded first; defines global helper functions used by `content.js`.

| Function | Purpose |
|---|---|
| `decodeHtml(str)` | Decodes HTML entities via a temporary `<textarea>` |
| `escapeHtml(str)` | Escapes `&`, `<`, `>` for safe HTML injection |
| `buildLcsMatrix(a, b)` | Builds LCS (Longest Common Subsequence) DP matrix over string arrays |
| `diffLines(oldLines, newLines)` | Produces a list of `{type, old, new}` records using the LCS matrix |
| `tryPairRemovedAdded(diff)` | Walks the diff in blocks separated by `equal` entries and pairs the k-th `removed` with the k-th `added` inside each block into a `changed` entry; surplus removed/added entries stay unpaired. Pairing is structural (not similarity-based) so simple value swaps like `2`→`0` pair correctly |
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

The IIFE first checks `window.__digiofficeMutatieDiffLoaded` and returns early if already set. This guards against double-injection when the background worker re-runs `chrome.scripting.executeScript` (e.g. on permission grant while the page is already loaded, or on service-worker restart).

Key responsibilities and their implementation:

| Concern | Implementation |
|---|---|
| Grid detection | `getGridContainer()` — `querySelector('[id$="_grdChangeLog"]')` |
| Table detection | `getGrid()` — `.table-data table` inside the container |
| Row multi-select | `enableRowTracking()` — captures click events at capture phase; Ctrl+click toggles, plain click resets the selection **only when inside the grid**; clicks outside the grid are ignored |
| Cell extraction | `getCellValue(row, col)` — reads `td[col="N"]`; prefers `title` attribute over `textContent`; prefers multiline candidate over single-line; picks longest when equal |
| Text normalization | `normalizeGridText(value)` — decodes HTML entities, replaces `\u00a0` with space, unescapes literal `\r\n`/`\n`/`\r` sequences |
| XML/HTML formatting | `smartFormat(text)` — detects markup by `<`/`>` heuristic; naively indents tags for readability |
| Comparison modal | `openComparison()` — builds HTML string for all selected rows, appends overlay to `document.body`; columns 6/7/8 = field name / old value / new value |
| Scroll sync | Bidirectional sync of `scrollTop`/`scrollLeft` between `.do-old` and `.do-new` using an `isSyncing` guard |
| Copy to clipboard | `.do-copy-btn` buttons use `navigator.clipboard.writeText`; label swaps to "Gekopieerd" + checkmark for 1.5 s; `extractPlainText` strips `.ln` line-number spans |
| Column width | `autoAdjustColumnWidth()` — clones each diff line offscreen to measure natural width; sets `flex: 0 0 <w>px` when content overflows |
| Button injection | `ensureButton()` — inserts `#do-compare-btn` into `.menu-right` if present, else prepends to container. Safe to call repeatedly; no-op when the button already exists |
| DOM observation | `startObservingDom()` starts a `MutationObserver` on `document.body`. The callback short-circuits with a single `getElementById` when the button already exists and otherwise calls `scheduleEnsureButton()` (rAF-batched). The observer stays active for the lifetime of the tab so the button is re-placed if DigiOffice re-renders the grid (SPA navigation, filter changes) |

Execution order inside `init()`:
1. `enableRowTracking()` — attach click listener
2. `startObservingDom()` — start MutationObserver
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

All rules are defined exactly once. Don't reintroduce duplicate rule blocks.

## Development Workflow

### Loading the extension locally

1. Open `chrome://extensions` (or `edge://extensions`).
2. Enable **Developer mode**.
3. Click **Load unpacked** and select this directory.
4. After any file change, click the reload icon next to the extension in `chrome://extensions`.

### Testing

There is no automated test suite. Manual testing steps:
1. Load the extension as unpacked.
2. Open a DigiOffice instance in the browser. The toolbar icon should show a `?` badge.
3. Click the extension icon → click **Activeer** in the popup → approve the browser's permission prompt. The badge should disappear.
4. Navigate to a page containing a change-log grid.
5. Verify the "Vergelijk mutaties" button appears in the grid toolbar.
6. Ctrl+click multiple rows, then click the button to open the diff modal.
7. Verify diff highlighting, scroll sync, and copy buttons work correctly.
8. Click the extension icon → **Deactiveer** → the tab reloads and the "Vergelijk mutaties" button is gone.

### Making changes

- **`diff.js`** is purely algorithmic; it has no DOM dependencies. Changes here should preserve the `renderDiff(oldText, newText) → {left, right}` interface consumed by `content.js`.
- **`content.js`** depends on the DigiOffice DOM structure. The grid container ID selector `[id$="_grdChangeLog"]` is the main coupling point. Column indices for date / field / old / new are detected at runtime by `detectColumnIndices()` (matches header-cell `title`/text against `datum`, `veld`, `oud`, `nieuw`) with hardcoded fallbacks `0 / 6 / 7 / 8` if detection fails.
- **`styles.css`** — all selectors are scoped to `do-*` IDs/classes. Do not use generic element selectors that could conflict with DigiOffice's own styles.
- **`manifest.json`** — no static `content_scripts`; all injection is driven by `background.js`. Injection order matters: `diff.js` must be passed before `content.js` in the `chrome.scripting.executeScript` `files` array because `content.js` calls `renderDiff` and `escapeHtml` defined in `diff.js`.
- **`background.js`** — URL matching uses `/digioffice/i`; keep this regex in sync with `popup.js`.
- **`popup.js`** — runs in the extension's own context; uses `chrome.permissions.request` and must be triggered from a user gesture (click).

## Key Conventions

- No external dependencies; keep the extension self-contained.
- All user-visible text is in Dutch.
- DOM IDs used by the extension: `do-overlay`, `do-compare-btn`, `do-close`. Check for existence before inserting (`ensureButton` pattern).
- The IIFE wrapper in `content.js` isolates module state (`selectedRows`, `ensureScheduled`) from the global scope.
- `diff.js` functions are intentionally global (not wrapped) so `content.js` can call them as content scripts share a global scope within the same extension.
- Avoid `innerHTML` injection of user-supplied text without `escapeHtml`; field names and values from the grid must always be escaped before embedding in HTML strings.
