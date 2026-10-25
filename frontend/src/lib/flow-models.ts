// Modelos do Flow que os membros podem usar (consomem créditos da conta deles) e a categoria salva de cada um.
// O Lower Priority (0 créditos) só existe para quem tem esse plano no Flow; ele aparece em FLOW_CHOICES, junto das demais opções.
export const FLOW_MODELS = [
  { id: "lite", name: "Veo 3.1 - Lite", needle: "Lite", credits: 10, note: "o mais barato" },
  { id: "fast", name: "Veo 3.1 - Fast", needle: "Fast", credits: 20, note: "mais rápido" },
  { id: "omni", name: "Omni Flash (720p)", needle: "Omni", credits: 12, note: "gera em 720p" },
  { id: "quality", name: "Veo 3.1 - Quality", needle: "Quality", credits: 100, note: "a melhor qualidade, bem mais caro" },
];

export const LOWER_PRIORITY = { id: "lower", name: "Veo 3.1 - Lite [Lower Priority]", needle: "[Lower Priority]", credits: 0, note: "sem custo, só para quem tem Lower Priority no Flow" };
export const FLOW_CHOICES = [LOWER_PRIORITY, ...FLOW_MODELS];

/** Categoria padrão: a que a pessoa já escolheu; sem escolha, a conta administradora usa Lower Priority e as demais, o Lite. */
export function defaultFlowCategory(isAdmin: boolean): string {
  return readFlowCategory() ?? (isAdmin ? LOWER_PRIORITY.id : FLOW_MODELS[0].id);
}

const KEY = "gv-flow-model";

export function readFlowCategory(): string | null {
  try {
    const saved = window.localStorage.getItem(KEY);
    return FLOW_CHOICES.some((m) => m.id === saved) ? saved : null;
  } catch {
    return null;
  }
}

export function saveFlowCategory(id: string): void {
  try { window.localStorage.setItem(KEY, id); } catch { /* storage unavailable */ }
}

/** Lower Priority (0 créditos) só existe no plano Ultra: só aparece quando a extensão leu "Ultra" na conta do Flow. */
export function hasLowerPriority(plan: string | null | undefined): boolean {
  return /ultra/i.test(plan ?? "");
}
export function visibleFlowChoices(plan: string | null | undefined) {
  return hasLowerPriority(plan) ? FLOW_CHOICES : FLOW_CHOICES.filter((m) => m.id !== LOWER_PRIORITY.id);
}
/** Se a categoria salva é Lower Priority mas a conta não tem, usa o Lite (o mais barato). */
export function effectiveFlowId(id: string, plan: string | null | undefined): string {
  return id === LOWER_PRIORITY.id && !hasLowerPriority(plan) ? FLOW_MODELS[0].id : id;
}
