// Renomeia o próximo download do Flow para o nome que o ClipGringa espera (Video01_Cena01.mp4).
importScripts("shopee.js", "ai-bg.js");
let pending = null;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message && message.type === "clipgringa-name") {
    pending = { filename: String(message.filename || ""), at: Date.now(), upload: message.upload || null };
    sendResponse({ ok: true });
  }
  if (message && message.type === "clipgringa-refresh-account") {
    // Pede a leitura da conta a todas as abas abertas do Flow e diz quantas há.
    chrome.tabs.query({ url: ["https://labs.google/fx/*", "https://flow.google.com/*"] }, (tabs) => {
      const list = (tabs || []).filter((t) => /\/tools\/flow|flow\.google\.com/.test(t.url || ""));
      let left = list.length;
      if (!left) { sendResponse({ ok: true, tabs: 0 }); return; }
      const done = () => { left -= 1; if (left <= 0) sendResponse({ ok: true, tabs: list.length }); };
      list.forEach((t) => chrome.tabs.sendMessage(t.id, { type: "clipgringa-account-refresh" }, () => { void chrome.runtime.lastError; done(); }));
      setTimeout(() => sendResponse({ ok: true, tabs: list.length }), 2000);
    });
    return true;
  }
  if (message && message.type === "clipgringa-request-package") {
    // O painel do Flow não achou o pacote: pede à aba do ClipGringa (se estiver aberta) para enviá-lo de novo.
    chrome.tabs.query({ url: "https://clipgringa.gringatools.com/*" }, async (tabs) => {
      let asked = 0;
      for (const tab of tabs || []) {
        try {
          await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => { window.postMessage({ source: "clipgringa-ext", type: "package?" }, window.location.origin); } });
          asked += 1;
        } catch (_e) { /* aba protegida */ }
      }
      sendResponse({ ok: true, asked });
    });
    return true;
  }
  if (message && message.type === "clipgringa-open-flow") {
    // Abre o Flow sozinho (sem depender de pop-up do site) se ainda não houver uma aba dele.
    chrome.tabs.query({ url: ["https://labs.google/fx/*/tools/flow*", "https://labs.google/fx/*/tools/flow", "https://flow.google.com/*"] }, (tabs) => {
      if (tabs && tabs.length) { chrome.tabs.update(tabs[0].id, { active: true }); chrome.windows.update(tabs[0].windowId, { focused: true }); sendResponse({ ok: true, reused: true }); }
      else chrome.tabs.create({ url: "https://labs.google/fx/pt/tools/flow" }, () => sendResponse({ ok: true }));
    });
    return true;
  }
  if (message && message.type === "clipgringa-open-app") {
    // Leva a pessoa ao ClipGringa (Vídeo orgânico) para subir o projeto: reaproveita a aba aberta ou abre uma nova.
    const path = typeof message.path === "string" && message.path.startsWith("/") ? message.path : "/automacao";
    chrome.tabs.query({ url: "https://clipgringa.gringatools.com/*" }, (tabs) => {
      if (tabs && tabs.length) {
        chrome.tabs.update(tabs[0].id, { active: true, url: `https://clipgringa.gringatools.com${path}` });
        chrome.windows.update(tabs[0].windowId, { focused: true });
        sendResponse({ ok: true, reused: true });
      } else chrome.tabs.create({ url: `https://clipgringa.gringatools.com${path}` }, () => sendResponse({ ok: true }));
    });
    return true;
  }
  if (message && message.type === "clipgringa-upload-part") {
    // Recebe o arquivo em pedaços e só envia ao ClipGringa quando o último chegar.
    const id = String(message.id || "");
    const store = (self.__parts = self.__parts || {});
    const entry = store[id] || (store[id] = { parts: [], at: Date.now() });
    entry.parts[Number(message.index) || 0] = base64ToBlob(String(message.b64 || ""), "application/octet-stream");
    for (const key of Object.keys(store)) if (Date.now() - store[key].at > 10 * 60 * 1000) delete store[key];
    if (Number(message.index) + 1 < Number(message.total)) { sendResponse({ ok: true, partial: true }); return; }
    const file = String(message.file || "");
    const blob = new Blob(entry.parts, { type: /\.(jpe?g|png|webp)$/i.test(file) ? "image/jpeg" : "video/mp4" });
    delete store[id];
    postVideo(message.upload, blob, file)
      .then((r) => sendResponse(r))
      .catch((e) => sendResponse({ ok: false, error: String((e && e.message) || e) }));
    return true;
  }
  if (message && message.type === "clipgringa-upload") {
    postVideo(message.upload, base64ToBlob(String(message.b64 || ""), /\.(jpe?g|png|webp)$/i.test(String(message.file || "")) ? "image/jpeg" : "video/mp4"), String(message.file || ""))
      .then((r) => sendResponse(r))
      .catch((e) => sendResponse({ ok: false, error: String((e && e.message) || e) }));
    return true;
  }
  if (message && message.type === "clipgringa-shopee") {
    readShopee(String(message.url || ""))
      .then((r) => sendResponse(r))
      .catch((e) => sendResponse({ ok: false, error: "failed", detail: String((e && e.message) || e).slice(0, 120) }));
    return true;
  }
  if (message && message.type === "clipgringa-key" && _sender.tab) {
    trustedEnter(_sender.tab.id)
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

// Enter "de verdade" (a caixa de prompt já está com o foco): outro jeito de enviar quando a seta não responde.
async function trustedEnter(tabId) {
  const target = { tabId };
  let attached = false;
  try { await chrome.debugger.attach(target, "1.3"); attached = true; } catch (e) { if (!/already attached/i.test(String(e && e.message))) throw e; }
  try {
    const key = { key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 };
    await chrome.debugger.sendCommand(target, "Input.dispatchKeyEvent", { type: "rawKeyDown", ...key });
    await chrome.debugger.sendCommand(target, "Input.dispatchKeyEvent", { type: "char", text: "\r", ...key });
    await chrome.debugger.sendCommand(target, "Input.dispatchKeyEvent", { type: "keyUp", ...key });
  } finally {
    if (attached) { try { await chrome.debugger.detach(target); } catch (_) {} }
  }
}

function base64ToBlob(b64, mime) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime || "video/mp4" });
}

