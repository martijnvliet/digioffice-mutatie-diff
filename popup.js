const DIGIOFFICE_RE = /digioffice/i;

async function init() {
  const hostEl = document.getElementById("host");
  const statusEl = document.getElementById("status");
  const enableBtn = document.getElementById("enable");
  const disableBtn = document.getElementById("disable");

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab?.url) {
    hostEl.textContent = "—";
    statusEl.textContent = "Geen actief tabblad gevonden.";
    return;
  }

  let url;
  try {
    url = new URL(tab.url);
  } catch (_) {
    statusEl.textContent = "Deze pagina heeft geen ondersteunde URL.";
    return;
  }

  hostEl.textContent = url.host || url.protocol;

  if (!DIGIOFFICE_RE.test(tab.url)) {
    statusEl.textContent =
      "Deze pagina bevat geen 'digioffice' in de URL. De extensie doet hier niets.";
    return;
  }

  const origin = `${url.protocol}//${url.host}/*`;
  const granted = await chrome.permissions.contains({ origins: [origin] });

  if (granted) {
    statusEl.textContent = "Extensie is actief op deze host.";
    disableBtn.classList.remove("hidden");
  } else {
    statusEl.textContent =
      "Klik op 'Activeer' om de extensie toestemming te geven op deze host te werken.";
    enableBtn.classList.remove("hidden");
  }

  enableBtn.addEventListener("click", async () => {
    try {
      const ok = await chrome.permissions.request({ origins: [origin] });
      if (ok) window.close();
      else statusEl.textContent = "Toestemming geweigerd.";
    } catch (err) {
      statusEl.textContent = "Activeren mislukt: " + err.message;
    }
  });

  disableBtn.addEventListener("click", async () => {
    try {
      const ok = await chrome.permissions.remove({ origins: [origin] });
      if (ok) {
        await chrome.tabs.reload(tab.id);
        window.close();
      }
    } catch (err) {
      statusEl.textContent = "Deactiveren mislukt: " + err.message;
    }
  });
}

init();
