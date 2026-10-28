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
