/* ClipGringa · Flow — botão "Guardar no ClipGringa" nas páginas de produto da Shopee.
 * Lê as fotos e vídeos do ANÚNCIO (sem avaliações de clientes) e entrega ao ClipGringa, sem baixar nada para a pasta do Windows.
 * Usa clipgringaScrapeShopee (shopee.js, carregado antes no mesmo script). */
(function () {
  "use strict";
  if (window.__clipgringaShopeeBtn) return;
  window.__clipgringaShopeeBtn = true;

  var isProduct = function () { return /-i\.\d+\.\d+|\/product\/\d+\/\d+/.test(location.pathname + location.search); };
  var host = null;
  var label = null;
  var busy = false;

  function say(text, kind) {
    if (!label) return;
    label.textContent = text;
    label.setAttribute("data-kind", kind || "");
  }

  function build() {
    host = document.createElement("div");
    host.id = "clipgringa-shopee-host";
    host.style.cssText = "all:initial;position:fixed;right:18px;bottom:90px;z-index:2147483647;";
    var root = host.attachShadow({ mode: "open" });
    root.innerHTML =
      '<style>' +
      '.b{font:600 13px/1.2 system-ui,Segoe UI,sans-serif;color:#fff;background:linear-gradient(135deg,#8B5CF6,#7B3FE4);border:0;border-radius:999px;padding:11px 16px;cursor:pointer;box-shadow:0 6px 20px rgba(91,27,170,.45)}' +
      '.b:disabled{opacity:.7;cursor:wait}' +
      '.m{margin-top:6px;max-width:250px;font:12px/1.35 system-ui,Segoe UI,sans-serif;color:#fff;background:#141316;border:1px solid rgba(255,255,255,.18);border-radius:12px;padding:8px 10px}' +
      '.m[data-kind=ok]{border-color:#5BD69A}.m[data-kind=err]{border-color:#F0466B}.m:empty{display:none}' +
      '</style><button class="b" type="button">Guardar no ClipGringa</button><div class="m"></div>';
    var button = root.querySelector("button");
    label = root.querySelector(".m");
    button.addEventListener("click", function () { void save(button); });
    document.documentElement.appendChild(host);
  }

  async function save(button) {
    if (busy) return;
    busy = true; button.disabled = true; say("Lendo as fotos do anúncio…", "");
    try {
      try { window.scrollTo(0, 500); window.dispatchEvent(new Event("scroll")); } catch (e) { /* ignora */ }
      var data = null;
      for (var i = 0; i < 4; i += 1) {
        await new Promise(function (r) { setTimeout(r, 700); });
        data = clipgringaScrapeShopee();
        if (data && (data.videos.length || data.images.length >= 3)) break;
      }
      try { window.scrollTo(0, 0); } catch (e) { /* ignora */ }
      if (!data || (!data.videos.length && !data.images.length)) { say("Não achei fotos do anúncio. Espere a página carregar e tente de novo.", "err"); return; }
      chrome.runtime.sendMessage({ type: "clipgringa-shopee-save", title: data.title, images: data.images, videos: data.videos, url: data.url }, function (resp) {
        var failed = chrome.runtime.lastError || !resp || !resp.ok;
        if (failed) say("Não consegui guardar. Recarregue a extensão e tente de novo.", "err");
        else say("Guardado! " + data.images.length + " foto(s)" + (data.videos.length ? " e " + data.videos.length + " vídeo(s)" : "") + ". Volte ao ClipGringa: elas já aparecem lá.", "ok");
      });
    } catch (e) {
      say("Algo deu errado. Recarregue a página e tente de novo.", "err");
    } finally {
      busy = false; button.disabled = false;
    }
  }

  // A Shopee troca de página sem recarregar: mostra o botão só em página de produto.
  setInterval(function () {
    var show = isProduct();
    if (show && !host) build();
    if (host) host.style.display = show ? "" : "none";
  }, 1500);
})();
