/* ClipGringa · Flow — lê o anúncio da Shopee dentro do navegador da própria pessoa.
 * Devolve só endereços (vídeos e fotos do ANÚNCIO do vendedor); vídeos e fotos de avaliações de clientes ficam de fora.
 * É injetada na aba do produto pelo background.js; precisa ser autocontida. */
function clipgringaScrapeShopee() {
  var CDN = /(?:susercontent\.com|shopee\.com\.br|shopee\.com)\/file\/[A-Za-z0-9_\-]{20,}/;
  var BAD = /recommend|similar|voucher|flash|shop-?avatar|avatar|logo|banner|rating|review|comment|avalia|feedback|buyer|customer/i;
  var title = "";
  var og = document.querySelector('meta[property="og:title"]');
  title = ((og && og.content) || document.title || "").replace(/\s*[|\-–]\s*Shopee.*$/i, "").trim().slice(0, 120);

  // Tudo abaixo do título "Avaliações" é de clientes.
  var limitY = Infinity;
  document.querySelectorAll("h1,h2,h3,h4,div,section,span").forEach(function (el) {
    if (el.children.length > 2) return;
    var t = (el.innerText || "").trim();
    if (/^(avalia[cç][õo]es do produto|avalia[cç][õo]es|product ratings|ratings)$/i.test(t)) {
      var y = el.getBoundingClientRect().top + window.scrollY;
      if (y > 0 && y < limitY) limitY = y;
    }
  });
  function inside(el) {
    var y = el.getBoundingClientRect().top + window.scrollY;
    if (!(y <= limitY)) return false;
    for (var n = el, i = 0; n && i < 7; n = n.parentElement, i += 1) {
      if (BAD.test((typeof n.className === "string" ? n.className : "") + " " + (n.id || ""))) return false;
    }
    return true;
  }
  function abs(u) { try { return new URL(u, location.href).href; } catch (e) { return ""; } }

  var videos = [];
  function addVideo(u, poster) {
    u = abs(u);
    if (!/^https:/.test(u) || /^blob:/.test(u) || !/susercontent|shopee/.test(u)) return;
    if (!/\.mp4(\?|$)/i.test(u)) return;
    if (videos.some(function (v) { return v.url === u; })) return;
    videos.push({ url: u, poster: poster ? abs(poster) : "" });
  }
  document.querySelectorAll("video").forEach(function (v) {
    if (!inside(v)) return;
    var srcs = [v.currentSrc, v.src];
    v.querySelectorAll("source").forEach(function (s) { srcs.push(s.src); });
    srcs.forEach(function (u) { if (u) addVideo(u, v.poster); });
  });
  try {
    performance.getEntriesByType("resource").forEach(function (e) { addVideo(e.name, ""); });
  } catch (e) { /* sem resource timing */ }

  var images = [];
  document.querySelectorAll("img").forEach(function (img) {
    var src = img.currentSrc || img.src || "";
    if (!CDN.test(src) || !inside(img)) return;
    var full = abs(src).replace(/_tn(?=$|[?#])/, "").split("?")[0];
    if (images.indexOf(full) === -1) images.push(full);
  });
  var body = (document.body && document.body.innerText || "").slice(0, 4000);
  var missing = !videos.length && !images.length && /(este produto n[ãa]o existe|produto n[ãa]o est[áa] dispon[íi]vel|produto indispon[íi]vel|product (does not exist|is unavailable|not found)|p[áa]gina n[ãa]o encontrada)/i.test(body);
  return { missing: missing, title: title, videos: videos.slice(0, 6), images: images.slice(0, 9), url: location.href };
}
