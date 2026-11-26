// Entrada sem senha (link por e-mail) e acesso do assinante da Gringatools.

/** Marca que o servidor põe na recusa de quem entrou como assinante e está sem assinatura ativa. */
export const INACTIVE_MEMBER_CODE = "ASSINATURA_INATIVA";
/** Validade do link de entrada. O e-mail e a tela dizem o mesmo número. */
export const LOGIN_LINK_MINUTES = 15;
/** Formato do código que vai no link (letras geradas pelo servidor). */
export const LOGIN_TOKEN_RE = /^[A-Za-z]{24,64}$/;

export const FEEDBACK_WHATSAPP_URL =
  "https://wa.me/5511913142143?text=" + encodeURIComponent("Olá! Estou usando o ClipGringa e quero falar com o suporte.");