// Envia o vídeo para o ClipGringa (fica visível em "Vídeos do Flow"). Nunca interrompe a geração.
async function postVideo(upload, blob, file) {
  if (!upload || !upload.url || !upload.token) return { ok: false, error: "sem destino" };
  if (blob.size < 1024) return { ok: false, error: "arquivo vazio" };
  const url = new URL(upload.url);
  url.searchParams.set("token", upload.token);
  url.searchParams.set("package", upload.package || "");
  url.searchParams.set("file", file || "video.mp4");
  const res = await fetch(url.toString(), { method: "POST", headers: { "Content-Type": blob.type || "video/mp4" }, body: blob });
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


// Ao instalar ou atualizar, liga a ponte nas abas do ClipGringa que já estavam abertas (sem precisar apertar F5).
chrome.runtime.onInstalled.addListener(async () => {
  try {
    const tabs = await chrome.tabs.query({ url: "https://clipgringa.gringatools.com/*" });
    for (const tab of tabs) {
      try { await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["site.js"] }); } catch (_e) { /* aba protegida */ }
    }
  } catch (_e) { /* sem permissão */ }
});


// Abre o anúncio da Shopee numa aba em segundo plano (no navegador da própria pessoa, com a sessão dela),
// lê os vídeos e as fotos do anúncio e fecha a aba. Só devolve endereços.
// Chave do produto (loja.item) para achar o mesmo anúncio já aberto no Chrome da pessoa.
function shopeeItemKey(u) {
  const m = /-i\.(\d+)\.(\d+)/.exec(String(u || "")) || /\/product\/(\d+)\/(\d+)/.exec(String(u || ""));
  return m ? m[1] + "." + m[2] : "";
}

