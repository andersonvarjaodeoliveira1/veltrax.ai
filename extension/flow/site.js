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
      await chrome.storage.local.set({ [PENDING]: { raw: String(event.data.raw || ""), at: Date.now() } });
      ok = true;
    } catch (_e) { /* extensão recarregada */ }
    window.postMessage({ source: "clipgringa-flow", type: "package-ack", ok }, window.location.origin);
  });

  const FB_ACC = "clipgringa-fb-account-v1";
  const FB_JOB = "clipgringa-fb-job-v1";
  // Facebook: status/páginas salvas, remover página e publicar o vídeo final.
  window.addEventListener("message", async (event) => {
    const d = event.data;
    if (event.source !== window || !d || d.source !== "clipgringa-page") return;
    const reply = (payload) => window.postMessage({ source: "clipgringa-flow", ...payload }, window.location.origin);
    try {
      if (d.type === "fb-status?") {
        const acc = ((await chrome.storage.local.get(FB_ACC))[FB_ACC]) || {};
        reply({ type: "fb-status", version: chrome.runtime.getManifest().version, loggedIn: acc.loggedIn === true && Date.now() - (acc.seenAt || 0) < 12 * 3600 * 1000, pages: acc.pages || [] });
      } else if (d.type === "fb-remove-page") {
        const acc = ((await chrome.storage.local.get(FB_ACC))[FB_ACC]) || {};
        await chrome.storage.local.set({ [FB_ACC]: { ...acc, pages: (acc.pages || []).filter((p) => p.url !== d.url) } });
        reply({ type: "fb-status", version: chrome.runtime.getManifest().version, loggedIn: acc.loggedIn === true, pages: (acc.pages || []).filter((p) => p.url !== d.url) });
      } else if (d.type === "fb-set-restriction" && ["world", "us", "world_no_us"].includes(String(d.restriction))) {
        const acc = ((await chrome.storage.local.get(FB_ACC))[FB_ACC]) || {};
        const pages = (acc.pages || []).map((p) => (p.url === d.url ? { ...p, restriction: String(d.restriction) } : p));
        await chrome.storage.local.set({ [FB_ACC]: { ...acc, pages } });
        reply({ type: "fb-status", version: chrome.runtime.getManifest().version, loggedIn: acc.loggedIn === true, pages });
      } else if (d.type === "fb-publish" && d.job && typeof d.job.b64 === "string" && /^https:\/\/(www|web)\.facebook\.com\//.test(String(d.job.pageUrl || ""))) {
        await chrome.storage.local.set({ [FB_JOB]: { pageUrl: String(d.job.pageUrl), caption: String(d.job.caption || "").slice(0, 5000), filename: String(d.job.filename || "clip.mp4"), mime: String(d.job.mime || "video/mp4"), b64: d.job.b64, at: Date.now() } });
        const res = await chrome.runtime.sendMessage({ type: "clipgringa-fb-open", url: String(d.job.pageUrl) });
        reply({ type: "fb-publish-ack", ok: !!(res && res.ok) });
      }
    } catch (_e) { reply({ type: "fb-publish-ack", ok: false }); }
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
