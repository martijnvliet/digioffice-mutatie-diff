const DIGIOFFICE_RE = /digioffice/i;
const SCRIPT_ID_PREFIX = "do-";

init();

async function init() {
  try {
    await syncContentScripts();
  } catch (err) {
    console.warn("DigiOffice MD: content script sync failed", err);
  }
  scanAllTabs();
}

async function syncContentScripts() {
  const [registered, perms] = await Promise.all([
    chrome.scripting.getRegisteredContentScripts(),
    chrome.permissions.getAll()
  ]);

  const grantedOrigins = perms.origins ?? [];
  const grantedIds = new Set(grantedOrigins.map(originToId));
  const ours = registered.filter((s) => s.id.startsWith(SCRIPT_ID_PREFIX));
  const registeredIds = new Set(ours.map((s) => s.id));

  const toUnregister = [...registeredIds].filter((id) => !grantedIds.has(id));
  if (toUnregister.length) {
    await chrome.scripting.unregisterContentScripts({ ids: toUnregister });
  }

  const toRegister = grantedOrigins
    .filter((o) => !registeredIds.has(originToId(o)))
    .map((origin) => ({
      id: originToId(origin),
      matches: [origin],
      js: ["diff.js", "content.js"],
      css: ["styles.css"],
      runAt: "document_idle",
      allFrames: true
    }));
  if (toRegister.length) {
    await chrome.scripting.registerContentScripts(toRegister);
  }
}

function originToId(origin) {
  return SCRIPT_ID_PREFIX + origin.replace(/[^A-Za-z0-9]/g, "_");
}

async function scanAllTabs() {
  try {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) handleTab(tab);
  } catch (err) {
    console.warn("DigiOffice MD: tab scan failed", err);
  }
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete" && !changeInfo.url) return;
  handleTab(tab);
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    handleTab(tab);
  } catch (_) {
    // tab gone
  }
});

chrome.permissions.onAdded.addListener(async (perms) => {
  await syncContentScripts();
  if (!perms.origins?.length) return;
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (!tab.url || !DIGIOFFICE_RE.test(tab.url)) continue;
    const granted = await chrome.permissions.contains({
      origins: [originPattern(tab.url)]
    });
    if (granted) handleTab(tab);
  }
});

chrome.permissions.onRemoved.addListener(async () => {
  await syncContentScripts();
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) handleTab(tab);
});

function originPattern(url) {
  const u = new URL(url);
  return `${u.protocol}//${u.host}/*`;
}

async function handleTab(tab) {
  if (!tab?.id || !tab.url) return;

  if (!DIGIOFFICE_RE.test(tab.url)) {
    await setBadge(tab.id, "", "Niet van toepassing op deze pagina");
    return;
  }

  const granted = await chrome.permissions.contains({
    origins: [originPattern(tab.url)]
  });

  if (granted) {
    await inject(tab);
    await setBadge(tab.id, "", "Actief op deze host");
  } else {
    await setBadge(tab.id, "?", "Klik om te activeren voor deze host");
  }
}

async function setBadge(tabId, text, title) {
  try {
    await chrome.action.setBadgeText({ tabId, text });
    if (text) {
      await chrome.action.setBadgeBackgroundColor({
        tabId,
        color: "#2f4f79"
      });
    }
    await chrome.action.setTitle({ tabId, title: `DigiOffice Mutatie Diff — ${title}` });
  } catch (_) {
    // tab closed between check and set
  }
}

async function inject(tab) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      files: ["diff.js", "content.js"]
    });
    await chrome.scripting.insertCSS({
      target: { tabId: tab.id, allFrames: true },
      files: ["styles.css"]
    });
  } catch (err) {
    console.warn("DigiOffice Mutatie Diff: injectie mislukt", err);
  }
}
