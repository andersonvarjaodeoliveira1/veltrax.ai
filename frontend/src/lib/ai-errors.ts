/** Mensagem clara em português quando a falha é da IA (API), da chave ou do limite de uso. Devolve null se o erro não é desse tipo. */
export function aiErrorText(detail: unknown): string | null {
  if (typeof detail !== "string") return null;
  if (/AI_KEY_INVALID/.test(detail)) return "A IA recusou a chave (inválida, sem saldo ou sem permissão). Confira a sua chave em Minhas APIs ou fale com o administrador.";
  if (/AI_QUOTA/.test(detail)) return "A API da IA está no limite de uso agora. Espere alguns minutos e tente de novo, ou conecte a sua própria chave em Minhas APIs.";
  if (/TOKENS_EXHAUSTED/.test(detail)) return "Seus tokens acabaram. Conecte a sua própria chave em Minhas APIs ou chame o administrador para liberar mais.";
  if (/Could not (generate this step|read the photos)/i.test(detail)) return "A IA (API) não respondeu a este pedido. Tente de novo; se repetir, confira as chaves em Minhas APIs ou avise o administrador.";
  if (/took too long/i.test(detail)) return "A IA (API) demorou demais para responder. Tente de novo.";
  return null;
}
