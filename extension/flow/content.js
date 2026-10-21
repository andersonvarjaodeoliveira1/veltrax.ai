/* ClipGringa · Flow (Lower Priority)
 * Roda dentro de https://flow.google.com/project/*. Lê o pacote do ClipGringa e, para cada cena:
 * 1) gera a imagem (Nano Banana, 9:16)  2) anima com Veo 3.1 Lite [Lower Priority] usando a imagem como primeiro quadro
 * 3) baixa o vídeo como VideoXX_CenaYY.mp4. Tudo na sessão do próprio membro, sem senha e sem gastar créditos.
 */
(function () {
  "use strict";
  if (window.__clipgringaFlow) return;
  window.__clipgringaFlow = true;

  const STORE_KEY = "clipgringa-flow-state-v1";
  const IMAGE_WAIT_MS = 4 * 60 * 1000;
  const VIDEO_WAIT_MS = 25 * 60 * 1000;
  const RETRIES = 2;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const visible = (el) => !!el && el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0;
  const text = (el) => ((el && el.innerText) || "").trim();
  const pad = (n) => String(n).padStart(2, "0");

  async function waitFor(fn, timeout = 8000, step = 150) {
    const end = Date.now() + timeout;
    for (;;) {
      let value = null;
      try { value = fn(); } catch (_e) { value = null; }
      if (value) return value;
      if (Date.now() > end) return null;
      await sleep(step);
    }
  }

  /* ---------- estado salvo (sobrevive a recarregar a página) ---------- */
  const storage = {
    async get() {
      try {
        if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
          const got = await chrome.storage.local.get(STORE_KEY);
          return got[STORE_KEY] || null;
        }
      } catch (_e) { /* ignora */ }
      try { return JSON.parse(localStorage.getItem(STORE_KEY) || "null"); } catch (_e) { return null; }
    },
    async set(value) {
      try {
        if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
          await chrome.storage.local.set({ [STORE_KEY]: value });
          return;
        }
      } catch (_e) { /* ignora */ }
      try { localStorage.setItem(STORE_KEY, JSON.stringify(value)); } catch (_e) { /* ignora */ }
    },
  };

  /* ---------- pacote ---------- */
  let flowModel = "[Lower Priority]"; // modelo do Flow pedido pelo pacote (padrão: Lower Priority, 0 créditos)
  const isLowerPriority = () => flowModel === "[Lower Priority]";

  function parsePackage(raw) {
    let data;
    try { data = JSON.parse(raw); } catch (_e) { throw new Error("O texto colado não é um pacote válido do ClipGringa."); }
    if (!data || data.app !== "clipgringa-flow" || !Array.isArray(data.videos) || !data.videos.length) {
      throw new Error("Esse não é um pacote do ClipGringa (falta a lista de vídeos).");
    }
    const jobs = [];
    data.videos.forEach((video, vi) => {
      (video.scenes || []).forEach((scene, si) => {
        if (!scene.imagePrompt || !scene.videoPrompt) return;
        jobs.push({
          key: `${vi}-${si}`,
          vi, si,
          title: video.title || `Vídeo ${pad(vi + 1)}`,
          imagePrompt: String(scene.imagePrompt),
          videoPrompt: String(scene.videoPrompt),
          file: scene.file || `Video${pad(vi + 1)}_Cena${pad(si + 1)}.mp4`,
        });
      });
    });
    if (!jobs.length) throw new Error("O pacote não tem cenas com prompts.");
    const wanted = String(data.flowModel || "").trim();
    flowModel = wanted && !/lower priority/i.test(wanted) ? wanted : "[Lower Priority]";
    return { jobs, keyword: data.keyword || "" };
  }

  /* ---------- Flow: caixa de prompt e ajustes ---------- */
  const promptBox = () => $(".base-prompt-box") || $(".ProseMirror")?.closest("div");
  const editor = () => $(".base-prompt-box .ProseMirror") || $(".ProseMirror");
  const overlay = () => $(".cdk-overlay-container") || document.body;

  function radios() { return $$("button[role=radio]", overlay()); }
  const hasIcon = (b, icon) => text(b).split("\n").map((s) => s.trim()).includes(icon);
  const isOn = (b) => b.getAttribute("aria-checked") === "true" || b.getAttribute("aria-pressed") === "true" || b.classList.contains("mat-button-toggle-checked");

  // O Flow pode abrir o painel do "Agente" (chat). Para gerar direto, esse painel precisa estar fechado.
  async function ensureDirectMode() {
    const panel = $(".agent-panel-wrapper");
    if (panel && visible(panel)) {
      const close = $$(".agent-panel-header button", document).find((b) => text(b) === "close");
      if (close) { close.click(); await sleep(1200); }
    }
    const ok = await waitFor(() => $(".settings-trigger-button") && editor(), 8000);
    if (!ok) throw new Error("Não achei a caixa de criação do Flow. Abra a página principal do projeto no Flow.");
  }

  async function openSettings() {
    if (radios().some(visible)) return true;
    const trigger = $(".settings-trigger-button") || $("button[class*=settings-trigger]");
    if (!trigger) throw new Error("Não achei o botão de ajustes do Flow. Abra um projeto do Flow.");
    trigger.click();
    const ok = await waitFor(() => radios().some(visible), 5000);
    if (!ok) throw new Error("Os ajustes do Flow não abriram.");
    return true;
  }

  async function closeSettings() {
    for (let i = 0; i < 3; i += 1) {
      if (!radios().some(visible) && !$$(".mat-mdc-menu-panel", overlay()).some(visible)) return;
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", keyCode: 27, bubbles: true }));
      const active = document.activeElement;
      if (active) active.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", keyCode: 27, bubbles: true }));
      await sleep(350);
    }
    if (radios().some(visible)) {
      const trigger = $(".settings-trigger-button");
      if (trigger) trigger.click();
      await sleep(350);
    }
  }

  async function pickRadio(icon) {
    const btn = await waitFor(() => radios().find((b) => visible(b) && hasIcon(b, icon)), 3000);
    if (!btn) return false;
    if (!isOn(btn)) { btn.click(); await sleep(450); }
    return true;
  }

  async function pickRadioByLabel(label) {
    const btn = await waitFor(() => radios().find((b) => visible(b) && text(b).replace(/\s+/g, "") === label), 3000);
    if (!btn) return false;
    if (!isOn(btn)) { btn.click(); await sleep(450); }
    return true;
  }

  async function ensureModel(needle) {
    const matches = (t) => t.includes(needle) && (needle === "[Lower Priority]" || !/\[Lower Priority\]/i.test(t));
    const trigger = await waitFor(() => $$("button.mat-mdc-menu-trigger", overlay()).find(visible), 3000);
    if (!trigger) return text(null) || "";
    if (matches(text(trigger))) return text(trigger);
    trigger.click();
    const item = await waitFor(() => $$("[role=menuitem], .mat-mdc-menu-item", overlay()).find((i) => visible(i) && matches(text(i))), 4000);
    if (!item) {
      await closeSettings();
      throw new Error(`O Flow não mostrou o modelo “${needle}” nesta conta. ${needle === "[Lower Priority]" ? "Confira se o Veo 3.1 Lite [Lower Priority] aparece nos ajustes do Flow (ele é do plano Ultra)." : "Confira o nome do modelo nos ajustes do Flow."}`);
    }
    item.click();
    await sleep(500);
    return needle;
  }

  async function configure(kind) {
    await ensureDirectMode();
    await openSettings();
    if (kind === "image") {
      await pickRadio("image");
      await pickRadio("crop_9_16");
      await pickRadioByLabel("x1");
    } else {
      await pickRadio("videocam");
      await sleep(300);
      await pickRadio("crop_free"); // Frames (primeiro quadro)
      await pickRadio("crop_9_16");
      await pickRadioByLabel("8s");
      await pickRadioByLabel("x1");
      await ensureModel(flowModel);
    }
    await closeSettings();
  }

  async function setPrompt(value) {
    const ed = await waitFor(editor, 6000);
    if (!ed) throw new Error("Não achei a caixa de prompt do Flow.");
    ed.focus();
    document.execCommand("selectAll", false, null);
    document.execCommand("insertText", false, value);
    await sleep(400);
    if (!text(ed).startsWith(value.slice(0, 20))) {
      // segunda tentativa
      ed.focus();
      document.execCommand("selectAll", false, null);
      document.execCommand("delete", false, null);
      document.execCommand("insertText", false, value);
      await sleep(400);
    }
  }

  const generateButton = () => $$("button", promptBox() || document).find((b) => text(b) === "arrow_forward" && visible(b));

  async function pressGenerate() {
    const btn = await waitFor(() => { const b = generateButton(); return b && !b.disabled ? b : null; }, 6000);
    if (!btn) throw new Error("O botão de gerar do Flow está desativado.");
    btn.scrollIntoView({ block: "center" });
    const r = btn.getBoundingClientRect();
    let res = null;
    try {
      res = await chrome.runtime.sendMessage({ type: "clipgringa-click", x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) });
    } catch (_) {}
    if (!res || !res.ok) btn.click(); // plano B
  }

  /* ---------- Flow: grade de mídias ---------- */
  const tilesRoot = () => $("cdk-virtual-scroll-viewport.tiles-container") || document;
  const baseSrc = (src) => String(src || "").split("=")[0];

  function firstTiles(limit = 6) {
    const out = [];
    for (const img of $$("img", tilesRoot())) {
      const src = baseSrc(img.src);
      if (!src || out.some((t) => t.src === src)) continue;
      let node = img;
      for (let i = 0; i < 8 && node.parentElement; i += 1) {
        node = node.parentElement;
        if (/%|play_circle|image\n|videocam/.test(node.innerText || "") || node.classList.contains("container")) break;
      }
      out.push({ src, img, tile: node, info: node.innerText || "" });
      if (out.length >= limit) break;
    }
    return out;
  }

  const tileKeys = () => new Set(firstTiles(12).map((t) => t.src));

  function pageError() {
    const el = $$(".mat-mdc-snack-bar-label, simple-snack-bar, [role=alert], [class*=error-message]").find(visible);
    return el ? text(el) : "";
  }

  async function waitNewTile(before, kind, timeout, onTick) {
    const end = Date.now() + timeout;
    let lastError = "";
    for (;;) {
      const tiles = firstTiles(6);
      const fresh = tiles.find((t) => !before.has(t.src));
      if (fresh) {
        const generating = /\d+\s*%/.test(fresh.info) || /gerando|generating/i.test(fresh.info);
        const failed = /falha|failed|erro|error/i.test(fresh.info.replace(/arrow_forward/g, ""));
        if (failed) throw new Error("O Flow marcou esta geração como falha.");
        if (!generating && (kind === "image" || /play_circle|videocam|movie/.test(fresh.info) || fresh.tile.querySelector("video"))) {
          if (onTick) onTick(100);
          return fresh;
        }
        const pct = (fresh.info.match(/(\d+)\s*%/) || [])[1];
        if (onTick) onTick(pct ? Number(pct) : null);
      }
      const err = pageError();
      if (err && err !== lastError && /limite|limit|quota|cota|erro|error|falha|failed|não foi possível/i.test(err)) {
        lastError = err;
        if (!fresh) throw new Error(err);
      }
      if (Date.now() > end) throw new Error("O Flow demorou demais para terminar.");
      await sleep(1500);
    }
  }

  /* ---------- primeiro quadro (Início) ---------- */
  async function chooseStartFrame(imageSrc) {
    const trigger = await waitFor(() => $$(".frame-trigger").find(visible), 6000);
    if (!trigger) throw new Error("Não achei o campo “Início” do Flow (modo Frames).");
    trigger.click();
    const items = await waitFor(() => { const list = $$(".asset-item", overlay()).filter(visible); return list.length ? list : null; }, 8000);
    if (!items) throw new Error("A lista de imagens do Flow não abriu.");
    await sleep(600);
    let target = $$(".asset-item", overlay()).find((i) => $$("img", i.parentElement || i).some((im) => baseSrc(im.src) === imageSrc));
    if (!target) target = $$(".asset-item", overlay()).filter(visible)[0];
    target.click();
    await sleep(500);
    const add = await waitFor(() => $$("button", overlay()).find((b) => visible(b) && /detail-add|include/i.test(b.className)), 5000);
    if (!add) throw new Error("Não achei o botão “Incluir no comando”.");
    add.click();
    await waitFor(() => !$$(".asset-item", overlay()).some(visible), 5000);
    await sleep(500);
  }

  /* ---------- download ---------- */
  function nameNextDownload(filename) {
    return new Promise((resolve) => {
      try {
        if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
          chrome.runtime.sendMessage({ type: "clipgringa-name", filename }, () => resolve());
          return;
        }
      } catch (_e) { /* ignora */ }
      resolve();
    });
  }

  async function downloadTile(tile, filename) {
    const img = tile.img;
    img.click();
    const dl = await waitFor(() => $$("button").find((b) => visible(b) && text(b) === "download"), 10000);
    if (!dl) throw new Error("Não achei o botão de baixar do Flow.");
    await nameNextDownload(filename);
    dl.click();
    const item = await waitFor(() => $$("[role=menuitem], .mat-mdc-menu-item", overlay()).filter(visible).find((i) => /^720p/i.test(text(i))) || null, 5000);
    const fallback = $$("[role=menuitem], .mat-mdc-menu-item", overlay()).filter(visible)[1];
    (item || fallback || {}).click?.();
    await sleep(2500);
    const back = $$("button").find((b) => visible(b) && text(b) === "arrow_back");
    if (back) back.click(); else history.back();
    await waitFor(() => editor() && visible(editor()), 10000);
    await sleep(800);
  }

  /* ---------- painel ---------- */
  const css = `
  :host{all:initial}
  .box{position:fixed;top:72px;right:16px;width:360px;max-height:calc(100vh - 100px);overflow:auto;z-index:2147483000;background:#0f0d14;color:#f2eefc;border:1px solid rgba(255,255,255,.14);border-radius:18px;font:13px/1.45 "Google Sans",Inter,system-ui,sans-serif;box-shadow:0 18px 50px rgba(0,0,0,.55)}
  .head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:12px 14px;border-bottom:1px solid rgba(255,255,255,.08)}
  .title{font-weight:600;font-size:13px}
  .badge{font-size:10px;font-weight:600;color:#a98bff;border:1px solid rgba(169,139,255,.5);padding:2px 7px;border-radius:99px;margin-left:6px}
  .x{background:none;border:0;color:#a79fb8;cursor:pointer;font-size:16px}
  .body{padding:12px 14px;display:flex;flex-direction:column;gap:10px}
  textarea{width:100%;min-height:84px;resize:vertical;background:#09080c;color:#f2eefc;border:1px solid rgba(255,255,255,.14);border-radius:12px;padding:8px;font:11px ui-monospace,monospace;box-sizing:border-box}
  .row{display:flex;gap:8px;flex-wrap:wrap}
  button.b{border:0;border-radius:99px;padding:9px 16px;font:600 12px inherit;cursor:pointer;color:#fff;background:linear-gradient(135deg,#8b5cf6,#7b3fe4)}
  button.b.o{background:transparent;border:1px solid rgba(255,255,255,.2);color:#e8e2f8}
  button.b:disabled{opacity:.45;cursor:default}
  .bar{height:7px;border-radius:99px;background:rgba(255,255,255,.1);overflow:hidden}
  .bar>i{display:block;height:100%;width:0;background:linear-gradient(90deg,#8b5cf6,#a98bff);transition:width .4s}
  .now{font-size:12px;color:#e8e2f8}
  .muted{font-size:11px;color:#a79fb8}
  .err{font-size:12px;color:#f0466b}
  .ok{color:#5bd69a}
  ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:4px;max-height:200px;overflow:auto}
  li{display:flex;justify-content:space-between;gap:8px;font-size:11px;padding:5px 8px;border-radius:9px;background:rgba(255,255,255,.04)}
  .st-done{color:#5bd69a}.st-run{color:#f5b454}.st-err{color:#f0466b}.st-wait{color:#a79fb8}
  label.chk{display:flex;gap:6px;align-items:center;font-size:11px;color:#c9bbfa}
  `;

  const host = document.createElement("div");
  host.id = "clipgringa-flow-host";
  document.documentElement.appendChild(host);
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `
  <style>${css}</style>
  <div class="box" id="box">
    <div class="head"><div><span class="title">ClipGringa · Flow</span><span class="badge">LOWER PRIORITY</span></div><button class="x" id="min" title="Minimizar">–</button></div>
    <div class="body" id="body">
      <div class="muted">Cole o pacote do ClipGringa (botão “Copiar pacote”). A extensão gera as imagens e os vídeos em Lower Priority, sem gastar créditos.</div>
      <textarea id="pkg" placeholder='Cole aqui o pacote do ClipGringa'></textarea>
      <label class="chk"><input type="checkbox" id="test"> Só a primeira cena (teste)</label>
      <div class="row"><button class="b" id="go">Começar</button><button class="b o" id="stop" disabled>Parar</button><button class="b o" id="clear">Limpar</button></div>
      <div class="bar"><i id="fill"></i></div>
      <div class="now" id="now">Pronto para começar.</div>
      <div class="err" id="err"></div>
      <ul id="list"></ul>
    </div>
  </div>`;

  const el = (id) => root.getElementById(id);
  let running = false;
  let stopFlag = false;
  let state = { jobs: [], done: {}, errors: {} };

  function setNow(msg) { el("now").textContent = msg; }
  function setError(msg) { el("err").textContent = msg || ""; }

  function render() {
    const total = state.jobs.length;
    const done = state.jobs.filter((j) => state.done[j.key]).length;
    el("fill").style.width = total ? `${Math.round((done / total) * 100)}%` : "0";
    el("list").innerHTML = state.jobs.map((j) => {
      const label = `Vídeo ${pad(j.vi + 1)} · Cena ${pad(j.si + 1)}`;
      let st = "<span class='st-wait'>na fila</span>";
      if (state.done[j.key]) st = "<span class='st-done'>baixado</span>";
      else if (state.errors[j.key]) st = "<span class='st-err'>erro</span>";
      else if (state.current === j.key) st = `<span class='st-run'>${state.phase || "gerando"}</span>`;
      return `<li><span>${label}</span>${st}</li>`;
    }).join("");
  }

  async function persist() {
    await storage.set({ jobs: state.jobs, done: state.done, errors: state.errors, raw: el("pkg").value });
  }

  async function withRetry(label, fn) {
    let lastError;
    for (let attempt = 0; attempt <= RETRIES; attempt += 1) {
      if (stopFlag) throw new Error("STOP");
      try { return await fn(); } catch (e) {
        lastError = e;
        if (e.message === "STOP") throw e;
        if (attempt < RETRIES) {
          const wait = 20 + attempt * 40;
          for (let s = wait; s > 0; s -= 1) {
            if (stopFlag) throw new Error("STOP");
            setNow(`${label}: o Flow pediu para esperar. Tentando de novo em ${s}s (tentativa ${attempt + 2} de ${RETRIES + 1})…`);
            await sleep(1000);
          }
        }
      }
    }
    throw lastError;
  }

  async function runJob(job, onlyFirst) {
    const label = `Vídeo ${pad(job.vi + 1)} · Cena ${pad(job.si + 1)}`;
    state.current = job.key;

    // 1) imagem
    state.phase = "imagem"; render();
    const image = await withRetry(`${label} (imagem)`, async () => {
      setNow(`${label}: preparando o Flow para gerar a imagem…`);
      await configure("image");
      await setPrompt(job.imagePrompt);
      const before = tileKeys();
      await pressGenerate();
      setNow(`${label}: gerando a imagem (cerca de 15 segundos)…`);
      return waitNewTile(before, "image", IMAGE_WAIT_MS, (p) => { if (p != null) setNow(`${label}: gerando a imagem… ${p}%`); });
    });

    // 2) vídeo em Lower Priority
    state.phase = "vídeo"; render();
    const video = await withRetry(`${label} (vídeo)`, async () => {
      setNow(isLowerPriority() ? `${label}: escolhendo Veo 3.1 Lite [Lower Priority] (0 créditos)…` : `${label}: escolhendo o modelo ${flowModel} (gasta créditos do Flow)…`);
      await configure("video");
      await chooseStartFrame(image.src);
      await setPrompt(job.videoPrompt);
      const before = tileKeys();
      await pressGenerate();
      setNow(`${label}: o Flow está animando${isLowerPriority() ? " em Lower Priority" : ""}. Pode levar de 1 a 6 minutos, não feche esta aba.`);
      return waitNewTile(before, "video", VIDEO_WAIT_MS, (p) => { if (p != null) setNow(`${label}: animando${isLowerPriority() ? " em Lower Priority" : ""}… ${p}%`); });
    });

    // 3) baixar
    state.phase = "baixando"; render();
    setNow(`${label}: baixando ${job.file}…`);
    await withRetry(`${label} (download)`, () => downloadTile(video, job.file));
    state.done[job.key] = true;
    delete state.errors[job.key];
    await persist();
    if (onlyFirst) stopFlag = true;
  }

  async function start() {
    if (running) return;
    setError("");
    if (!/\/project\//.test(location.pathname)) {
      setError("Abra um projeto do Flow (a tela com suas imagens e vídeos, não a ferramenta ClipGringa) e clique em Começar de novo.");
      return;
    }
    try {
      parsePackage(el("pkg").value); // define o modelo pedido pelo pacote
      if (!state.jobs.length || el("pkg").value.trim() !== (state.raw || "")) {
        const parsed = parsePackage(el("pkg").value);
        state = { jobs: parsed.jobs, done: {}, errors: {}, raw: el("pkg").value.trim() };
      }
    } catch (e) { setError(e.message); return; }
    running = true; stopFlag = false;
    el("go").disabled = true; el("stop").disabled = false;
    const onlyFirst = el("test").checked;
    await persist(); render();
    try {
      for (const job of state.jobs) {
        if (state.done[job.key]) continue;
        if (stopFlag) break;
        try { await runJob(job, onlyFirst); } catch (e) {
          if (e.message === "STOP") break;
          state.errors[job.key] = e.message;
          setError(`${`Vídeo ${pad(job.vi + 1)} · Cena ${pad(job.si + 1)}`}: ${e.message}`);
          await persist();
        }
        render();
      }
      const left = state.jobs.filter((j) => !state.done[j.key]).length;
      state.current = null; state.phase = "";
      setNow(left === 0 ? "Tudo pronto! Os vídeos foram baixados na pasta Downloads/ClipGringa. Envie-os no ClipGringa." : stopFlag ? "Parado. Clique em Começar para continuar de onde parou." : `Terminou com ${left} cena(s) pendente(s). Clique em Começar para tentar de novo.`);
    } finally {
      running = false; el("go").disabled = false; el("stop").disabled = true; render();
    }
  }

  el("go").addEventListener("click", start);
  el("stop").addEventListener("click", () => { stopFlag = true; setNow("Parando assim que a etapa atual terminar…"); });
  el("clear").addEventListener("click", async () => {
    if (running) return;
    state = { jobs: [], done: {}, errors: {} };
    el("pkg").value = ""; setError(""); setNow("Pronto para começar."); render(); await storage.set(null);
  });
  el("min").addEventListener("click", () => {
    const body = el("body"); const hidden = body.style.display === "none";
    body.style.display = hidden ? "flex" : "none"; el("min").textContent = hidden ? "–" : "+";
  });

  window.__clipgringaDebug = { el, start, getState: () => state };

  storage.get().then((saved) => {
    if (saved && saved.jobs && saved.jobs.length) {
      state = { jobs: saved.jobs, done: saved.done || {}, errors: saved.errors || {}, raw: (saved.raw || "").trim() };
      el("pkg").value = saved.raw || "";
      const left = state.jobs.filter((j) => !state.done[j.key]).length;
      setNow(left ? `Pacote carregado: ${left} cena(s) faltando. Clique em Começar para continuar.` : "Pacote concluído. Clique em Limpar para começar outro.");
      render();
    }
  });
})();
