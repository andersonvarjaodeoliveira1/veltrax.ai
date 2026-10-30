/* ClipGringa · Flow — gera texto pela conta de IA da pessoa (Gemini, ChatGPT ou Claude), escrevendo no site como ela faria.
 * Só responde a mensagens da própria extensão. Os seletores de cada site podem mudar; por isso há alternativas e um plano B que lê o texto da página. */
(function () {
  "use strict";
  if (window.__clipgringaAiLoaded) return;
  window.__clipgringaAiLoaded = true;

  const host = location.hostname;
  const SITE = /gemini\.google\.com$/.test(host) ? "gemini" : /(chatgpt\.com|chat\.openai\.com)$/.test(host) ? "chatgpt" : /claude\.ai$/.test(host) ? "claude" : "";
  if (!SITE) return;

  const SEL = {
    gemini: {
      composer: ['rich-textarea .ql-editor', 'div.ql-editor[contenteditable="true"]', 'div[contenteditable="true"][role="textbox"]', 'textarea'],
      send: ['button.send-button', 'button[aria-label*="Enviar"]', 'button[aria-label*="Send message"]', 'button[aria-label*="Send"]'],
      stop: ['button[aria-label*="Parar"]', 'button[aria-label*="Stop"]', 'button.send-button.stop', '.stop-icon'],
      reply: ['model-response message-content', 'message-content .markdown', '.model-response-text', 'model-response'],
      login: ['a[href*="accounts.google.com/ServiceLogin"]', 'a[href*="accounts.google.com/signin"]'],
    },
    chatgpt: {
      composer: ['#prompt-textarea', 'div.ProseMirror[contenteditable="true"]', 'textarea[name="prompt-textarea"]', 'textarea'],
      send: ['button[data-testid="send-button"]', 'button[aria-label*="Send prompt"]', 'button[aria-label*="Enviar"]', 'button[aria-label*="Send"]'],
      stop: ['button[data-testid="stop-button"]', 'button[aria-label*="Stop"]', 'button[aria-label*="Parar"]'],
      reply: ['[data-message-author-role="assistant"] .markdown', '[data-message-author-role="assistant"]'],
      login: ['[data-testid="login-button"]', 'a[href*="/auth/login"]', 'button[data-testid="welcome-login-button"]'],
    },
    claude: {
      composer: ['div.ProseMirror[contenteditable="true"]', '[data-testid="chat-input"]', 'div[contenteditable="true"]', 'textarea'],
      send: ['button[aria-label*="Send"]', 'button[aria-label*="Enviar"]', 'button[data-testid="send-button"]'],
      stop: ['button[aria-label*="Stop"]', 'button[aria-label*="Parar"]'],
      reply: ['.font-claude-response', '[data-testid="assistant-message"]', '[data-is-streaming]'],
      login: ['a[href*="/login"]', 'button[data-testid="login-button"]'],
    },
  }[SITE];

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const visible = (el) => !!el && (el.offsetParent !== null || el.getClientRects().length > 0);
  const first = (list) => { for (const q of list) { const el = document.querySelector(q); if (el && visible(el)) return el; } return null; };
  const all = (list) => { for (const q of list) { const els = Array.from(document.querySelectorAll(q)).filter(visible); if (els.length) return els; } return []; };

  function challenge() {
    const t = (document.title || "").toLowerCase();
    return /just a moment|um momento|verify you are human|verifique que você é humano/.test(t) || !!document.querySelector("#challenge-form, iframe[src*='challenges.cloudflare.com'], [data-testid='captcha']");
  }

  function state() {
    if (challenge()) return "blocked";
    const composer = first(SEL.composer);
    const loginLink = first(SEL.login);
    if (composer && !loginLink) return "ready";
    if (composer && loginLink) return "guest";
    if (loginLink || /\/(login|signin|auth|ServiceLogin)/i.test(location.pathname + location.href)) return "login";
    return "loading";
  }

  async function waitState(ms) {
    const end = Date.now() + ms;
    let s = state();
    while (Date.now() < end && (s === "loading")) { await sleep(400); s = state(); }
    return s;
  }

  function setText(el, text) {
    el.focus();
    if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
      const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value").set.call(el, text);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(el);
    sel.removeAllRanges();
    sel.addRange(range);
    let ok = false;
    try { ok = document.execCommand("insertText", false, text); } catch (_e) { ok = false; }
    const typed = (el.innerText || el.textContent || "").replace(/\s+/g, "");
    if (!ok || typed.length < Math.floor(text.replace(/\s+/g, "").length * 0.9)) {
      // plano B: colar como texto
      const data = new DataTransfer();
      data.setData("text/plain", text);
      el.focus();
      sel.removeAllRanges();
      sel.addRange(range);
      el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
    }
  }

  function pressEnter(el) {
    const opts = { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true };
    el.dispatchEvent(new KeyboardEvent("keydown", opts));
    el.dispatchEvent(new KeyboardEvent("keypress", opts));
    el.dispatchEvent(new KeyboardEvent("keyup", opts));
  }

  async function send(composer) {
    for (let i = 0; i < 20; i += 1) {
      const btn = first(SEL.send);
      if (btn && !btn.disabled && btn.getAttribute("aria-disabled") !== "true") { btn.click(); return true; }
      await sleep(250);
    }
    pressEnter(composer);
    return true;
  }

  const replyCount = () => all(SEL.reply).length;
  const lastReply = () => { const els = all(SEL.reply); return els.length ? (els[els.length - 1].innerText || "").trim() : ""; };

  /** Plano B: texto da página depois do pedido que acabamos de enviar. */
  function afterPrompt(prompt) {
    const body = ((document.querySelector("main") || document.body).innerText || "");
    const marker = prompt.slice(-50).replace(/\s+/g, " ").trim();
    const flat = body.replace(/[ \t]+/g, " ");
    const at = flat.lastIndexOf(marker);
    if (at < 0) return "";
    return flat.slice(at + marker.length).trim();
  }

  /** Cola as imagens no campo do chat (como se a pessoa colasse prints). Devolve quantas o site aceitou. */
  async function attachImages(composer, images) {
    const files = [];
    (images || []).slice(0, 8).forEach((img, i) => {
      try {
        const bin = atob(String(img.data || ""));
        const bytes = new Uint8Array(bin.length);
        for (let k = 0; k < bin.length; k += 1) bytes[k] = bin.charCodeAt(k);
        const mime = /^image\//.test(img.mime) ? img.mime : "image/jpeg";
        files.push(new File([bytes], `quadro-${i + 1}.${mime.split("/")[1].replace("jpeg", "jpg")}`, { type: mime }));
      } catch (_e) { /* imagem inválida: ignora */ }
    });
    if (!files.length) return 0;
    composer.focus();
    const data = new DataTransfer();
    files.forEach((f) => data.items.add(f));
    composer.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
    // plano B: arrastar para dentro do campo
    await sleep(1500);
    const attached = () => document.querySelectorAll('img[src^="blob:"], [data-testid*="attachment"], [class*="attachment"], uploader-file-preview, [class*="file-preview"]').length;
    if (!attached()) {
      const drop = new DataTransfer();
      files.forEach((f) => drop.items.add(f));
      ["dragenter", "dragover", "drop"].forEach((type) => composer.dispatchEvent(new DragEvent(type, { dataTransfer: drop, bubbles: true, cancelable: true })));
      await sleep(1500);
    }
    // espera o envio dos arquivos terminar (o botão de enviar só habilita depois)
    for (let i = 0; i < 40 && !attached(); i += 1) await sleep(500);
    await sleep(1200);
    return attached() ? files.length : 0;
  }

  async function run(prompt, timeoutMs, images) {
    const s = await waitState(25000);
    if (s === "blocked") return { ok: false, error: "blocked" };
    if (s === "login") return { ok: false, error: "login" };
    const composer = first(SEL.composer);
    if (!composer) return { ok: false, error: "nopage:sem campo de texto" };
    const before = replyCount();
    if (images && images.length) {
      const n = await attachImages(composer, images);
      if (!n) return { ok: false, error: "failed:o site não aceitou as imagens" };
    }
    setText(composer, prompt);
    await sleep(500);
    await send(composer);

    const deadline = Date.now() + timeoutMs;
    let started = false;
    let lastText = "";
    let stableSince = 0;
    while (Date.now() < deadline) {
      await sleep(700);
      if (challenge()) return { ok: false, error: "blocked" };
      const generating = !!first(SEL.stop);
      if (generating || replyCount() > before || afterPrompt(prompt).length > 0) started = true;
      let text = lastReply();
      if (!text || replyCount() <= before) text = started ? afterPrompt(prompt) : "";
      if (!started) continue;
      if (text !== lastText) { lastText = text; stableSince = Date.now(); continue; }
      if (!generating && text && Date.now() - stableSince > 2200) return { ok: true, text };
    }
    return { ok: false, error: lastText ? "timeout:resposta incompleta" : "timeout" };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message) return;
    if (message.type === "clipgringa-ai-probe") {
      waitState(message.wait ? 12000 : 800).then((s) => sendResponse({ ok: true, site: SITE, state: s }));
      return true;
    }
    if (message.type === "clipgringa-ai-run" && message.site === SITE) {
      run(String(message.prompt || ""), Number(message.timeoutMs) || 100000, message.images)
        .then(sendResponse)
        .catch((e) => sendResponse({ ok: false, error: "failed:" + String((e && e.message) || e).slice(0, 120) }));
      return true;
    }
  });
})();
