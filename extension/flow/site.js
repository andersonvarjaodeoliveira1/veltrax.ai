/* ClipGringa · Flow — ponte com o site do ClipGringa: responde se a conta do Flow está conectada. */
(function () {
  "use strict";
  // Se esta aba ainda tem a ponte de uma versão anterior (extensão atualizada sem recarregar a página), ela é desligada e esta assume.
  try { if (typeof window.__clipgringaBridgeOff === "function") window.__clipgringaBridgeOff(); } catch (_e) { /* ponte antiga já morta */ }
  const offs = [];
  const on = (fn) => { window.addEventListener("message", fn); offs.push(() => window.removeEventListener("message", fn)); };
  window.__clipgringaBridgeOff = () => offs.forEach((off) => off());
  const KEY = "clipgringa-flow-account-v1";

  const PENDING = "clipgringa-flow-pending-v1";
  // Recebe o pacote do site e guarda para a aba do Flow começar sozinha.
  on(async (event) => {
    if (event.source !== window || !event.data || event.data.source !== "clipgringa-page" || event.data.type !== "flow-package") return;
    let ok = false;
    try {
      const up = event.data.upload;
      const upload = up && typeof up.url === "string" && typeof up.token === "string" && /^https:\/\//.test(up.url)
        ? { url: up.url, token: up.token, package: String(up.package || "").slice(0, 120) } : null;
      // Pacote novo (diferente do anterior): apaga as imagens e o andamento do projeto antigo, para a tela não mostrar cena de outro vídeo.
      try {
        const prev = (await chrome.storage.local.get("clipgringa-flow-last-v1"))["clipgringa-flow-last-v1"];
        if (!prev || prev.raw !== String(event.data.raw || "")) await chrome.storage.local.remove(["clipgringa-flow-images-v1", "clipgringa-flow-progress-v1"]);
      } catch (_e) { /* ignora */ }
      await chrome.storage.local.set({ "clipgringa-flow-last-v1": { raw: String(event.data.raw || ""), at: Date.now(), upload } });
      await chrome.storage.local.set({ [PENDING]: { raw: String(event.data.raw || ""), at: Date.now(), upload } });
      ok = true;
      try { chrome.runtime.sendMessage({ type: "clipgringa-open-flow" }, () => void chrome.runtime.lastError); } catch (_e) { /* ignore */ }
    } catch (_e) { /* extensão recarregada */ }
    window.postMessage({ source: "clipgringa-flow", type: "package-ack", ok }, window.location.origin);
  });

  // O site pede para ler um anúncio da Shopee no navegador da pessoa (a Shopee bloqueia o servidor, não o navegador).
  on((event) => {
    if (event.source !== window || !event.data || event.data.source !== "clipgringa-page" || event.data.type !== "shopee-read") return;
    const id = String(event.data.id || "");
    const url = String(event.data.url || "");
    window.postMessage({ source: "clipgringa-flow", type: "shopee-ack", id }, window.location.origin);
    try {
      chrome.runtime.sendMessage({ type: "clipgringa-shopee", url }, (resp) => {
        void chrome.runtime.lastError;
        window.postMessage({ source: "clipgringa-flow", type: "shopee-result", id, data: resp || { ok: false, error: "failed" } }, window.location.origin);
      });
    } catch (_e) {
      window.postMessage({ source: "clipgringa-flow", type: "shopee-result", id, data: { ok: false, error: "failed" } }, window.location.origin);
    }
  });

  // O usuário abriu o chat de mudanças: avisa a aba do Flow para parar na etapa atual.
  on(async (event) => {
    if (event.source !== window || !event.data || event.data.source !== "clipgringa-page" || event.data.type !== "flow-stop") return;
    try { await chrome.storage.local.set({ "clipgringa-flow-stop-v1": { at: Date.now() } }); } catch (_e) { /* extensão recarregada */ }
  });

  // Projeto que ficou pela metade: a página pergunta; "continuar" reabre o Flow e retoma, "novo projeto" esquece o antigo.
  on(async (event) => {
    if (event.source !== window || !event.data || event.data.source !== "clipgringa-page") return;
    const kind = event.data.type;
    if (kind !== "flow-resume" && kind !== "flow-discard") return;
    let ok = false;
    try {
      if (kind === "flow-resume") {
        const saved = (await chrome.storage.local.get("clipgringa-flow-state-v1"))["clipgringa-flow-state-v1"];
        const left = saved && Array.isArray(saved.jobs) ? saved.jobs.filter((j) => !(saved.done || {})[j.key]).length : 0;
        if (left) {
          await chrome.storage.local.set({ "clipgringa-flow-resume-v1": { at: Date.now() } });
          try { chrome.runtime.sendMessage({ type: "clipgringa-open-flow" }, () => void chrome.runtime.lastError); } catch (_e) { /* ignore */ }
          ok = true;
        }
      } else {
        await chrome.storage.local.set({ "clipgringa-flow-discard-v1": { at: Date.now() } });
        await chrome.storage.local.remove(["clipgringa-flow-state-v1", "clipgringa-flow-progress-v1", "clipgringa-flow-images-v1", "clipgringa-flow-last-v1", "clipgringa-flow-pending-v1", "clipgringa-flow-resume-v1"]);
        ok = true;
      }
    } catch (_e) { /* extensão recarregada */ }
    window.postMessage({ source: "clipgringa-flow", type: kind === "flow-resume" ? "resume-ack" : "discard-ack", ok }, window.location.origin);
  });

  // Andamento da geração no Flow, repassado para a página do ClipGringa.
  const PROGRESS = "clipgringa-flow-progress-v1";
  try {
    chrome.storage.onChanged.addListener((changes) => {
      if (changes[PROGRESS] && changes[PROGRESS].newValue) window.postMessage({ source: "clipgringa-flow", type: "progress", data: changes[PROGRESS].newValue }, window.location.origin);
    });
  } catch (_e) { /* extensão recarregada */ }
  on(async (event) => {
    if (event.source !== window || !event.data || event.data.source !== "clipgringa-page" || event.data.type !== "progress?") return;
    try { const d = (await chrome.storage.local.get(PROGRESS))[PROGRESS]; if (d) window.postMessage({ source: "clipgringa-flow", type: "progress", data: d }, window.location.origin); } catch (_e) { /* ignore */ }
  });

  const IMAGES = "clipgringa-flow-images-v1";
  try {
    chrome.storage.onChanged.addListener((changes) => {
      if (changes[IMAGES] && changes[IMAGES].newValue) window.postMessage({ source: "clipgringa-flow", type: "images", data: changes[IMAGES].newValue }, window.location.origin);
    });
  } catch (_e) { /* extensão recarregada */ }
  on(async (event) => {
    if (event.source !== window || !event.data || event.data.source !== "clipgringa-page" || event.data.type !== "images?") return;
    try { const d = (await chrome.storage.local.get(IMAGES))[IMAGES]; if (d) window.postMessage({ source: "clipgringa-flow", type: "images", data: d }, window.location.origin); } catch (_e) { /* ignore */ }
  });

  on(async (event) => {
    if (event.source !== window || !event.data || event.data.source !== "clipgringa-page" || event.data.type !== "flow-status?") return;
    let data = {};
    let tabs = null;
    try {
      tabs = await new Promise((res) => {
        const t = setTimeout(() => res(null), 2200);
        chrome.runtime.sendMessage({ type: "clipgringa-refresh-account" }, (r) => { void chrome.runtime.lastError; clearTimeout(t); res(r && typeof r.tabs === "number" ? r.tabs : null); });
      });
    } catch (_e) { /* segue com o que está guardado */ }
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
        flowTabs: tabs,
      },
      window.location.origin
    );
  });
  // Gerar texto pela conta de IA da pessoa (Gemini, ChatGPT, Claude): a página pede, a extensão escreve no site e devolve a resposta.
  on((event) => {
    if (event.source !== window || !event.data || event.data.source !== "clipgringa-page") return;
    const d = event.data;
    if (d.type === "ai-hello?") {
      window.postMessage({ source: "clipgringa-flow", type: "ai-hello", version: chrome.runtime.getManifest().version, ai: true }, window.location.origin);
      return;
    }
    if (d.type === "ai-ask") {
      const id = String(d.id || "");
      const reply = (data) => window.postMessage({ source: "clipgringa-flow", type: "ai-answer", id, data }, window.location.origin);
      try {
        chrome.runtime.sendMessage({ type: "clipgringa-ai-ask", site: String(d.site || ""), prompt: String(d.prompt || "").slice(0, 60000), images: Array.isArray(d.images) ? d.images.slice(0, 8) : [], timeoutMs: Number(d.timeoutMs) || 100000 }, (resp) => {
          void chrome.runtime.lastError;
          reply(resp || { ok: false, error: "nopage" });
        });
      } catch (_e) { reply({ ok: false, error: "nopage" }); }
      return;
    }
    if (d.type === "ai-probe") {
      const id = String(d.id || "");
      const reply = (data) => window.postMessage({ source: "clipgringa-flow", type: "ai-probe-result", id, data }, window.location.origin);
      try {
        chrome.runtime.sendMessage({ type: "clipgringa-ai-probe-site", site: String(d.site || ""), open: !!d.open }, (resp) => {
          void chrome.runtime.lastError;
          reply(resp || { ok: false, state: "nopage" });
        });
      } catch (_e) { reply({ ok: false, state: "nopage" }); }
    }
  });
})();
