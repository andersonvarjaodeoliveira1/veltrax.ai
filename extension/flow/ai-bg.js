/* ClipGringa · Flow — gerar texto pela conta de IA da pessoa (Gemini, ChatGPT, Claude): abre o site numa aba própria, pede e fecha. */
const AI_URLS = { gemini: "https://gemini.google.com/app", chatgpt: "https://chatgpt.com/?temporary-chat=true", claude: "https://claude.ai/new" };
const AI_MATCH = { gemini: ["https://gemini.google.com/*"], chatgpt: ["https://chatgpt.com/*", "https://chat.openai.com/*"], claude: ["https://claude.ai/*"] };
const aiOwned = {}; // site -> { tabId, timer }
let aiChain = Promise.resolve();

const aiWait = (ms) => new Promise((r) => setTimeout(r, ms));
const aiTabGet = (id) => new Promise((res) => chrome.tabs.get(id, (t) => { void chrome.runtime.lastError; res(t || null); }));
const aiTabsQuery = (q) => new Promise((res) => chrome.tabs.query(q, (t) => res(t || [])));

function aiLoaded(tabId, timeoutMs) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => { if (done) return; done = true; chrome.tabs.onUpdated.removeListener(onUpdated); resolve(); };
    const onUpdated = (id, info) => { if (id === tabId && info.status === "complete") finish(); };
    chrome.tabs.onUpdated.addListener(onUpdated);
    aiTabGet(tabId).then((t) => { if (t && t.status === "complete") setTimeout(finish, 300); });
    setTimeout(finish, timeoutMs);
  });
}

async function aiSendToTab(tabId, message) {
  let injected = false;
  for (let i = 0; i < 24; i += 1) {
    const resp = await new Promise((res) => chrome.tabs.sendMessage(tabId, message, (r) => { const err = chrome.runtime.lastError; res(err ? null : r); }));
    if (resp) return resp;
    if (i === 6 && !injected) {
      injected = true;
      try { await chrome.scripting.executeScript({ target: { tabId }, files: ["ai.js"] }); } catch (_e) { /* sem permissão para esta aba */ }
    }
    await aiWait(500);
  }
  return null;
}

async function aiOwnedTab(site) {
  const entry = aiOwned[site];
  if (entry && entry.timer) { clearTimeout(entry.timer); entry.timer = null; }
  const existing = entry ? await aiTabGet(entry.tabId) : null;
  if (existing) {
    // conversa nova: abre o endereço de "novo chat" (se já está nele, recarrega)
    if ((existing.url || "").split("#")[0] === AI_URLS[site]) await new Promise((res) => chrome.tabs.reload(existing.id, {}, () => res()));
    else await new Promise((res) => chrome.tabs.update(existing.id, { url: AI_URLS[site] }, () => res()));
    await aiWait(300);
    await aiLoaded(existing.id, 30000);
    return existing.id;
  }
  const tab = await new Promise((res) => chrome.tabs.create({ url: AI_URLS[site], active: false }, (t) => res(t)));
  aiOwned[site] = { tabId: tab.id, timer: null };
  await aiLoaded(tab.id, 30000);
  return tab.id;
}

function aiCloseLater(site, ms) {
  const entry = aiOwned[site];
  if (!entry) return;
  if (entry.timer) clearTimeout(entry.timer);
  entry.timer = setTimeout(() => { chrome.tabs.remove(entry.tabId, () => void chrome.runtime.lastError); delete aiOwned[site]; }, ms);
}

chrome.tabs.onRemoved.addListener((id) => { for (const site of Object.keys(aiOwned)) if (aiOwned[site].tabId === id) delete aiOwned[site]; });

async function aiAsk(site, prompt, timeoutMs, images) {
  if (!AI_URLS[site]) return { ok: false, error: "failed:site desconhecido" };
  const keep = setInterval(() => chrome.runtime.getPlatformInfo(() => void chrome.runtime.lastError), 20000);
  try {
    const tabId = await aiOwnedTab(site);
    const resp = await aiSendToTab(tabId, { type: "clipgringa-ai-run", site, prompt, timeoutMs, images: images || [] });
    aiCloseLater(site, 30000);
    return resp || { ok: false, error: "nopage" };
  } catch (e) {
    return { ok: false, error: "failed:" + String((e && e.message) || e).slice(0, 120) };
  } finally {
    clearInterval(keep);
  }
}

async function aiProbe(site, open) {
  if (!AI_URLS[site]) return { ok: false, state: "nopage" };
  if (open) {
    const tabId = await aiOwnedTab(site);
    const resp = await aiSendToTab(tabId, { type: "clipgringa-ai-probe", wait: true });
    aiCloseLater(site, 5000);
    return resp || { ok: true, site, state: "nopage" };
  }
  const tabs = await aiTabsQuery({ url: AI_MATCH[site] });
  const mine = Object.values(aiOwned).map((e) => e.tabId);
  const theirs = tabs.filter((t) => !mine.includes(t.id));
  if (!theirs.length) return { ok: true, site, state: "notab" };
  const resp = await aiSendToTab(theirs[0].id, { type: "clipgringa-ai-probe", wait: false });
  return resp || { ok: true, site, state: "loading" };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message) return;
  if (message.type === "clipgringa-ai-ask") {
    aiChain = aiChain.then(() => aiAsk(String(message.site || ""), String(message.prompt || ""), Number(message.timeoutMs) || 100000, message.images)).then((r) => { sendResponse(r); }, (e) => { sendResponse({ ok: false, error: "failed:" + String((e && e.message) || e).slice(0, 120) }); });
    return true;
  }
  if (message.type === "clipgringa-ai-probe-site") {
    aiProbe(String(message.site || ""), !!message.open).then(sendResponse, () => sendResponse({ ok: false, state: "nopage" }));
    return true;
  }
});
