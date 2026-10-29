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
