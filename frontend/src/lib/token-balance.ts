export const ADMIN_WHATSAPP_URL =
  "https://wa.me/5511913142143?text=" + encodeURIComponent("Olá! Meus tokens do ClipGringa acabaram. Quero comprar mais créditos.");

export type TokenBalance = { unlimited: boolean; granted: number | null; used: number; remaining: number | null; exhausted: boolean; own_key?: boolean };

export const SECURITY_WHATSAPP_URL =
  "https://wa.me/5511913142143?text=" + encodeURIComponent("Olá Anderson! Meu acesso ao ClipGringa foi bloqueado por atividade incomum. Preciso de ajuda para liberar.");
