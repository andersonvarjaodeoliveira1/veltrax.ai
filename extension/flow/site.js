/* ClipGringa · Flow — ponte com o site do ClipGringa: responde se a conta do Flow está conectada. */
(function () {
  "use strict";
  if (window.__clipgringaBridge) return;
  window.__clipgringaBridge = true;
  const KEY = "clipgringa-flow-account-v1";

  const PENDING = "clipgringa-flow-pending-v1";
  // Recebe o pacote do site e guarda para a aba do Flow começar sozinha.
  window.addEventListener("message", async (event) => {
    if (event.source !== window || !event.data || event.data.source !== "clipgringa-page" || event.data.type !== "flow-package") return;
    let ok = false;
    try {
      const up = event.data.upload;
      const upload = up && typeof up.url === "string" && typeof up.token === "string" && /^https:\/\//.test(up.url)
        ? { url: up.url, token: up.token, package: String(up.package || "").slice(0, 120) } : null;
      await chrome.storage.local.set({ "clipgringa-flow-last-v1": { raw: String(event.data.raw || ""), at: Date.now(), upload } });
      await chrome.storage.local.set({ [PENDING]: { raw: String(event.data.raw || ""), at: Date.now(), upload } });
      ok = true;
      try { chrome.runtime.sendMessage({ type: "clipgringa-open-flow" }, () => void chrome.runtime.lastError); } catch (_e) { /* ignore */ }
    } catch (_e) { /* extensão recarregada */ }
    window.postMessage({ source: "clipgringa-flow", type: "package-ack", ok }, window.location.origin);
  });

  // O usuário abriu o chat de mudanças: avisa a aba do Flow para parar na etapa atual.
  window.addEventListener("message", async (event) => {
    if (event.source !== window || !event.data || event.data.source !== "clipgringa-page" || event.data.type !== "flow-stop") return;
    try { await chrome.storage.local.set({ "clipgringa-flow-stop-v1": { at: Date.now() } }); } catch (_e) { /* extensão recarregada */ }
  });

  // Andamento da geração no Flow, repassado para a página do ClipGringa.
  const PROGRESS = "clipgringa-flow-progress-v1";
  try {
    chrome.storage.onChanged.addListener((changes) => {
      if (changes[PROGRESS] && changes[PROGRESS].newValue) window.postMessage({ source: "clipgringa-flow", type: "progress", data: changes[PROGRESS].newValue }, window.location.origin);
    });
  } catch (_e) { /* extensão recarregada */ }
  window.addEventListener("message", async (event) => {
    if (event.source !== window || !event.data || event.data.source !== "clipgringa-page" || event.data.type !== "progress?") return;
    try { const d = (await chrome.storage.local.get(PROGRESS))[PROGRESS]; if (d) window.postMessage({ source: "clipgringa-flow", type: "progress", data: d }, window.location.origin); } catch (_e) { /* ignore */ }
  });

  const IMAGES = "clipgringa-flow-images-v1";
  try {
    chrome.storage.onChanged.addListener((changes) => {
      if (changes[IMAGES] && changes[IMAGES].newValue) window.postMessage({ source: "clipgringa-flow", type: "images", data: changes[IMAGES].newValue }, window.location.origin);
    });
  } catch (_e) { /* extensão recarregada */ }
  window.addEventListener("message", async (event) => {
    if (event.source !== window || !event.data || event.data.source !== "clipgringa-page" || event.data.type !== "images?") return;
    try { const d = (await chrome.storage.local.get(IMAGES))[IMAGES]; if (d) window.postMessage({ source: "clipgringa-flow", type: "images", data: d }, window.location.origin); } catch (_e) { /* ignore */ }
  });

  window.addEventListener("message", async (event) => {
    if (event.source !== window || !event.data || event.data.source !== "clipgringa-page" || event.data.type !== "flow-status?") return;
    let data = {};
    try {
      data = ((await chrome.storage.local.get(KEY))[KEY]) || {};
    } catch (_e) { return; /* extensão recarregada: sem resposta */ }
    window.postMessage(
      {
        source: "clipgringa-flow",
        type: "status",
        version: chrome.runtime.getManifest().version,
        loggedIn: data.loggedIn !== false,
        plan: data.plan || null,
        credits: typeof data.credits === "number" ? data.credits : null,
        seenAt: data.seenAt || null,
      },
      window.location.origin
    );
  });
})();
