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
  const RETRIES = 3;

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
  let fallbackModels = []; // modelos mais baratos a tentar quando a conta não tem o pedido (ex.: sem Lower Priority)
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
    fallbackModels = Array.isArray(data.fallbackModels) ? data.fallbackModels.map((x) => String(x)).filter(Boolean) : [];
    try { el("chipmodel").textContent = isLowerPriority() ? "LOWER PRIORITY · 0 CRÉDITOS" : `${flowModel.toUpperCase()} · GASTA CRÉDITOS`; } catch (_e) { /* painel ainda não existe */ }
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
    const matchesOne = (t, n) => t.includes(n) && (n === "[Lower Priority]" || !/\[Lower Priority\]/i.test(t));
    const trigger = await waitFor(() => $$("button.mat-mdc-menu-trigger", overlay()).find(visible), 3000);
    if (!trigger) return text(null) || "";
    if (matchesOne(text(trigger), needle)) return text(trigger);
    trigger.click();
    const items = () => $$("[role=menuitem], .mat-mdc-menu-item", overlay()).filter(visible);
    let item = await waitFor(() => items().find((i) => matchesOne(text(i), needle)), 4000);
    let used = needle;
    if (!item && fallbackModels.length) {
      // A conta não tem o modelo pedido: usa o mais barato que ela tiver.
      for (const alt of fallbackModels) {
        item = items().find((i) => matchesOne(text(i), alt));
        if (item) { used = alt; break; }
      }
      if (item) { flowModel = used; fallbackModels = []; setNow(`Sua conta não tem “${needle}”. Usando ${text(item).split("\n")[0]} (gasta créditos).`); }
    }
    if (!item) {
      const seen = items().map((i) => text(i).split("\n")[0]).filter(Boolean).slice(0, 6).join(" | ");
      await closeSettings();
      throw new Error(`O Flow não mostrou o modelo “${needle}” nesta conta (modelos que apareceram: ${seen || "nenhum"}). ${needle === "[Lower Priority]" ? "Confira se o Veo 3.1 Lite [Lower Priority] aparece nos ajustes do Flow (ele é do plano Ultra)." : "Confira o nome do modelo nos ajustes do Flow."}`);
    }
    item.click();
    await sleep(500);
    return used;
  }

  let cfgStep = "";
  async function configure(kind) {
    const steps = async () => {
      cfgStep = "fechando o painel do Agente"; await ensureDirectMode();
      cfgStep = "abrindo os ajustes do Flow"; await openSettings();
      if (kind === "image") {
        cfgStep = "escolhendo imagem"; await pickRadio("image");
        cfgStep = "formato 9:16"; await pickRadio("crop_9_16");
        cfgStep = "quantidade x1"; await pickRadioByLabel("x1");
      } else {
        cfgStep = "escolhendo vídeo"; await pickRadio("videocam");
        await sleep(300);
        cfgStep = "modo Frames (primeiro quadro)"; await pickRadio("crop_free");
        cfgStep = "formato 9:16"; await pickRadio("crop_9_16");
        cfgStep = "duração 8s"; await pickRadioByLabel("8s");
        cfgStep = "quantidade x1"; await pickRadioByLabel("x1");
        cfgStep = `modelo ${flowModel}`; await ensureModel(flowModel);
      }
      cfgStep = "fechando os ajustes"; await closeSettings();
    };
    let timer = 0;
    try {
      await Promise.race([
        steps(),
        new Promise((_, reject) => { timer = window.setTimeout(() => reject(new Error(`O Flow não respondeu nos ajustes (travou em: ${cfgStep}). Confira se a aba do Flow está aberta e visível.`)), 75000); }),
      ]);
    } finally { window.clearTimeout(timer); }
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

  const generateButton = () => {
    const ed = editor();
    const isArrow = (b) => text(b).split("\n").map((x) => x.trim()).includes("arrow_forward");
    // sobe da caixa de texto até achar o container que tem a seta de enviar (o promptBox() pode ser só a parte do texto)
    let node = ed;
    for (let i = 0; node && i < 10; i += 1, node = node.parentElement) {
      const hit = $$("button", node).filter(visible).find((b) => isArrow(b) || /gerar|criar|enviar|generate|create|send|submit/i.test(b.getAttribute("aria-label") || b.title || ""));
      if (hit) return hit;
    }
    // último recurso: a seta visível mais perto da caixa de texto, em qualquer lugar da página
    const all = $$("button", document).filter(visible).filter((b) => isArrow(b) || /arrow_upward|send/.test(text(b)));
    if (!all.length) return undefined;
    if (!ed) return all[0];
    const er = ed.getBoundingClientRect();
    const dist = (b) => { const r = b.getBoundingClientRect(); return Math.hypot(r.left + r.width / 2 - (er.right), r.top + r.height / 2 - (er.bottom)); };
    return all.sort((x, y) => dist(x) - dist(y))[0];
  };

  async function pressGenerate() {
    const btn = await waitFor(() => { const b = generateButton(); return b && !b.disabled && b.getAttribute("aria-disabled") !== "true" ? b : null; }, 8000);
    if (!btn) throw new Error("O botão de gerar do Flow está desativado.");
    const before = tileKeys();
    const startedNow = () => {
      const ed = editor();
      if (ed && !text(ed).trim()) return true; // o Flow limpa a caixa ao enviar
      return firstTiles(12).some((t) => !before.has(t.src) || /%/.test(t.info));
    };
    const settle = async () => { for (let i = 0; i < 10; i += 1) { await sleep(400); if (startedNow()) return true; } return false; };
    btn.scrollIntoView({ block: "center" });
    const r = btn.getBoundingClientRect();
    // 1) clique confiável (chrome.debugger)
    try { await chrome.runtime.sendMessage({ type: "clipgringa-click", x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }); } catch (_) {}
    if (await settle()) return;
    // 2) clique direto com eventos completos
    for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) btn.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
    if (await settle()) return;
    btn.click();
    if (await settle()) return;
    // 3) Enter de verdade na caixa de prompt, depois Enter simulado
    const ed = editor();
    if (ed) {
      ed.focus();
      try { await chrome.runtime.sendMessage({ type: "clipgringa-key" }); } catch (_) {}
      if (await settle()) return;
      for (const type of ["keydown", "keypress", "keyup"]) ed.dispatchEvent(new KeyboardEvent(type, { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true }));
      if (await settle()) return;
    }
    throw new Error("Escrevi o prompt, mas o Flow não aceitou o envio. Clique na seta do Flow uma vez; eu continuo daí.");
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
      if (stopFlag) throw new Error("STOP");
      if (Date.now() > end) throw new Error("O Flow demorou demais para terminar.");
      await sleep(1500);
    }
  }

  /* ---------- primeiro quadro (Início) ---------- */
  async function realClick(node) {
    const r = node.getBoundingClientRect();
    try {
      const res = await chrome.runtime.sendMessage({ type: "clipgringa-click", x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) });
      if (res && res.ok) return;
    } catch (_) { /* plano B */ }
    node.click();
  }
  const pickerItems = () => {
    const root = overlay();
    const direct = $$(".asset-item", root).filter(visible);
    if (direct.length) return direct;
    const alt = $$("[class*=asset-item], [class*=asset_item], [role=option], [role=listitem]", root).filter((n) => visible(n) && n.querySelector("img"));
    if (alt.length) return alt;
    return null;
  };
  async function chooseStartFrame(imageSrc) {
    const trigger = await waitFor(() => $$(".frame-trigger").find(visible), 6000);
    if (!trigger) throw new Error("Não achei o campo “Início” do Flow (modo Frames).");
    let items = null;
    for (let attempt = 0; attempt < 3 && !items; attempt += 1) {
      trigger.scrollIntoView({ block: "center" });
      if (attempt === 0) trigger.click(); else await realClick(trigger);
      items = await waitFor(pickerItems, 5000, 250);
    }
    if (!items) {
      const seen = $$("[class]", overlay()).filter(visible).slice(0, 12).map((n) => String(n.className).split(" ")[0]).filter(Boolean);
      throw new Error(`A lista de imagens do Flow não abriu (vi: ${[...new Set(seen)].join(", ") || "nada"}).`);
    }
    await sleep(600);
    const all = pickerItems() || [];
    let target = all.find((i) => $$("img", i.parentElement || i).some((im) => baseSrc(im.src) === imageSrc));
    if (!target) target = all[0];
    target.click();
    await sleep(500);
    const add = await waitFor(() => $$("button", overlay()).find((b) => visible(b) && /detail-add|include/i.test(b.className)), 5000);
    if (!add) throw new Error("Não achei o botão “Incluir no comando”.");
    add.click();
    await waitFor(() => !pickerItems(), 5000);
    await sleep(500);
  }

  /* ---------- download ---------- */
  function nameNextDownload(filename, upload) {
    return new Promise((resolve) => {
      try {
        if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
          chrome.runtime.sendMessage({ type: "clipgringa-name", filename, upload: upload || null }, () => resolve());
          return;
        }
      } catch (_e) { /* ignora */ }
      resolve();
    });
  }

  function toBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let out = "";
    for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(out);
  }

  // Lê o vídeo pronto direto do card do Flow e manda para o ClipGringa. Devolve true se enviou.
  async function uploadVideo(tile, job) {
    if (!uploadInfo) return false;
    try {
      const v = tile.tile.querySelector("video");
      const src = v && (v.currentSrc || v.src);
      if (!src) throw new Error("o card não mostra o endereço do vídeo");
      const res = await fetch(src, { credentials: "include" });
      if (!res.ok) throw new Error(`o Flow respondeu ${res.status}`);
      const buffer = await res.arrayBuffer();
      if (buffer.byteLength > 120 * 1024 * 1024) throw new Error("vídeo grande demais");
      const reply = await chrome.runtime.sendMessage({ type: "clipgringa-upload", upload: uploadInfo, file: job.file, b64: toBase64(buffer) });
      if (!reply || !reply.ok) throw new Error((reply && reply.error) || "sem resposta da extensão");
      state.cloud[job.key] = "ok";
      return true;
    } catch (e) {
      state.cloud[job.key] = "fail";
      setNow(`Não consegui enviar ${job.file} pela página (${(e && e.message) || e}). Tento pelo download.`);
      return false;
    }
  }

  async function downloadTile(tile, filename, upload) {
    const img = tile.img;
    img.click();
    const dl = await waitFor(() => $$("button").find((b) => visible(b) && text(b) === "download"), 10000);
    if (!dl) throw new Error("Não achei o botão de baixar do Flow.");
    await nameNextDownload(filename, upload);
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
  *{box-sizing:border-box}
  .box{position:fixed;top:72px;right:16px;width:372px;max-height:calc(100vh - 100px);overflow:auto;z-index:2147483000;color:#f2eefc;font:13px/1.45 "Google Sans",Inter,system-ui,sans-serif;border-radius:22px;padding:1px;
    background:linear-gradient(160deg,rgba(169,139,255,.7),rgba(123,63,228,.15) 35%,rgba(70,40,160,.1) 70%,rgba(169,139,255,.5));box-shadow:0 0 0 1px rgba(0,0,0,.4),0 24px 70px rgba(80,30,200,.45),0 0 40px rgba(123,63,228,.25)}
  .inner{border-radius:21px;background:radial-gradient(120% 80% at 100% 0%,rgba(123,63,228,.28),transparent 55%),radial-gradient(90% 60% at 0% 100%,rgba(58,155,187,.12),transparent 60%),#0a0814;overflow:hidden}
  .head{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid rgba(255,255,255,.07)}
  .orb{width:30px;height:30px;border-radius:50%;flex:none;background:conic-gradient(from 0deg,#7b3fe4,#a98bff,#3a9bbb,#7b3fe4);animation:spin 5s linear infinite;position:relative;box-shadow:0 0 18px rgba(123,63,228,.7)}
  .orb:after{content:"";position:absolute;inset:5px;border-radius:50%;background:#0a0814}
  .idle .orb{animation-duration:4s}
  .run .orb{animation-duration:1.3s}
  .ring{position:fixed;z-index:2147482999;pointer-events:none;border-radius:14px;border:3px solid #a98bff;box-shadow:0 0 0 4px rgba(123,63,228,.35),0 0 28px 6px rgba(169,139,255,.6);animation:ringpulse 1.2s ease-in-out infinite}
  .ring[hidden]{display:none}
  button.b.pulse{animation:gopulse 1.2s ease-in-out infinite}
  .ttl{flex:1;min-width:0}
  .eyebrow{font:600 9px ui-monospace,SFMono-Regular,monospace;letter-spacing:.18em;color:#a98bff;text-transform:uppercase}
  .title{font-weight:700;font-size:15px;letter-spacing:-.01em}
  .x{background:rgba(255,255,255,.06);border:0;color:#c9bbfa;cursor:pointer;font-size:15px;width:26px;height:26px;border-radius:50%}
  .x:hover{background:rgba(255,255,255,.12)}
  .body{padding:14px 16px 16px;display:flex;flex-direction:column;gap:12px}
  .chips{display:flex;gap:6px;flex-wrap:wrap}
  .chip{font:600 10px ui-monospace,monospace;letter-spacing:.06em;padding:4px 9px;border-radius:99px;border:1px solid rgba(169,139,255,.35);color:#c9bbfa;background:rgba(123,63,228,.12);display:inline-flex;align-items:center;gap:6px}
  .dot{width:6px;height:6px;border-radius:50%;background:#5bd69a;box-shadow:0 0 8px #5bd69a}
  .run .dot{background:#f5b454;box-shadow:0 0 8px #f5b454;animation:pulse 1.1s ease-in-out infinite}
  .status{border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.03);border-radius:16px;padding:12px 14px}
  .now{font-size:13px;color:#f2eefc}
  .muted{font-size:11px;color:#a79fb8}
  .err{font-size:12px;color:#ff7a95;margin-top:6px}
  .err:empty{display:none}
  .bar{height:6px;border-radius:99px;background:rgba(255,255,255,.08);overflow:hidden;margin-top:10px;position:relative}
  .bar>i{display:block;height:100%;width:0;border-radius:99px;background:linear-gradient(90deg,#5a1baa,#7b3fe4,#a98bff);box-shadow:0 0 14px #7b3fe4;transition:width .5s}
  .steps{display:flex;gap:6px;margin-bottom:10px}
  .stp{flex:1;display:flex;align-items:center;gap:6px;padding:6px 8px;border-radius:12px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.03);font:600 10px ui-monospace,monospace;letter-spacing:.05em;text-transform:uppercase;color:#8d85a3;position:relative;overflow:hidden}
  .stp i{width:16px;height:16px;border-radius:50%;flex:none;border:2px solid rgba(255,255,255,.18);display:grid;place-items:center;font-style:normal;font-size:9px}
  .stp.on{color:#fff;border-color:rgba(245,180,84,.6);background:rgba(245,180,84,.08)}
  .stp.on i{border:2px solid transparent;border-top-color:#f5b454;border-right-color:#f5b454;animation:spin .9s linear infinite}
  .stp.on:after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,transparent,rgba(255,255,255,.12),transparent);animation:scan 1.8s linear infinite}
  .stp.ok{color:#5bd69a;border-color:rgba(91,214,154,.35)}
  .stp.ok i{border-color:#5bd69a;background:#5bd69a;color:#0a0814}
  .doing{font-weight:700;font-size:14px;margin-bottom:2px}
  .pbar{height:8px;border-radius:99px;background:rgba(255,255,255,.08);overflow:hidden;width:100%}
  .pbar i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,#8B5CF6,#A98BFF);transition:width .8s ease}
  .plabel{display:flex;justify-content:space-between;width:100%;margin-top:6px}
  .clock{font:600 11px ui-monospace,monospace;color:#c9bbfa;margin-top:8px;display:flex;gap:10px;flex-wrap:wrap}
  .clock span{padding:3px 8px;border-radius:99px;background:rgba(123,63,228,.14);border:1px solid rgba(169,139,255,.25)}
  .run .bar:after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,transparent,rgba(255,255,255,.35),transparent);animation:scan 1.6s linear infinite}
  .row{display:flex;gap:8px;flex-wrap:wrap}
  button.b{border:0;border-radius:99px;padding:10px 18px;font:600 12px inherit;cursor:pointer;color:#fff;background:linear-gradient(135deg,#8b5cf6,#7b3fe4);box-shadow:0 8px 22px -8px #7b3fe4}
  button.b:hover:not(:disabled){filter:brightness(1.12)}
  button.b.o{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.16);color:#e8e2f8;box-shadow:none}
  button.b:disabled{opacity:.4;cursor:default}
  details.adv{border:1px dashed rgba(255,255,255,.14);border-radius:14px;padding:9px 12px}
  details.adv summary{cursor:pointer;font:600 10px ui-monospace,monospace;letter-spacing:.12em;color:#a79fb8;text-transform:uppercase}
  textarea{width:100%;min-height:76px;resize:vertical;margin-top:10px;background:#07060d;color:#d9d2ee;border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:8px;font:11px ui-monospace,monospace}
  ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:5px;max-height:210px;overflow:auto}
  li{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:12px;padding:8px 11px;border-radius:12px;background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.05)}
  li.cur{border-color:rgba(245,180,84,.45);background:rgba(245,180,84,.07)}
  li span:last-child{font:600 10px ui-monospace,monospace;letter-spacing:.06em;text-transform:uppercase}
  .st-done{color:#5bd69a}.st-run{color:#f5b454}.st-err{color:#ff7a95}.st-wait{color:#8d85a3}
  label.chk{display:flex;gap:6px;align-items:center;font-size:11px;color:#c9bbfa;margin-top:10px}
  @keyframes spin{to{transform:rotate(360deg)}}
  @keyframes pulse{50%{opacity:.35}}
  @keyframes ringpulse{50%{opacity:.45;transform:scale(1.04)}}
  @keyframes gopulse{50%{box-shadow:0 0 0 6px rgba(139,92,246,.35),0 8px 22px -8px #7b3fe4}}
  @keyframes scan{from{transform:translateX(-100%)}to{transform:translateX(100%)}}
  @media (prefers-reduced-motion:reduce){.run .dot,.run .bar:after,.ring,button.b.pulse,.stp.on:after{animation:none}}
  `;

  const host = document.createElement("div");
  host.id = "clipgringa-flow-host";
  document.documentElement.appendChild(host);
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `
  <style>${css}</style>
  <div class="ring" id="ring" hidden></div>
  <div class="box idle" id="box"><div class="inner">
    <div class="head"><span class="orb"></span><div class="ttl"><div class="eyebrow">Piloto automático · Flow</div><div class="title">ClipGringa</div></div><button class="x" id="min" title="Minimizar">–</button></div>
    <div class="body" id="body">
      <div class="chips"><span class="chip"><i class="dot"></i><span id="chipst">PRONTO</span></span><span class="chip" id="chipmodel">LOWER PRIORITY · 0 CRÉDITOS</span></div>
      <div class="status">
        <div class="steps" id="steps" hidden>
          <div class="stp" data-p="imagem"><i>1</i>Imagem</div><div class="stp" data-p="vídeo"><i>2</i>Animar</div><div class="stp" data-p="enviando"><i>3</i>Enviar</div><div class="stp" data-p="baixando"><i>4</i>Baixar</div>
        </div>
        <div class="doing" id="doing"></div>
        <div class="now" id="now">Pronto. Envie o pacote pelo site e eu faço o resto sozinho.</div>
        <div class="err" id="err"></div>
        <div class="bar"><i id="fill"></i></div>
        <div class="clock" id="clock" hidden></div>
      </div>
      <ul id="list"></ul>
      <div class="row"><button class="b" id="go">Começar</button><button class="b o" id="stop" disabled>Parar</button><button class="b o" id="clear">Limpar</button></div>
      <details class="adv"><summary>Pacote (avançado)</summary>
        <textarea id="pkg" placeholder='Cole aqui o pacote do ClipGringa'></textarea>
        <label class="chk"><input type="checkbox" id="fast" checked> Modo rápido BETA (várias cenas ao mesmo tempo)</label>
        <label class="chk"><input type="checkbox" id="test"> Só a primeira cena (teste)</label>
      </details>
    </div>
  </div></div>`;

  const el = (id) => root.getElementById(id);
  let running = false;
  let stopFlag = false;
  let state = { jobs: [], done: {}, errors: {}, cloud: {} };
  let uploadInfo = null; // destino no ClipGringa (token curto enviado pelo site junto com o pacote)

  let nowText = "";
  function setNow(msg) { nowText = msg; el("now").textContent = msg; publish(); }
  // Conta o andamento ao site do ClipGringa (barra de progresso, tempo de cada vídeo, o que está fazendo).
  const PROGRESS_KEY = "clipgringa-flow-progress-v1";
  const IMAGES_KEY = "clipgringa-flow-images-v1";
  const jobPct = {}; // porcentagem em andamento de cada cena (só na memória)
  let lastPublish = 0;
  function publish(force) {
    if (!force && Date.now() - lastPublish < 800) return;
    lastPublish = Date.now();
    try {
      const jobs = state.jobs || [];
      const cur = jobs.find((j) => j.key === state.current);
      chrome.storage.local.set({ [PROGRESS_KEY]: {
        at: Date.now(), running: !!running, total: jobs.length,
        done: jobs.filter((j) => state.done[j.key]).length,
        errors: Object.keys(state.errors || {}).length,
        phase: state.phase || "", now: nowText,
        current: cur ? { vi: cur.vi, si: cur.si } : null,
        startedAt: runAt || 0, jobStartedAt: jobAt || 0,
        dur: state.dur || {},
        jobs: jobs.map((j) => ({ key: j.key, vi: j.vi, si: j.si, file: j.file, done: !!state.done[j.key], error: state.errors[j.key] || "", pct: typeof jobPct[j.key] === "number" ? jobPct[j.key] : null })),
      } });
    } catch (_e) { /* extensão recarregada */ }
  }
  window.setInterval(() => publish(true), 2000);
  function setRunning(on) {
    const box = el("box"); box.classList.toggle("run", on); box.classList.toggle("idle", !on);
    el("chipst").textContent = on ? "TRABALHANDO" : "PRONTO";
  }
  function setError(msg) { el("err").textContent = msg || ""; }

  /* ---------- etapa atual, tempo e previsão ---------- */
  const PHASES = ["imagem", "vídeo", "enviando", "baixando"];
  const DOING = {
    "imagem": "Etapa 1 de 4 · Gerando a imagem da cena",
    "vídeo": "Etapa 2 de 4 · Animando a imagem em vídeo",
    "enviando": "Etapa 3 de 4 · Enviando o vídeo para o ClipGringa",
    "baixando": "Etapa 4 de 4 · Baixando o vídeo",
  };
  let phaseAt = 0; let jobAt = 0; let runAt = 0;
  const fmt = (sec) => { sec = Math.max(0, Math.round(sec)); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`; };
  const fmtMin = (sec) => (sec < 90 ? "menos de 2 min" : `~${Math.round(sec / 60)} min`);
  function setPhase(name) {
    state.phase = name; phaseAt = Date.now();
    el("doing").textContent = DOING[name] || "";
    tickClock(); render();
  }
  function avgJobSeconds() {
    const values = Object.values(state.dur || {}).filter((v) => v > 0);
    return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 240; // sem histórico: ~4 min por cena
  }
  function tickClock() {
    const steps = el("steps"); const clock = el("clock");
    const on = running && state.phase;
    steps.hidden = !on; clock.hidden = !on;
    if (!on) { el("doing").textContent = ""; return; }
    const idx = PHASES.indexOf(state.phase);
    steps.querySelectorAll(".stp").forEach((node, i) => { node.classList.toggle("on", i === idx); node.classList.toggle("ok", i < idx); const dot = node.querySelector("i"); dot.textContent = i < idx ? "✓" : String(i + 1); });
    const left = state.jobs.filter((j) => !state.done[j.key]).length;
    const avg = avgJobSeconds();
    const thisJob = (Date.now() - jobAt) / 1000;
    const remaining = Math.max(0, left - 1) * avg + Math.max(30, avg - thisJob);
    const total = state.jobs.length || 1;
    const doneN = total - left;
    const within = Math.min(0.95, Math.max(0, (idx + 0.5) / PHASES.length));
    const pct = Math.min(99, Math.round(((doneN + within) / total) * 100));
    const nth = Math.min(total, doneN + 1);
    clock.innerHTML = `<div class="pbar"><i style="width:${pct}%"></i></div><div class="plabel"><span>Cena ${nth} de ${total}</span><span>${pct}%</span></div>`;
  }
  window.setInterval(() => { if (running) tickClock(); }, 1000);

  function render() {
    const total = state.jobs.length;
    const done = state.jobs.filter((j) => state.done[j.key]).length;
    el("fill").style.width = total ? `${Math.round((done / total) * 100)}%` : "0";
    el("list").innerHTML = state.jobs.map((j) => {
      const label = `Vídeo ${pad(j.vi + 1)} · Cena ${pad(j.si + 1)}`;
      let st = "<span class='st-wait'>na fila</span>";
      if (state.done[j.key]) st = `<span class='st-done'>baixado${state.cloud[j.key] === "ok" ? " · no ClipGringa" : state.cloud[j.key] ? " · não enviado" : ""}</span>`;
      else if (state.errors[j.key]) st = "<span class='st-err'>erro</span>";
      else if (state.current === j.key) st = `<span class='st-run'>${state.phase || "gerando"}</span>`;
      return `<li class="${state.current === j.key ? "cur" : ""}"><span>${label}</span>${st}</li>`;
    }).join("");
  }

  let autoRun = false;
  async function persist() {
    await storage.set({ jobs: state.jobs, done: state.done, errors: state.errors, cloud: state.cloud, dur: state.dur || {}, upload: uploadInfo, raw: el("pkg").value, auto: autoRun });
  }

  async function withRetry(label, fn) {
    let lastError;
    for (let attempt = 0; attempt <= RETRIES; attempt += 1) {
      if (stopFlag) throw new Error("STOP");
      try { return await fn(attempt); } catch (e) {
        lastError = e;
        if (e.message === "STOP") throw e;
        if (attempt < RETRIES) {
          const limited = /limite|limit|quota|cota|muitas|too many|esperar|wait|try again|tente novamente/i.test(String(e.message));
          const wait = limited ? 20 + attempt * 30 : 3;
          const why = limited ? "o Flow pediu para esperar" : `não deu certo (${String(e.message).slice(0, 90)})`;
          for (let s = wait; s > 0; s -= 1) {
            if (stopFlag) throw new Error("STOP");
            setNow(`${label}: ${why}. Tentando de novo em ${s}s (tentativa ${attempt + 2} de ${RETRIES + 1})…`);
            await sleep(1000);
          }
        }
      }
    }
    throw lastError;
  }

  async function makeImage(job, label) {
    setPhase("imagem");
    return withRetry(`${label} (imagem)`, async () => {
      setNow(`${label}: preparando o Flow para gerar a imagem…`);
      await configure("image");
      await setPrompt(job.imagePrompt);
      const before = tileKeys();
      await pressGenerate();
      setNow(`${label}: gerando a imagem (cerca de 15 segundos)…`);
      return waitNewTile(before, "image", IMAGE_WAIT_MS, (p) => { if (p != null) { jobPct[job.key] = p; setNow(`${label}: gerando a imagem… ${p}%`); } });
    }).then(async (image) => { jobPct[job.key] = 100; await keepImage(job, image); delete jobPct[job.key]; return image; });
  }

  // Guarda uma miniatura da imagem da cena (para o ClipGringa mostrar e deixar baixar). Nunca atrapalha a geração.
  async function keepImage(job, image) {
    try {
      const url = `${baseSrc(image.src)}=s1080`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) return;
      const bitmap = await createImageBitmap(await res.blob());
      const scale = Math.min(1, 1080 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
      canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
      const all = (await chrome.storage.local.get(IMAGES_KEY))[IMAGES_KEY] || {};
      all[job.key] = { file: job.file.replace(/\.mp4$/i, ".jpg"), data: dataUrl };
      await chrome.storage.local.set({ [IMAGES_KEY]: all });
      // Guarda também no banco de imagens da conta (somente o dono vê).
      if (uploadInfo) {
        try { await chrome.runtime.sendMessage({ type: "clipgringa-upload", upload: uploadInfo, file: all[job.key].file, b64: dataUrl.split(",")[1] }); } catch (_e) { /* ignora */ }
      }
    } catch (_e) { /* sem miniatura: tudo o resto segue */ }
  }

  async function finishJob(job, video, label) {
    state.current = job.key;
    setPhase("enviando");
    setNow(`${label}: enviando ${job.file} para o ClipGringa…`);
    const sent = await uploadVideo(video, job);
    setPhase("baixando");
    setNow(`${label}: baixando ${job.file}…`);
    await withRetry(`${label} (download)`, () => downloadTile(video, job.file, sent || !uploadInfo ? null : uploadInfo));
    state.done[job.key] = true;
    state.dur = { ...(state.dur || {}), [job.key]: Math.round((Date.now() - jobAt) / 1000) };
    delete state.errors[job.key];
    await persist();
  }

  async function runJob(job, onlyFirst) {
    const label = `Vídeo ${pad(job.vi + 1)} · Cena ${pad(job.si + 1)}`;
    state.current = job.key; jobAt = Date.now();

    // 1) imagem (primeiro passo: a imagem da cena)
    const image = await makeImage(job, label);

    // 2) vídeo: anima a imagem aprovada, em Lower Priority
    setPhase("vídeo");
    const video = await withRetry(`${label} (vídeo)`, async (attemptNo) => {
      setNow(isLowerPriority() ? `${label}: escolhendo Veo 3.1 Lite [Lower Priority] (0 créditos)…` : `${label}: escolhendo o modelo ${flowModel} (gasta créditos do Flow)…`);
      await configure("video");
      try { await chooseStartFrame(image.src); } catch (pickErr) {
        // Última tentativa: sem escolher o quadro inicial, o Flow ainda anima pelo texto (a imagem não entra, mas o vídeo sai).
        if (/vi:|Início|Incluir/.test(String(pickErr.message)) && attemptNo >= RETRIES) setNow(`${label}: não consegui escolher a imagem inicial, animando só pelo texto.`);
        else throw pickErr;
      }
      await setPrompt(job.videoPrompt);
      const before = tileKeys();
      await pressGenerate();
      setNow(`${label}: o Flow está animando${isLowerPriority() ? " em Lower Priority" : ""}. Pode levar de 1 a 6 minutos, não feche esta aba.`);
      return waitNewTile(before, "video", VIDEO_WAIT_MS, (p) => { if (p != null) { jobPct[job.key] = p; setNow(`${label}: animando${isLowerPriority() ? " em Lower Priority" : ""}… ${p}%`); } });
    });

    // 3) enviar para o ClipGringa e 4) baixar
    await finishJob(job, video, label);
    if (onlyFirst) stopFlag = true;
  }

  /* ---------- modo rápido (BETA): o Flow anima várias cenas ao mesmo tempo ---------- */
  const VIDEO_PARALLEL = 3;
  const tilesNow = () => firstTiles(40);
  const generatingNow = (info) => /\d+\s*%/.test(info) || /gerando|generating/i.test(info);
  const labelOf = (job) => `Vídeo ${pad(job.vi + 1)} · Cena ${pad(job.si + 1)}`;

  function locateTile(rec) {
    if (rec.tile && rec.tile.isConnected) {
      const img = rec.tile.querySelector("img");
      if (img) return { src: baseSrc(img.src), img, tile: rec.tile, info: rec.tile.innerText || "" };
    }
    return tilesNow().find((t) => t.src === rec.src) || null;
  }

  // Manda animar uma cena e volta assim que o Flow começa (sem esperar o vídeo ficar pronto).
  async function submitVideo(job, image, label, attemptNo) {
    setPhase("vídeo");
    setNow(`${label}: mandando animar (as outras cenas continuam em paralelo)…`);
    await configure("video");
    try { await chooseStartFrame(image.src); } catch (pickErr) {
      if (/vi:|Início|Incluir/.test(String(pickErr.message)) && attemptNo >= RETRIES) setNow(`${label}: não consegui escolher a imagem inicial, animando só pelo texto.`);
      else throw pickErr;
    }
    await setPrompt(job.videoPrompt);
    const known = new Set(tilesNow().map((t) => t.src));
    const count0 = known.size;
    await pressGenerate();
    const appeared = await waitFor(() => { const now = tilesNow(); return now.length > count0 ? now.find((t) => !known.has(t.src)) || null : null; }, 30000, 700);
    if (!appeared) throw new Error("O Flow não começou a animar esta cena.");
    return { src: appeared.src, tile: appeared.tile, t0: Date.now() };
  }

  function failJob(job, message) {
    state.errors[job.key] = message;
    setError(`${labelOf(job)}: ${message}`);
  }

  async function collectVideos(batch) {
    const end = Date.now() + VIDEO_WAIT_MS;
    const waiting = new Map(batch.map((b) => [b.job.key, { ...b, since: Date.now() }]));
    while (waiting.size) {
      if (stopFlag) throw new Error("STOP");
      const pcts = [];
      for (const [key, b] of Array.from(waiting)) {
        const t = locateTile(b.rec);
        if (!t) { if (Date.now() - b.since > 90000) { failJob(b.job, "não achei esta cena na grade do Flow"); waiting.delete(key); } continue; }
        b.since = Date.now();
        if (/falha|failed|erro|error/i.test(t.info.replace(/arrow_forward/g, ""))) { failJob(b.job, "O Flow marcou esta geração como falha."); waiting.delete(key); continue; }
        const done = !generatingNow(t.info) && (/play_circle|videocam|movie/.test(t.info) || t.tile.querySelector("video"));
        if (done) {
          waiting.delete(key);
          jobAt = b.rec.t0;
          try { await finishJob(b.job, t, labelOf(b.job)); } catch (e) { if (e.message === "STOP") throw e; failJob(b.job, e.message); }
          await persist(); render();
        } else { const pct = (t.info.match(/(\d+)\s*%/) || [])[1]; if (pct) jobPct[key] = Number(pct); pcts.push(`${labelOf(b.job)} ${pct ? pct + "%" : "na fila"}`); }
      }
      if (pcts.length) setNow(`Animando ${pcts.length} cena(s) ao mesmo tempo no Flow: ${pcts.join(" · ")}`);
      if (Date.now() > end) { for (const [, b] of waiting) failJob(b.job, "O Flow demorou demais para terminar."); return; }
      await sleep(1500);
    }
  }

  async function runPipeline() {
    const jobs = state.jobs.filter((j) => !state.done[j.key]);
    const images = {};
    // 1) todas as imagens, uma depois da outra (rápido: cerca de 15 segundos cada)
    for (const job of jobs) {
      if (stopFlag) return;
      state.current = job.key; jobAt = Date.now();
      try { images[job.key] = await makeImage(job, labelOf(job)); } catch (e) {
        if (e.message === "STOP") { stopFlag = true; return; }
        failJob(job, e.message); await persist();
      }
      render();
    }
    // 2) as animações em grupos: manda 3 de uma vez e recolhe enquanto o Flow trabalha
    const ready = jobs.filter((j) => images[j.key]);
    for (let i = 0; i < ready.length && !stopFlag; i += VIDEO_PARALLEL) {
      const batch = [];
      for (const job of ready.slice(i, i + VIDEO_PARALLEL)) {
        if (stopFlag) break;
        state.current = job.key; render();
        try {
          const rec = await withRetry(`${labelOf(job)} (vídeo)`, (attemptNo) => submitVideo(job, images[job.key], labelOf(job), attemptNo));
          batch.push({ job, rec });
        } catch (e) { if (e.message === "STOP") { stopFlag = true; return; } failJob(job, e.message); await persist(); }
      }
      try { await collectVideos(batch); } catch (e) { if (e.message === "STOP") { stopFlag = true; return; } throw e; }
    }
  }

  const FLOW_HOME = "https://labs.google/fx/pt/tools/flow";
  // Só conta como projeto a tela do projeto em si (não páginas antigas como /project/…/tool/…, que dão "App não encontrada").
  const inProject = () => /\/project\/[^/]+\/?$/.test(location.pathname);

  const isNewProject = (b) => visible(b) && /(novo projeto|new project)/i.test(`${text(b)} ${b.getAttribute("aria-label") || ""}`.trim());

  // Garante que estamos dentro de um projeto do Flow: abre um novo sozinho quando preciso.
  async function ensureProject() {
    if (inProject()) return true;
    setNow("Abrindo um novo projeto no Flow…");
    const btn = await waitFor(() => $$("button, [role=button], a", document).find(isNewProject), 15000);
    if (!btn) {
      if (!/\/tools\/flow/.test(location.pathname)) { setNow("Indo para a página do Flow…"); location.href = FLOW_HOME; }
      return false;
    }
    btn.click();
    const inside = await waitFor(inProject, 25000, 300);
    if (inside) await sleep(3000);
    return Boolean(inside);
  }

  async function start() {
    if (running) return;
    setError("");
    if (!(await ensureProject())) {
      setError("Ainda não consegui abrir um projeto sozinho. Se a página recarregar, eu continuo; senão, abra um projeto do Flow.");
      return;
    }
    try {
      // Usa o primeiro pacote que for válido: o do painel, o já carregado, o pendente do site ou o último enviado (até 6 horas).
      const ok = (text) => { try { parsePackage(text); return true; } catch (_e) { return false; } };
      let raw = "";
      const pending = (await chrome.storage.local.get(PENDING_KEY))[PENDING_KEY];
      const last = (await chrome.storage.local.get("clipgringa-flow-last-v1"))["clipgringa-flow-last-v1"];
      const options = [
        { text: el("pkg").value.trim() },
        { text: state.raw || "" },
        { text: pending && pending.raw ? pending.raw.trim() : "", upload: pending && pending.upload },
        { text: last && last.raw && Date.now() - last.at < 6 * 3600 * 1000 ? last.raw.trim() : "", upload: last && last.upload },
      ];
      const found = options.find((o) => o.text && ok(o.text));
      if (found) { raw = found.text; if (found.upload) uploadInfo = found.upload; el("pkg").value = raw; }
      if (!raw) throw new Error("Ainda não recebi o pacote. Volte ao ClipGringa (Clonar vídeo), deixe chegar em “Tudo pronto” e clique em “Enviar para o Flow”; ele manda sozinho para cá.");
      parsePackage(raw); // define o modelo pedido pelo pacote
      if (!state.jobs.length || raw !== (state.raw || "")) {
        const parsed = parsePackage(raw);
        state = { jobs: parsed.jobs, done: {}, errors: {}, cloud: {}, raw };
        try { chrome.storage.local.remove(IMAGES_KEY); } catch (_e) { /* ignora */ }
        el("pkg").value = raw;
      }
    } catch (e) { setError(e.message); return; }
    running = true; autoRun = true; stopFlag = false; runAt = Date.now(); setRunning(true);
    el("go").disabled = true; el("stop").disabled = false;
    const onlyFirst = el("test").checked;
    await persist(); render();
    try {
      // Duas rodadas: cenas que falharam na primeira são tentadas de novo sozinhas no fim, sem você clicar.
      for (let round = 0; round < 2 && !stopFlag; round += 1) {
        if (round === 1) {
          const pending = state.jobs.filter((j) => !state.done[j.key]);
          if (!pending.length) break;
          setNow(`Tentando de novo ${pending.length} cena(s) que não saíram na primeira rodada…`);
          setError("");
        }
        if (round === 0 && !onlyFirst && el("fast").checked && state.jobs.filter((j) => !state.done[j.key]).length > 1) {
          try { await runPipeline(); } catch (e) { if (e.message === "STOP") stopFlag = true; else setError(`Modo rápido: ${e.message}. Vou tentar cena por cena.`); }
          render();
          continue;
        }
        for (const job of state.jobs) {
          if (state.done[job.key]) continue;
          if (stopFlag) break;
          try { await runJob(job, onlyFirst); } catch (e) {
            if (e.message === "STOP") { stopFlag = true; break; }
            state.errors[job.key] = e.message;
            setError(`${`Vídeo ${pad(job.vi + 1)} · Cena ${pad(job.si + 1)}`}: ${e.message}`);
            await persist();
          }
          render();
        }
        if (onlyFirst) break;
      }
      const left = state.jobs.filter((j) => !state.done[j.key]).length;
      state.current = null; state.phase = ""; if (!left || stopFlag) autoRun = false; await persist();
      setNow(left === 0 ? `Tudo pronto em ${fmt((Date.now() - runAt) / 1000)}! Os vídeos foram baixados na pasta Downloads/ClipGringa e enviados ao ClipGringa.` : stopFlag ? "Parado. Clique em Começar para continuar de onde parou." : `Terminou com ${left} cena(s) pendente(s). Clique em Começar para tentar de novo.`);
    } finally {
      running = false; setRunning(false); window.setTimeout(() => takePending(), 500); el("go").disabled = false; el("stop").disabled = true; state.phase = ""; tickClock(); render();
    }
  }

  el("go").addEventListener("click", start);
  let pasteTimer = 0;
  el("pkg").addEventListener("input", () => {
    // Colou o pacote? Começa sozinho, sem precisar clicar.
    window.clearTimeout(pasteTimer);
    pasteTimer = window.setTimeout(() => { try { parsePackage(el("pkg").value); if (!running) start(); } catch (_e) { /* ainda não é um pacote válido */ } }, 800);
  });
  el("stop").addEventListener("click", () => { stopFlag = true; autoRun = false; setNow("Parando assim que a etapa atual terminar…"); });
  el("clear").addEventListener("click", async () => {
    if (running) return;
    state = { jobs: [], done: {}, errors: {}, cloud: {} };
    el("pkg").value = ""; setError(""); setNow("Pronto para começar."); render(); await storage.set(null);
  });
  el("min").addEventListener("click", () => {
    const body = el("body"); const hidden = body.style.display === "none";
    body.style.display = hidden ? "flex" : "none"; el("min").textContent = hidden ? "–" : "+";
  });

  // Guia: com o pacote salvo, pede para clicar em "Novo projeto"; ao detectar o projeto aberto, mostra o Começar.
  let lastGuide = "";
  function placeRing(target) {
    const ring = el("ring");
    if (!target) { ring.hidden = true; return; }
    const r = target.getBoundingClientRect();
    Object.assign(ring.style, { left: `${r.left - 4}px`, top: `${r.top - 4}px`, width: `${r.width + 8}px`, height: `${r.height + 8}px` });
    ring.hidden = false;
  }
  function updateGuide() {
    if (running) { placeRing(null); el("go").style.display = ""; el("go").classList.remove("pulse"); return; }
    const left = state.jobs.filter((j) => !state.done[j.key]).length;
    if (!state.jobs.length || !left) { placeRing(null); el("go").style.display = ""; el("go").classList.remove("pulse"); return; }
    const inside = inProject() && editor() && visible(editor());
    if (!inside) {
      el("go").style.display = "none"; el("go").classList.remove("pulse");
      placeRing($$("button, [role=button], a", document).find(isNewProject) || null);
      if (lastGuide !== "new") { lastGuide = "new"; setNow("Pacote salvo. Passo 1: clique em “Novo projeto” aqui no Flow. Quando o projeto abrir, aparece o botão Começar."); }
      return;
    }
    placeRing(null); el("go").style.display = ""; el("go").classList.add("pulse");
    if (lastGuide !== "start") { lastGuide = "start"; setNow("Projeto aberto! Agora clique em Começar."); }
  }
  window.setInterval(updateGuide, 600);

  // Pacote enviado direto pelo site: fica salvo no painel; o guia leva até o Começar.
  const PENDING_KEY = "clipgringa-flow-pending-v1";
  async function takePending() {
    try {
      if (running) return;
      const got = (await chrome.storage.local.get(PENDING_KEY))[PENDING_KEY];
      if (!got || !got.raw || Date.now() - got.at > 30 * 60 * 1000) { if (got) await chrome.storage.local.remove(PENDING_KEY); return; }
      // O pacote fica salvo na hora (sobrevive a recarregar a página); quem começa é o botão Começar.
      const parsed = parsePackage(got.raw);
      state = { jobs: parsed.jobs, done: {}, errors: {}, cloud: {}, raw: got.raw.trim() };
      uploadInfo = got.upload || null;
      el("pkg").value = got.raw;
      await persist();
      await chrome.storage.local.remove(PENDING_KEY);
      setError(""); lastGuide = ""; render(); updateGuide();
      setNow("Pacote recebido do ClipGringa. Começando sozinho…");
      window.setTimeout(() => { if (!running) start(); }, 1500);
    } catch (e) { setError(e && e.message ? e.message : ""); }
  }
  try { chrome.storage.onChanged.addListener((changes) => { if (changes[PENDING_KEY]) takePending(); }); } catch (_e) { /* ignore */ }

  // O site pediu para parar (a pessoa abriu o chat de mudanças): termina de forma limpa e espera o pacote novo.
  try {
    chrome.storage.onChanged.addListener((changes) => {
      const stop = changes["clipgringa-flow-stop-v1"];
      if (!stop || !stop.newValue || Date.now() - stop.newValue.at > 15000) return;
      stopFlag = true; autoRun = false;
      persist().catch(() => undefined);
      setNow("Pausado: você abriu o chat de mudanças. Quando aplicar, o pacote novo chega e eu recomeço sozinho.");
    });
  } catch (_e) { /* ignore */ }

  // Resultado do envio feito pelo plano B (download): atualiza o "no ClipGringa" da lista.
  try {
    chrome.storage.onChanged.addListener((changes) => {
      const got = changes["clipgringa-flow-uploads-v1"];
      if (!got || !got.newValue) return;
      for (const job of state.jobs) {
        const r = got.newValue[job.file];
        if (r && Date.now() - r.at < 120000) state.cloud[job.key] = r.ok ? "ok" : "fail";
      }
      persist().catch(() => undefined); render();
    });
  } catch (_e) { /* ignore */ }

  window.__clipgringaDebug = { el, start, getState: () => state };

  storage.get().then((saved) => {
    if (saved && saved.jobs && saved.jobs.length) {
      state = { jobs: saved.jobs, done: saved.done || {}, errors: saved.errors || {}, cloud: saved.cloud || {}, dur: saved.dur || {}, raw: (saved.raw || "").trim() };
      uploadInfo = saved.upload || null;
      el("pkg").value = saved.raw || "";
      autoRun = saved.auto === true;
      const left = state.jobs.filter((j) => !state.done[j.key]).length;
      setNow(left ? `Pacote carregado: ${left} cena(s) faltando. Clique em Começar para continuar.` : "Pacote concluído. Clique em Limpar para começar outro.");
      render();
      if (autoRun && left) window.setTimeout(() => { if (!running) start(); }, 2500);
    }
  }).then(takePending).then(updateGuide);
})();