async function findOpenShopeeTab(url) {
  const key = shopeeItemKey(url);
  if (!key) return null;
  try {
    const tabs = await chrome.tabs.query({ url: ["https://*.shopee.com.br/*", "https://shopee.com.br/*", "https://*.shopee.com/*", "https://shopee.com/*"] });
    return tabs.find((t) => shopeeItemKey(t.url) === key) || null;
  } catch (_e) { return null; }
}

// Lê o anúncio numa aba que já existe (rounds tentativas de ~1,2 s).
async function scrapeShopeeTab(tabId, rounds) {
  let best = null;
  for (let i = 0; i < rounds; i += 1) {
    await new Promise((r) => setTimeout(r, 1200));
    const current = await chrome.tabs.get(tabId).catch(() => null);
    if (!current) break;
    if (/\/buyer\/login|\/verify\/|captcha/i.test(current.url || "")) return { ok: false, error: "login" };
    // aba em segundo plano não carrega fotos "preguiçosas": rola a página para a Shopee mostrar tudo do topo do anúncio
    if (i === 1 || i === 4) { try { await chrome.scripting.executeScript({ target: { tabId }, func: () => { window.scrollTo(0, 500); window.dispatchEvent(new Event("scroll")); } }); } catch (_e) { /* sem permissão */ } }
    let out = null;
    try { out = (await chrome.scripting.executeScript({ target: { tabId }, func: clipgringaScrapeShopee }))[0].result; } catch (_e) { out = null; }
    if (out) best = out;
    if (out && out.missing) return { ok: false, error: "notfound" };
    if (best && (best.videos.length || best.images.length >= 3) && i >= 2) break;
  }
  if (!best || (!best.videos.length && !best.images.length)) return { ok: false, error: "empty" };
  return { ok: true, title: best.title, videos: best.videos, images: best.images };
}

// Abre o anúncio numa aba nova (escondida ou à vista), lê e fecha.
async function readShopeeInNewTab(url, active) {
  const tab = await chrome.tabs.create({ url, active });
  try {
    await new Promise((resolve) => {
      const done = () => { chrome.tabs.onUpdated.removeListener(listener); resolve(); };
      const listener = (id, info) => { if (id === tab.id && info.status === "complete") done(); };
      chrome.tabs.onUpdated.addListener(listener);
      setTimeout(done, 15000);
    });
    return await scrapeShopeeTab(tab.id, 10);
  } finally {
    try { await chrome.tabs.remove(tab.id); } catch (_e) { /* já fechada */ }
  }
}

