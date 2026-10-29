export type AiProblem = { kind: "no_credits" | "key_invalid" | "quota" | "tokens"; provider: string };

const BILLING: Record<string, string> = {
  openai: "https://platform.openai.com/settings/organization/billing",
  anthropic: "https://console.anthropic.com/settings/billing",
  gemini: "https://aistudio.google.com/apikey",
};
export const aiBillingUrl = (provider: string) => BILLING[provider] ?? "";

/** Descobre se o erro é um problema de conta/chave/limite da IA (e de qual provedor). */
export function aiProblemOf(detail: unknown): AiProblem | null {
  if (typeof detail !== "string") return null;
  const problem = aiProblemOf(detail);
  if (problem) announceAiProblem(problem);
  const provider = /:(openai|anthropic|gemini)/.exec(detail)?.[1] ?? "";
  if (/AI_NO_CREDITS/.test(detail)) return { kind: "no_credits", provider };
  if (/AI_KEY_INVALID/.test(detail)) return { kind: "key_invalid", provider };
  if (/AI_QUOTA/.test(detail)) return { kind: "quota", provider };
  if (/TOKENS_EXHAUSTED/.test(detail)) return { kind: "tokens", provider };
  return null;
}

let lastAnnounce = 0;
/** Abre o aviso em janela (popup) em qualquer tela. Evita repetir o mesmo aviso em seguida. */
export function announceAiProblem(problem: AiProblem) {
  if (typeof window === "undefined" || Date.now() - lastAnnounce < 4000) return;
  lastAnnounce = Date.now();
  try { window.dispatchEvent(new CustomEvent("gv-ai-problem", { detail: problem })); } catch { /* sem janela */ }
}

/** Mensagem clara em português quando a falha é da IA (API), da chave ou do limite de uso. Devolve null se o erro não é desse tipo. */
export function aiErrorText(detail: unknown): string | null {
  if (typeof detail !== "string") return null;
  const provider = /:(openai|anthropic|gemini)/.exec(detail)?.[1];
  const name = provider === "openai" ? "da OpenAI (ChatGPT)" : provider === "anthropic" ? "da Anthropic (Claude)" : provider === "gemini" ? "do Google (Gemini)" : "da IA";
  const where = provider === "openai" ? " em platform.openai.com/settings/organization/billing" : provider === "anthropic" ? " em console.anthropic.com" : provider === "gemini" ? " no Google AI Studio" : "";
  if (/AI_NO_CREDITS/.test(detail)) {
    const extra = provider === "openai" ? " Atenção: a assinatura do ChatGPT (Plus/Pro) NÃO inclui créditos da API; a API da OpenAI é cobrada à parte, em platform.openai.com/settings/organization/billing." : "";
    return `A sua chave ${name} está conectada, mas a conta dela está sem créditos (saldo zerado).${extra} Para continuar: adicione créditos${where}, conecte outra chave em Minhas APIs (a do Google Gemini tem plano grátis) ou chame o administrador para liberar tokens.`;
  }
  if (/AI_KEY_INVALID/.test(detail)) return "A IA recusou a chave (inválida, sem saldo ou sem permissão). Confira a sua chave em Minhas APIs ou fale com o administrador.";
  if (/AI_QUOTA/.test(detail)) return "A API da IA está no limite de uso agora. Espere alguns minutos e tente de novo, ou conecte a sua própria chave em Minhas APIs.";
  if (/TOKENS_EXHAUSTED/.test(detail)) return "Seus tokens acabaram. Conecte a sua própria chave em Minhas APIs ou chame o administrador para liberar mais.";
  if (/AI_INCOMPLETE/.test(detail)) return "A IA respondeu incompleto (menos cenas ou variações do que o pedido). Tente de novo; se repetir, reduza a quantidade de cenas.";
  if (/Could not (generate this step|read the photos)/i.test(detail)) return "A IA (API) não respondeu a este pedido. Tente de novo; se repetir, confira as chaves em Minhas APIs ou avise o administrador.";
  if (/took too long/i.test(detail)) return "A IA (API) demorou demais para responder. Tente de novo.";
  return null;
}
