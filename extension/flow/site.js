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
      await chrome.storage.local.set({ [PENDING]: { raw: String(event.data.raw || ""), at: Date.now(), upload } });
      ok = true;
    } catch (_e) { /* extensão recarregada */ }
    window.postMessage({ source: "clipgringa-flow", type: "package-ack", ok }, window.location.origin);
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
        loggedIn: data.loggedIn === true,
        plan: data.plan || null,
        credits: typeof data.credits === "number" ? data.credits : null,
        seenAt: data.seenAt || null,
      },
      window.location.origin
    );
  });
})();
