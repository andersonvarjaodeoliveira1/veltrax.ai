// Renomeia o próximo download do Flow para o nome que o ClipGringa espera (Video01_Cena01.mp4).
let pending = null;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message && message.type === "clipgringa-name") {
    pending = { filename: String(message.filename || ""), at: Date.now(), upload: message.upload || null };
    sendResponse({ ok: true });
  }
  if (message && message.type === "clipgringa-open-flow") {
    // Abre o Flow sozinho (sem depender de pop-up do site) se ainda não houver uma aba dele.
    chrome.tabs.query({ url: ["https://labs.google/fx/*/tools/flow*", "https://flow.google.com/*"] }, (tabs) => {
      if (tabs && tabs.length) { chrome.tabs.update(tabs[0].id, { active: true }); chrome.windows.update(tabs[0].windowId, { focused: true }); sendResponse({ ok: true, reused: true }); }
      else chrome.tabs.create({ url: "https://labs.google/fx/pt/tools/flow" }, () => sendResponse({ ok: true }));
    });
    return true;
  }
  if (message && message.type === "clipgringa-upload") {
    postVideo(message.upload, base64ToBlob(String(message.b64 || "")), String(message.file || ""))
      .then((r) => sendResponse(r))
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

function base64ToBlob(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: "video/mp4" });
}

// Envia o vídeo para o ClipGringa (fica visível em "Vídeos do Flow"). Nunca interrompe a geração.
async function postVideo(upload, blob, file) {
  if (!upload || !upload.url || !upload.token) return { ok: false, error: "sem destino" };
  if (blob.size < 1024) return { ok: false, error: "arquivo vazio" };
  const url = new URL(upload.url);
  url.searchParams.set("token", upload.token);
  url.searchParams.set("package", upload.package || "");
  url.searchParams.set("file", file || "video.mp4");
  const res = await fetch(url.toString(), { method: "POST", headers: { "Content-Type": "video/mp4" }, body: blob });
  return res.ok ? { ok: true } : { ok: false, error: `ClipGringa respondeu ${res.status}` };
}

const RESULTS_KEY = "clipgringa-flow-uploads-v1";
async function noteResult(file, result) {
  try {
    const got = (await chrome.storage.local.get(RESULTS_KEY))[RESULTS_KEY] || {};
    got[file] = { ok: result.ok, error: result.error || "", at: Date.now() };
    await chrome.storage.local.set({ [RESULTS_KEY]: got });
  } catch (_e) { /* ignora */ }
}

// Plano B: se a página não conseguiu ler o vídeo, lê o arquivo pelo endereço do download do Flow.
async function uploadFromDownload(item, upload, file) {
  try {
    const res = await fetch(item.finalUrl || item.url);
    if (!res.ok) throw new Error(`Flow respondeu ${res.status}`);
    await noteResult(file, await postVideo(upload, await res.blob(), file));
  } catch (e) {
    await noteResult(file, { ok: false, error: String((e && e.message) || e) });
  }
}

chrome.downloads.onDeterminingFilename.addListener((item, suggest) => {
  if (pending && Date.now() - pending.at < 60000 && pending.filename) {
    const name = pending.filename;
    if (pending.upload) uploadFromDownload(item, pending.upload, name);
    pending = null;
    suggest({ filename: `ClipGringa/${name}`, conflictAction: "overwrite" });
    return;
  }
  suggest();
});
