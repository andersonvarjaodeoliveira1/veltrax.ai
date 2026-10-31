/** Memória do cliente: lembra as escolhas de um projeto para o próximo já abrir com elas. Fica só neste navegador. */
export type ClientMemory = {
  keyword?: string;
  language?: string;
  count?: number;
  sceneCount?: number;
  takes?: number;
  takeKind?: string;
  copyMode?: "same" | "mix";
  avatarMode?: "own" | "random";
};

const KEY = "gv-client-memory-v1";
const inRange = (value: unknown, min: number, max: number) => typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;

export function readMemory(): ClientMemory {
  try {
    const raw = JSON.parse(window.localStorage.getItem(KEY) ?? "{}") as Record<string, unknown>;
    const out: ClientMemory = {};
    if (typeof raw.keyword === "string" && raw.keyword.trim() && raw.keyword.length <= 30) out.keyword = raw.keyword;
    if (typeof raw.language === "string" && /^[a-z]{2}(-[A-Z]{2})?$/.test(raw.language)) out.language = raw.language;
    if (inRange(raw.count, 1, 10)) out.count = raw.count as number;
    if (inRange(raw.sceneCount, 1, 8)) out.sceneCount = raw.sceneCount as number;
    if (inRange(raw.takes, 1, 4)) out.takes = raw.takes as number;
    if (typeof raw.takeKind === "string" && ["same", "variation", "continue", "speak"].includes(raw.takeKind)) out.takeKind = raw.takeKind;
    if (raw.copyMode === "same" || raw.copyMode === "mix") out.copyMode = raw.copyMode;
    if (raw.avatarMode === "own" || raw.avatarMode === "random") out.avatarMode = raw.avatarMode;
    return out;
  } catch { return {}; }
}

export function writeMemory(next: ClientMemory) {
  const defined = Object.fromEntries(Object.entries(next).filter(([, value]) => value !== undefined && value !== ""));
  try { window.localStorage.setItem(KEY, JSON.stringify({ ...readMemory(), ...defined })); } catch { /* sem storage */ }
}

export function clearMemory() {
  try { window.localStorage.removeItem(KEY); } catch { /* sem storage */ }
}
