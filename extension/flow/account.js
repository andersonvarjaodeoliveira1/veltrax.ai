/* ClipGringa · Flow — lê, nas páginas do Flow, se a conta Google está conectada e o plano/saldo que o próprio Flow mostra.
 * Não lê senha, e-mail nem projetos. Guarda só: conectada (sim/não), plano, créditos e a hora da leitura. */
(function () {
  "use strict";
  if (window.__clipgringaAccount) return;
  window.__clipgringaAccount = true;
  const KEY = "clipgringa-flow-account-v1";

  const shortTexts = () => {
    const out = [];
    document.querySelectorAll("button, a, span, div, p").forEach((el) => {
      if (el.children.length > 2) return;
      const t = (el.innerText || "").trim();
      if (t && t.length <= 60) out.push(t);
    });
    return out;
  };

  function read() {
    const path = location.pathname || "";
    const onAbout = /^\/about/.test(path);
    const texts = shortTexts();
    const signInLink = !!document.querySelector('a[href*="accounts.google.com/ServiceLogin"], a[href*="accounts.google.com/signin"], a[href*="accounts.google.com/v3/signin"]');
    const signInText = texts.some((t) => /^(fazer login|entrar|sign in|log in)$/i.test(t));
    const accountBadge = !!document.querySelector('[aria-label*="Conta do Google"], [aria-label*="Google Account"], a[href*="SignOutOptions"]');
    const inProject = /\/project\//.test(path);
    // só conta como desconectada com sinal claro de login pendente; página desconhecida = continua conectada
    const loggedIn = !onAbout && !signInLink && !signInText;

    let plan = null;
    let credits = null;
    if (loggedIn) {
      for (const t of texts) {
        if (plan === null) {
          const m = t.match(/^(?:Google AI\s+)?(Plus|Pro|Ultra)$/i) || t.match(/Google AI\s+(Plus|Pro|Ultra)/i);
          if (m) plan = m[1][0].toUpperCase() + m[1].slice(1).toLowerCase();
        }
        if (credits === null) {
          const m = t.match(/(\d[\d.,]*)\s*cr[eé]ditos?/i) || t.match(/(\d[\d.,]*)\s*credits?/i);
          if (m) credits = parseInt(m[1].replace(/[.,]/g, ""), 10);
        }
        if (plan !== null && credits !== null) break;
      }
    }
    return { loggedIn, plan, credits, seenAt: Date.now() };
  }

  async function save() {
    try {
      if (!(chrome && chrome.storage && chrome.storage.local)) return;
      const now = read();
      const old = (await chrome.storage.local.get(KEY))[KEY] || {};
      // mantém o último plano/saldo lido quando a leitura atual não achou na tela
      await chrome.storage.local.set({ [KEY]: { ...now, plan: now.plan || (now.loggedIn ? old.plan || null : null), credits: now.credits !== null ? now.credits : (now.loggedIn ? old.credits ?? null : null) } });
    } catch (_e) { /* extensão recarregada: ignora */ }
  }

  setTimeout(save, 3000);
  setInterval(save, 20000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) save(); });
})();
