/* ClipGringa · Flow — ponte com o site do ClipGringa: responde se a conta do Flow está conectada. */
(function () {
  "use strict";
  if (window.__clipgringaBridge) return;
  window.__clipgringaBridge = true;
  const KEY = "clipgringa-flow-account-v1";

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
