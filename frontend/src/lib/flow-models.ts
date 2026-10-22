// Modelos do Flow que os membros podem usar (consomem créditos da conta deles) e a categoria salva de cada um.
// Lower Priority não aparece aqui: só a conta administradora usa.
export const FLOW_MODELS = [
  { id: "lite", name: "Veo 3.1 - Lite", needle: "Lite", credits: 10, note: "o mais barato" },
  { id: "fast", name: "Veo 3.1 - Fast", needle: "Fast", credits: 20, note: "mais rápido" },
  { id: "omni", name: "Omni Flash (720p)", needle: "Omni", credits: 12, note: "gera em 720p" },
  { id: "quality", name: "Veo 3.1 - Quality", needle: "Quality", credits: 100, note: "a melhor qualidade, bem mais caro" },
];

const KEY = "gv-flow-model";

export function readFlowCategory(): string | null {
  try {
    const saved = window.localStorage.getItem(KEY);
    return FLOW_MODELS.some((m) => m.id === saved) ? saved : null;
  } catch {
    return null;
  }
}

export function saveFlowCategory(id: string): void {
  try { window.localStorage.setItem(KEY, id); } catch { /* storage unavailable */ }
}
