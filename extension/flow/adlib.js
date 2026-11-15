// ClipGringa · ClipSpy — rolagem suave na Ad Library da Meta.
//
// Esta aba é aberta pela pesquisa do ClipSpy (botão Pesquisar). O script só
// rola a página algumas vezes, devagar, para disparar o carregamento dos
// primeiros anúncios — assim o usuário não precisa rolar na mão.
//
// Ele NÃO lê, NÃO coleta e NÃO interage com nada da página: é só um auxílio
// de visualização. E só age quando a aba veio do ClipSpy, para não atrapalhar
// quando o usuário abre a Ad Library por conta própria.
//
// Como sabe que veio do ClipSpy: o site avisa a extensão no momento da pesquisa
// (site.js guarda um aviso com a hora), e esta aba confere se o aviso é de
// agora há pouco. O marcador cg=1 na URL, usado antes, é removido pelo Facebook
// ao carregar a página, por isso deixou de servir sozinho.
(() => {
  "use strict";

  const FLAG = "__clipgringa_adlib_scroll";
  if (window[FLAG]) return;
  window[FLAG] = true;

  const KEY = "clipgringa-adlib-scroll-v1";
  const FRESH_MS = 90 * 1000; // o aviso vale por um minuto e meio
  const urlFlag = () => { try { return new URLSearchParams(location.search).get("cg") === "1"; } catch { return false; } };

  // Pergunta à extensão se o ClipSpy acabou de abrir esta aba. O aviso é consumido: vale para uma aba só.
  const cameFromClipSpy = async () => {
    if (urlFlag()) return true;
    try {
      const saved = (await chrome.storage.local.get(KEY))[KEY];
      if (!saved || typeof saved.at !== "number" || Date.now() - saved.at > FRESH_MS) return false;
      await chrome.storage.local.remove(KEY);
      return true;
    } catch {
      return false; // extensão recarregada: não rola
    }
  };

  const STEP_FRACTION = 0.9; // quanto da altura da tela rola por passo
  const STEPS = 6; // quantos passos no total
  const INTERVAL_MS = 1400; // pausa entre passos (dá tempo do lazy-load)
  const START_DELAY_MS = 2500; // espera a página montar os primeiros cards

  let done = 0;
  let cancelled = false;

  // Se o usuário rolar/clicar, para de mexer — a ajuda é só para o começo.
  const stop = () => { cancelled = true; };
  window.addEventListener("wheel", stop, { once: true, passive: true });
  window.addEventListener("keydown", stop, { once: true });
  window.addEventListener("pointerdown", stop, { once: true });

  const tick = () => {
    if (cancelled || done >= STEPS) return;
    window.scrollBy({ top: Math.round(window.innerHeight * STEP_FRACTION), behavior: "smooth" });
    done += 1;
    setTimeout(tick, INTERVAL_MS);
  };

  // O aviso pode chegar um instante depois da aba abrir: confere duas vezes antes de desistir.
  const start = async () => {
    if (await cameFromClipSpy()) { setTimeout(tick, START_DELAY_MS); return true; }
    return false;
  };
  void start().then((ok) => { if (!ok) setTimeout(() => void start(), 1500); });
})();
