/* ClipGringa · Flow — painel do ícone: estado do Flow, plano, créditos e aviso de versão nova. */
(function () {
  var KEY = "clipgringa-flow-account-v1";
  var $ = function (id) { return document.getElementById(id); };
  var version = chrome.runtime.getManifest().version;
  $("ver").textContent = "Versão " + version;

  function newer(a, b) {
    var x = String(a).split(".").map(Number), y = String(b).split(".").map(Number);
    for (var i = 0; i < 3; i += 1) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); }
    return false;
  }

  chrome.storage.local.get(KEY, function (all) {
    var d = (all && all[KEY]) || null;
    var fresh = d && d.seenAt && Date.now() - d.seenAt < 3 * 60 * 1000;
    var box = $("state");
    if (!d) { $("flow").innerHTML = '<span class="dot"></span>abra o Flow'; }
    else if (d.loggedIn === false) { box.className = "card bad"; $("flow").innerHTML = '<span class="dot"></span>sem login'; }
    else { box.className = "card " + (fresh ? "ok" : ""); $("flow").innerHTML = '<span class="dot"></span>' + (fresh ? "conectado" : "aba fechada"); }
    if (d) {
      $("plan").textContent = d.plan || "não identificado";
      $("credits").textContent = typeof d.credits === "number" ? d.credits.toLocaleString("pt-BR") : "—";
      $("seen").textContent = d.seenAt ? new Date(d.seenAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—";
    }
  });

  // Trocar conta do Flow, no comando da pessoa: abre o seletor de contas do próprio Google
  // (nenhum cookie é copiado ou trocado; quem escolhe a conta é você).
  $("switch").addEventListener("click", function (e) {
    e.preventDefault();
    var url = "https://accounts.google.com/AccountChooser?continue=" + encodeURIComponent("https://labs.google/fx/tools/flow");
    chrome.tabs.create({ url: url });
    window.close();
  });

  // Cronômetro do limite do Flow: lê o estado que o content.js publica e mostra quanto falta para liberar.
  var PROGRESS = "clipgringa-flow-progress-v1";
  var tick = null;
  function two(n) { return (n < 10 ? "0" : "") + n; }
  function fmt(ms) {
    var s = Math.max(0, Math.round(ms / 1000));
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return (h ? h + ":" + two(m) : m + "") + ":" + two(sec);
  }
  function renderLimit(limit) {
    var box = $("limit");
    if (tick) { clearInterval(tick); tick = null; }
    if (!limit || !limit.resumeAt) { box.className = "limit hide"; box.textContent = ""; return; }
    var kind = limit.kind === "credits" ? "Créditos esgotados" : "Limite do Flow atingido";
    box.className = "limit" + (limit.kind === "credits" ? " bad" : "");
    function paint() {
      var left = limit.resumeAt - Date.now();
      if (left <= 0) {
        box.innerHTML = kind + ". <b>Pode retomar agora.</b> Se não voltar sozinho, troque de conta do Flow abaixo.";
        if (tick) { clearInterval(tick); tick = null; }
        return;
      }
      box.innerHTML = kind + ". Libera em <b>" + fmt(left) + "</b>. Para seguir já, troque de conta do Flow abaixo.";
    }
    paint();
    tick = setInterval(paint, 1000);
  }
  chrome.storage.local.get(PROGRESS, function (all) {
    var p = (all && all[PROGRESS]) || null;
    renderLimit(p && p.limit && p.limit.resumeAt > Date.now() ? p.limit : null);
  });
  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area === "local" && changes[PROGRESS]) {
      var v = changes[PROGRESS].newValue;
      renderLimit(v ? v.limit : null);
    }
  });

  fetch("https://clipgringa.gringatools.com/extensao/version.json", { cache: "no-store" })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (v) {
      if (!v || !v.version || !newer(v.version, version)) return;
      $("newv").textContent = "Versão " + v.version;
      $("dl").href = "https://clipgringa.gringatools.com/extensao/clipgringa-flow.zip";
      $("new").className = "new";
      try { chrome.action.setBadgeText({ text: "NOVA" }); chrome.action.setBadgeBackgroundColor({ color: "#7B3FE4" }); } catch (_e) { /* sem badge */ }
    })
    .catch(function () { /* sem internet: segue sem aviso */ });
})();
