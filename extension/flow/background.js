// Renomeia o próximo download do Flow para o nome que o ClipGringa espera (Video01_Cena01.mp4).
let pending = null;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message && message.type === "clipgringa-name") {
    pending = { filename: String(message.filename || ""), at: Date.now() };
    sendResponse({ ok: true });
  }
  if (message && message.type === "clipgringa-fb-open" && /^https:\/\/(www|web)\.facebook\.com\//.test(String(message.url || ""))) {
    chrome.tabs.create({ url: String(message.url), active: true })
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ ok: false, error: String((e && e.message) || e) }));
    return true;
  }
  if (message && message.type === "clipgringa-click" && _sender.tab) {
    trustedClick(_sender.tab.id, Number(message.x), Number(message.y))
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ ok: false, error: String((e && e.message) || e) }));
    return true;
  }
  return false;
});

// O Flow só aceita cliques "de verdade". O chrome.debugger envia um clique confiável na aba.
async function trustedClick(tabId, x, y) {
  const target = { tabId };
  let attached = false;
  try {
    await chrome.debugger.attach(target, "1.3");
    attached = true;
  } catch (e) {
    if (!/already attached/i.test(String(e && e.message))) throw e;
  }
  try {
    const send = (type, extra = {}) =>
      chrome.debugger.sendCommand(target, "Input.dispatchMouseEvent", { type, x, y, button: "left", ...extra });
    await send("mouseMoved", { buttons: 0 });
    await send("mousePressed", { buttons: 1, clickCount: 1 });
    await send("mouseReleased", { buttons: 0, clickCount: 1 });
  } finally {
    if (attached) { try { await chrome.debugger.detach(target); } catch (_) {} }
  }
}

chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
  if (pending && Date.now() - pending.at < 60000 && pending.filename) {
    const name = pending.filename;
    pending = null;
    suggest({ filename: `ClipGringa/${name}`, conflictAction: "overwrite" });
    return;
  }
  suggest();
});
