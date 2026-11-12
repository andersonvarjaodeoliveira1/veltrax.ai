// Quando o vídeo nasce de um tema de uma página do Facebook, guardamos para onde ele vai.
// Assim, ao terminar o vídeo final, um clique o coloca na agenda daquela página.
export type FacebookTarget = { pageId: string; pageName: string; title: string; caption: string; at: number };

const KEY = "cg_fb_target";
const TTL_MS = 24 * 60 * 60 * 1000;

export function targetFromLink(search: string): Omit<FacebookTarget, "at"> | null {
  const q = new URLSearchParams(search);
  const pageId = (q.get("pagina") ?? "").trim();
  if (!pageId || (q.get("roteiro") ?? "").trim().length < 20) return null;
  return { pageId, pageName: (q.get("nome") ?? "").trim() || "sua página", title: (q.get("tema") ?? "").trim().slice(0, 200), caption: (q.get("legenda") ?? "").trim().slice(0, 3000) };
}

export function saveTarget(target: Omit<FacebookTarget, "at">) {
  try { window.localStorage.setItem(KEY, JSON.stringify({ ...target, at: Date.now() })); } catch { /* sem armazenamento: segue sem o atalho */ }
}

export function readTarget(): FacebookTarget | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const t = JSON.parse(raw) as FacebookTarget;
    if (!t?.pageId || Date.now() - (t.at || 0) > TTL_MS) { window.localStorage.removeItem(KEY); return null; }
    return t;
  } catch { return null; }
}

export function clearTarget() {
  try { window.localStorage.removeItem(KEY); } catch { /* nada a limpar */ }
}