async function readShopee(url) {
  if (!/^https:\/\/(?:[\w-]+\.)*(?:shopee\.com\.br|shopee\.com|shp\.ee|shope\.ee)\//i.test(url)) return { ok: false, error: "invalid" };
  // 1) o anúncio já está aberto no Chrome da pessoa (logado e carregado): lê ali mesmo.
  const open = await findOpenShopeeTab(url);
  if (open) {
    const r = await scrapeShopeeTab(open.id, 5);
    if (r.ok) return r;
  }
  // 2) aba escondida; 3) se falhar por demora/vazio, repete com a aba à vista (a Shopee carrega melhor).
  const first = await readShopeeInNewTab(url, false);
  if (first.ok || first.error === "login" || first.error === "notfound") return first;
  const second = await readShopeeInNewTab(url, true);
  return second.ok ? second : { ok: false, error: second.error === "empty" ? "empty" : first.error };
}


// Ao abrir o navegador: confere se existe versão nova e marca o ícone com "NOVA" (sem permissões extras).
async function checkForUpdate() {
  try {
    const response = await fetch("https://clipgringa.gringatools.com/extensao/version.json", { cache: "no-store" });
    if (!response.ok) return;
    const latest = String((await response.json()).version || "");
    const mine = chrome.runtime.getManifest().version;
    const a = latest.split(".").map(Number), b = mine.split(".").map(Number);
    let newer = false;
    for (let i = 0; i < 3; i += 1) { if ((a[i] || 0) !== (b[i] || 0)) { newer = (a[i] || 0) > (b[i] || 0); break; } }
    await chrome.action.setBadgeText({ text: newer ? "NOVA" : "" });
    if (newer) await chrome.action.setBadgeBackgroundColor({ color: "#7B3FE4" });
  } catch (_e) { /* sem internet */ }
}
chrome.runtime.onStartup.addListener(checkForUpdate);
chrome.runtime.onInstalled.addListener(checkForUpdate);


/* ===================== Contas do ClipGringa (troca de sessão) ===================== */
// Contas do ClipGringa: guarda e troca os cookies de login (Better Auth) sem sair e entrar de novo.
// Tudo aqui usa nomes próprios para não esbarrar no resto da extensão: mensagens "clipgringa-session-*" e a chave "clipgringa-sessions-v1".
const SESS_DOMAIN = "clipgringa.gringatools.com";
const SESS_APP_URL = "https://" + SESS_DOMAIN + "/";
const SESS_KEY = "clipgringa-sessions-v1";
const SESS_COOKIE = "better-auth.session_token";
const SESS_NAMES = ["__Secure-" + SESS_COOKIE, SESS_COOKIE];
const SESS_PROGRESS_KEY = "clipgringa-flow-progress-v1"; // gravado pelo content.js do Flow

function sessCookieUrl(c) {
  return "https://" + c.domain.replace(/^\./, "") + (c.path || "/");
}

// Pega os cookies de clipgringa.gringatools.com e de api.clipgringa.gringatools.com.
function sessGetCookies() {
  return chrome.cookies.getAll({ domain: SESS_DOMAIN });
}

async function sessClearCookies() {
  const all = await sessGetCookies();
  await Promise.all(all.map((c) => chrome.cookies.remove({ url: sessCookieUrl(c), name: c.name }).catch(() => null)));
}

function toSetDetails(c) {
  const securePrefix = c.name.startsWith("__Secure-");
  const hostPrefix = c.name.startsWith("__Host-");
  const d = {
    url: sessCookieUrl(c),
    name: c.name,
    value: c.value,
    path: hostPrefix ? "/" : c.path || "/",
    secure: c.secure || securePrefix || hostPrefix, // __Secure- e __Host- exigem secure
    httpOnly: c.httpOnly
  };
  if (!c.hostOnly && !hostPrefix) d.domain = c.domain;
  if (c.sameSite && c.sameSite !== "unspecified") d.sameSite = c.sameSite;
  if (d.sameSite === "no_restriction") d.secure = true;
  if (!c.session && c.expirationDate) d.expirationDate = c.expirationDate;
  return d;
}

async function sessHasLogin() {
  for (const name of SESS_NAMES) {
    if (await chrome.cookies.get({ url: SESS_APP_URL, name })) return true;
  }
  return false;
}

async function restoreCookies(list) {
  for (const c of list) {
    try {
      const r = await chrome.cookies.set(toSetDetails(c));
      if (!r) console.warn("[sessões] O Chrome recusou o cookie", c.name);
    } catch (e) {
      console.warn("[sessões] Não deu para restaurar o cookie", c.name, e);
    }
  }
  return sessHasLogin();
}

async function sessReloadTabs() {
  const tabs = await chrome.tabs.query({ url: "https://" + SESS_DOMAIN + "/*" });
  if (tabs.length) await Promise.all(tabs.map((t) => chrome.tabs.reload(t.id).catch(() => null)));
  else await chrome.tabs.create({ url: SESS_APP_URL + "automacao" });
}

async function sessState() {
  const got = (await chrome.storage.local.get(SESS_KEY))[SESS_KEY] || {};
  return { sessions: got.sessions || {}, active: got.active || null };
}

async function sessSaveState(sessions, active) {
  await chrome.storage.local.set({ [SESS_KEY]: { sessions, active } });
  await sessNotify(active);
}

// Avisa as abas do ClipGringa que a conta em uso mudou, para o selo atualizar na hora.
async function sessNotify(active) {
  try {
    const tabs = await chrome.tabs.query({ url: "https://" + SESS_DOMAIN + "/*" });
    await Promise.all(tabs.map((t) =>
      chrome.tabs.sendMessage(t.id, { type: "clipgringa-session-changed", active: active || null }).catch(() => null)
    ));
  } catch (_e) { /* sem abas abertas */ }
}

// Não troca de conta no meio de uma geração do Flow: o pacote em andamento é da conta atual.
async function sessFlowBusy() {
  const p = (await chrome.storage.local.get(SESS_PROGRESS_KEY))[SESS_PROGRESS_KEY];
  return !!(p && p.running && Date.now() - (p.at || 0) < 2 * 60 * 1000);
}

// Antes de sair da conta ativa, guarda os cookies de agora (o token pode ter sido renovado).
async function sessRefreshActive(sessions, active) {
  if (!active || !sessions[active]) return;
  const now = await sessGetCookies();
  if (now.length && (await sessHasLogin())) sessions[active].cookies = now;
}

async function sessHandle(msg) {
  const { sessions, active } = await sessState();
  switch (msg.type) {
    case "clipgringa-session-list":
      return { ok: true, sessions: Object.keys(sessions), active };

    case "clipgringa-session-active":
      return { ok: true, active };

    case "clipgringa-session-save": {
      const name = String(msg.name || "").trim().slice(0, 40);
      if (!name) return { ok: false, error: "Dê um nome para a conta." };
      if (!(await sessHasLogin())) return { ok: false, error: "Entre no ClipGringa antes de salvar." };
      sessions[name] = { cookies: await sessGetCookies(), savedAt: Date.now() };
      await sessSaveState(sessions, name);
      return { ok: true };
    }

    case "clipgringa-session-switch": {
      const s = sessions[msg.name];
      if (!s) return { ok: false, error: "Conta não encontrada." };
      if (await sessFlowBusy()) return { ok: false, error: "O Flow está gerando um pacote. Espere terminar ou pare antes de trocar de conta." };
      await sessRefreshActive(sessions, active);
      await sessClearCookies();
      const ok = await restoreCookies(s.cookies);
      await sessSaveState(sessions, ok ? msg.name : null);
      await sessReloadTabs();
      return ok ? { ok: true } : { ok: false, error: "A sessão de " + msg.name + " expirou. Entre de novo e salve por cima." };
    }

    case "clipgringa-session-new": {
      if (await sessFlowBusy()) return { ok: false, error: "O Flow está gerando um pacote. Espere terminar ou pare antes de trocar de conta." };
      await sessRefreshActive(sessions, active);
      await sessClearCookies();
      await sessSaveState(sessions, null);
      await sessReloadTabs();
      return { ok: true };
    }

    case "clipgringa-session-delete": {
      delete sessions[msg.name];
      await sessSaveState(sessions, active === msg.name ? null : active);
      return { ok: true };
    }
  }
  return { ok: false, error: "Ação desconhecida." };
}

// Ouvinte próprio: só responde às mensagens "clipgringa-session-*" e deixa as outras para o background.js.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg.type !== "string" || !msg.type.startsWith("clipgringa-session-")) return false;
  // Só aceita pedidos do painel da extensão e das abas do próprio ClipGringa.
  const fromPopup = !sender.tab && sender.id === chrome.runtime.id;
  const fromApp = sender.tab && String(sender.url || "").startsWith(SESS_APP_URL);
  if (!fromPopup && !(fromApp && msg.type === "clipgringa-session-active")) {
    sendResponse({ ok: false, error: "Sem permissão." });
    return false;
  }
  sessHandle(msg).then(sendResponse).catch((e) => sendResponse({ ok: false, error: String((e && e.message) || e) }));
  return true;
});
