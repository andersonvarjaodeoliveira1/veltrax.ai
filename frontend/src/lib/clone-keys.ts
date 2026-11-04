// Chaves do navegador que o assistente de clonagem e o painel do Flow usam para saber se o projeto está "vivo".
export const TOUCH_KEY = "gv-clonagem-touch";
export const SENT_KEY = "gv-clonagem-sent";

/** Enquanto o Flow está gerando, o projeto não pode expirar: marca como enviado e como mexido agora. */
export function keepProjectAlive() {
  try {
    window.localStorage.setItem(SENT_KEY, "1");
    window.localStorage.setItem(TOUCH_KEY, String(Date.now()));
  } catch { /* storage unavailable */ }
}

/** Estimativa de progresso de uma cena quando o Flow ainda não mostra a porcentagem: sobe devagar e nunca passa de 90%. */
export function estimatedPct(elapsedMs: number): number {
  const seconds = Math.max(0, elapsedMs) / 1000;
  return Math.min(90, Math.round(8 + 82 * (1 - Math.exp(-seconds / 90))));
}
