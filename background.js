const DIGIOFFICE_RE = /digioffice/i;

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
