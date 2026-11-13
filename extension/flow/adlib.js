// ClipGringa · ClipSpy — rolagem suave na Ad Library da Meta.
//
// Esta aba é aberta pela pesquisa do ClipSpy (botão Pesquisar). O script só
// rola a página algumas vezes, devagar, para disparar o carregamento dos
// primeiros anúncios — assim o usuário não precisa rolar na mão.
//
// Ele NÃO lê, NÃO coleta e NÃO interage com nada da página: é só um auxílio
// de visualização. E só age quando a aba veio do ClipSpy (marca cg=1 na URL),
// para não atrapalhar quando o usuário abre a Ad Library por conta própria.
(() => {
  "use strict";

  const FLAG = "__clipgringa_adlib_scroll";
  if (window[FLAG]) return;
  window[FLAG] = true;

  // Só rola se a aba foi aberta pelo ClipSpy.
  try {
    if (new URLSearchParams(location.search).get("cg") !== "1") return;
  } catch {
    return;
  }

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

  setTimeout(tick, START_DELAY_MS);
})();
