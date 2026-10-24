/* ClipGringa · Facebook — salva a página do membro e publica o vídeo final nela, usando o login que o membro já tem no Chrome. */
(function () {
  "use strict";
  if (window.__clipgringaFb) return;
  window.__clipgringaFb = true;

  const ACC = "clipgringa-fb-account-v1";
  const JOB = "clipgringa-fb-job-v1";
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const visible = (el) => !!el && el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0;
  const label = (el) => ((el.getAttribute("aria-label") || el.innerText || "").replace(/\s+/g, " ").trim());
  async function waitFor(fn, timeout = 8000, step = 250) {
    const end = Date.now() + timeout;
    while (Date.now() < end) { let v; try { v = fn(); } catch (_e) { v = null; } if (v) return v; await sleep(step); }
    return null;
  }
  const getAcc = async () => ((await chrome.storage.local.get(ACC))[ACC]) || { pages: [] };
  async function saveAcc(patch) {
    const cur = await getAcc();
    await chrome.storage.local.set({ [ACC]: { ...cur, ...patch, pages: patch.pages || cur.pages || [] } });
  }
  const isLoggedIn = () => /(?:^|;\s*)c_user=/.test(document.cookie);

  /* ---------- painel de aviso ---------- */
  let panel = null;
  function say(msg, kind) {
    if (!panel) {
      panel = document.createElement("div");
      panel.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:2147483000;max-width:340px;background:#0f0d14;color:#f2eefc;border:1px solid rgba(255,255,255,.18);border-radius:16px;padding:12px 14px;font:13px/1.4 system-ui,sans-serif;box-shadow:0 10px 40px rgba(0,0,0,.5)";
      document.body.appendChild(panel);
    }
    panel.style.borderColor = kind === "err" ? "#f0466b" : kind === "ok" ? "#5bd69a" : "rgba(255,255,255,.18)";
    panel.textContent = "ClipGringa · " + msg;
  }

  /* ---------- clique ---------- */
  async function press(el, trusted) {
    el.scrollIntoView({ block: "center" });
    await sleep(250);
    if (trusted) {
      const r = el.getBoundingClientRect();
      try {
        const res = await chrome.runtime.sendMessage({ type: "clipgringa-click", x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) });
        if (res && res.ok) return;
      } catch (_e) { /* cai no clique normal */ }
    }
    el.click();
  }
  function findBtn(root, re) {
    const nodes = Array.from(root.querySelectorAll('[role="button"], button, [role="menuitem"], a[role="link"]'));
    return nodes.find((n) => visible(n) && re.test(label(n))) || null;
  }
  const enabled = (el) => el && el.getAttribute("aria-disabled") !== "true" && !el.disabled;

  /* ---------- salvar a página ---------- */
  const RESERVED = new Set(["", "watch", "groups", "marketplace", "gaming", "friends", "events", "reel", "reels", "stories", "settings", "notifications", "messages", "bookmarks", "login", "help", "policies", "ads", "business", "pages", "search", "photo", "photos", "videos", "hashtag", "share"]);
  function pageInfo() {
    const url = new URL(location.href);
    const parts = url.pathname.split("/").filter(Boolean);
    let key = "";
    if (url.pathname.startsWith("/profile.php") && url.searchParams.get("id")) key = "/profile.php?id=" + url.searchParams.get("id");
    else if (parts[0] === "pages" && parts[2]) key = "/pages/" + parts[1] + "/" + parts[2];
    else if (parts.length === 1 && !RESERVED.has(parts[0].toLowerCase())) key = "/" + parts[0];
    if (!key) return null;
    const name = document.title.replace(/^\(\d+\)\s*/, "").replace(/\s*[|\-–]\s*Facebook.*$/i, "").trim() || key;
    return { name, url: url.origin + key };
  }
  let chip = null;
  let spyChip = null;
  async function refreshChip() {
    if (!isLoggedIn()) { if (chip) chip.remove(); chip = null; if (spyChip) spyChip.remove(); spyChip = null; return; }
    const info = pageInfo();
    const acc = await getAcc();
    if (!info) { if (chip) { chip.remove(); chip = null; } if (spyChip) { spyChip.remove(); spyChip = null; } return; }
    const saved = (acc.pages || []).some((p) => p.url === info.url);
    if (!chip) {
      chip = document.createElement("button");
      chip.type = "button";
      chip.style.cssText = "position:fixed;left:16px;bottom:16px;z-index:2147482000;border:0;border-radius:999px;padding:10px 16px;font:600 13px system-ui,sans-serif;color:#fff;background:linear-gradient(135deg,#8b5cf6,#7b3fe4);cursor:pointer;box-shadow:0 8px 30px rgba(123,63,228,.5)";
      document.body.appendChild(chip);
      chip.addEventListener("click", async () => {
        const now = pageInfo();
        if (!now) return;
        const cur = await getAcc();
        if ((cur.pages || []).some((p) => p.url === now.url)) return;
        await saveAcc({ pages: [...(cur.pages || []), now].slice(0, 20) });
        refreshChip();
      });
    }
    chip.textContent = saved ? "✓ Página salva no ClipGringa" : "Salvar esta página no ClipGringa";
    chip.style.opacity = saved ? ".75" : "1";
    if (!spyChip) {
      spyChip = document.createElement("button");
      spyChip.type = "button";
      spyChip.style.cssText = "position:fixed;left:16px;bottom:62px;z-index:2147482000;border:1px solid rgba(255,255,255,.25);border-radius:999px;padding:8px 14px;font:600 12px system-ui,sans-serif;color:#fff;background:#0f0d14;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.35)";
      document.body.appendChild(spyChip);
      spyChip.addEventListener("click", async () => {
        const now = pageInfo();
        if (!now) return;
        const cur = await getAcc();
        if ((cur.pages || []).some((p) => p.url === now.url)) return;
        await saveAcc({ pages: [...(cur.pages || []), { ...now, spy: true }].slice(0, 40) });
        refreshChip();
      });
    }
    spyChip.style.display = saved ? "none" : "block";
    spyChip.textContent = "Acompanhar (concorrente)";
  }

  /* ---------- publicar ---------- */
  function b64ToFile(b64, name, mime) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
    return new File([bytes], name, { type: mime || "video/mp4" });
  }
  function typeCaption(box, text) {
    box.focus();
    document.execCommand("selectAll", false);
    document.execCommand("insertText", false, text);
  }

  let running = false;
  async function runJob() {
    if (running) return;
    const job = ((await chrome.storage.local.get(JOB))[JOB]) || null;
    if (!job || !job.b64 || Date.now() - (job.at || 0) > 30 * 60 * 1000) { if (job) await chrome.storage.local.remove(JOB); return; }
    const here = location.origin + location.pathname;
    if (!here.startsWith(String(job.pageUrl).split("?")[0]) && !location.href.startsWith(job.pageUrl)) return;
    running = true;
    await chrome.storage.local.remove(JOB); // evita publicar duas vezes se recarregar
    try {
      say("Preparando a publicação…");
      await sleep(2500);
      const compose = await waitFor(() => findBtn(document, /^(criar publica[cç][aã]o|create post|crear publicaci[oó]n|no que voc[eê] est[aá] pensando|what.?s on your mind|[¿]?qu[eé] est[aá]s pensando)/i), 25000);
      if (!compose) throw new Error("Não achei o botão de criar publicação. Confira se você administra essa página.");
      await press(compose, true);
      const dialog = await waitFor(() => Array.from(document.querySelectorAll('[role="dialog"]')).find(visible), 12000);
      if (!dialog) throw new Error("A janela de publicação não abriu.");

      say("Escrevendo a legenda…");
      let box = await waitFor(() => dialog.querySelector('[role="textbox"][contenteditable="true"]'), 8000);
      if (box) typeCaption(box, job.caption || "");

      say("Enviando o vídeo…");
      const media = findBtn(dialog, /^(foto\/v[ií]deo|photo\/video|foto\/video)/i);
      if (media) await press(media, false);
      const input = await waitFor(() => dialog.querySelector('input[type="file"]') || document.querySelector('input[type="file"][accept*="video"]'), 10000);
      if (!input) throw new Error("Não achei onde anexar o vídeo.");
      const dt = new DataTransfer();
      dt.items.add(b64ToFile(job.b64, job.filename || "clip.mp4", job.mime));
      input.files = dt.files;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await sleep(4000);

      box = dialog.querySelector('[role="textbox"][contenteditable="true"]');
      if (box && !(box.innerText || "").trim() && job.caption) typeCaption(box, job.caption);

      say("Aguardando o vídeo carregar para publicar…");
      let posted = false;
      const end = Date.now() + 6 * 60 * 1000;
      while (Date.now() < end) {
        const dlg = Array.from(document.querySelectorAll('[role="dialog"]')).find(visible);
        if (!dlg) { posted = true; break; }
        const post = findBtn(dlg, /^(publicar|post|publish)$/i);
        const next = findBtn(dlg, /^(avan[cç]ar|next|siguiente)$/i);
        if (post && enabled(post)) { await press(post, true); await sleep(5000); continue; }
        if (next && enabled(next)) { await press(next, true); await sleep(2000); continue; }
        await sleep(1500);
      }
      if (!posted) throw new Error("O vídeo demorou demais para carregar.");
      say("Publicado ✓ Confira na sua página.", "ok");
      await chrome.storage.local.set({ "clipgringa-fb-result-v1": { ok: true, at: Date.now() } });
    } catch (e) {
      try { await navigator.clipboard.writeText(job.caption || ""); } catch (_e) { /* sem permissão */ }
      say(`${(e && e.message) || e} A legenda foi copiada: finalize a publicação manualmente.`, "err");
      await chrome.storage.local.set({ "clipgringa-fb-result-v1": { ok: false, at: Date.now(), message: String((e && e.message) || e) } });
    } finally {
      running = false;
    }
  }

  /* ---------- views dos vídeos (para saber qual página está viralizando) ---------- */
  function parseCount(raw) {
    const m = String(raw).toLowerCase().replace(/\s+/g, " ").match(/([\d.,]+)\s*(mil|mi|k|m)?/);
    if (!m) return 0;
    let num = m[1];
    const unit = m[2] || "";
    if (unit) num = num.replace(",", ".");
    else num = num.replace(/[.,]/g, "");
    let n = parseFloat(num);
    if (!isFinite(n)) return 0;
    if (unit === "mil" || unit === "k") n *= 1000;
    else if (unit === "mi" || unit === "m") n *= 1000000;
    return Math.round(n);
  }
  const VIEWS_RE = /([\d.,]+\s*(?:mil|mi|k|m)?)\s*(?:visualiza[cç][õo]es|visualiza[cç][aã]o|views|reproduc[cç][õo]es|reproducciones|vistas)/gi;
  const dayKey = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  async function scanViews() {
    const acc = await getAcc();
    const here = location.origin + location.pathname;
    const page = (acc.pages || []).find((p) => here.startsWith(p.url.split("?")[0]) || location.href.startsWith(p.url));
    if (!page) return;
    const found = [];
    const text = document.body ? document.body.innerText || "" : "";
    let m;
    VIEWS_RE.lastIndex = 0;
    while ((m = VIEWS_RE.exec(text)) !== null) { const n = parseCount(m[1]); if (n > 0) found.push(n); }
    if (!found.length) return;
    const top = found.sort((x, y) => y - x).slice(0, 12);
    const views = top.reduce((sum, n) => sum + n, 0);
    const key = dayKey();
    const pages = (acc.pages || []).map((p) => {
      if (p.url !== page.url) return p;
      const stats = { ...(p.stats || {}) };
      const prev = stats[key] || { views: 0, videos: 0 };
      stats[key] = { views: Math.max(prev.views, views), videos: Math.max(prev.videos, top.length) };
      const keep = Object.keys(stats).sort().slice(-60);
      const trimmed = {};
      keep.forEach((k) => { trimmed[k] = stats[k]; });
      return { ...p, stats: trimmed };
    });
    await saveAcc({ pages });
  }

  /* ---------- views de cada reel (para o "Subindo agora") ---------- */
  const REEL_RE = /\/reel\/(\d+)/;
  function cardViews(anchor) {
    const lines = String(anchor.innerText || "").split("\n").map((l) => l.trim()).filter(Boolean);
    for (const line of lines) if (/^[\d.,]+\s*(mil|mi|k|m)?$/i.test(line)) return parseCount(line);
    const m = String(anchor.innerText || "").match(/([\d.,]+\s*(?:mil|mi|k|m)?)\s*(?:visualiza[cç][õo]es|views|reproduc[cç][õo]es|vistas)/i);
    return m ? parseCount(m[1]) : 0;
  }
  async function scanReels() {
    const acc = await getAcc();
    const here = location.origin + location.pathname;
    const page = (acc.pages || []).find((p) => here.startsWith(p.url.split("?")[0]) || location.href.startsWith(p.url));
    if (!page || /\/reel\//.test(location.pathname)) return;
    const seen = new Map();
    document.querySelectorAll('a[href*="/reel/"]').forEach((a) => {
      const m = REEL_RE.exec(a.getAttribute("href") || "");
      if (!m) return;
      const v = cardViews(a);
      if (v > 0 && v > (seen.get(m[1]) || 0)) seen.set(m[1], v);
    });
    if (!seen.size) return;
    const now = Date.now();
    const pages = (acc.pages || []).map((p) => {
      if (p.url !== page.url) return p;
      const reels = { ...(p.reels || {}) };
      seen.forEach((v, id) => {
        const cur = reels[id] || { f: now, h: [] };
        const h = (cur.h || []).slice();
        const last = h[h.length - 1];
        if (!last || (v !== last[1] && now - last[0] > 20 * 60 * 1000) || now - last[0] > 3 * 3600 * 1000) h.push([now, v]);
        else if (v > last[1]) last[1] = v;
        reels[id] = { f: cur.f, h: h.length > 9 ? [h[0], ...h.slice(-8)] : h };
      });
      const ids = Object.keys(reels).sort((x, y) => (reels[y].h[reels[y].h.length - 1][0]) - (reels[x].h[reels[x].h.length - 1][0])).slice(0, 150);
      const kept = {};
      ids.forEach((id) => { kept[id] = reels[id]; });
      return { ...p, reels: kept };
    });
    await saveAcc({ pages });
  }
  async function scanAll() { await scanViews(); await scanReels(); }

  async function tick() {
    await saveAcc({ loggedIn: isLoggedIn(), seenAt: Date.now() });
    refreshChip();
  }
  setInterval(() => { if (isLoggedIn()) scanAll().catch(() => undefined); }, 15000);
  setTimeout(() => { if (isLoggedIn()) scanAll().catch(() => undefined); }, 6000);
  tick();
  setInterval(tick, 5000);
  runJob();
})();
