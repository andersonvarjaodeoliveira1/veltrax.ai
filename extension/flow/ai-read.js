/* ClipGringa · Flow — decide quando a resposta do chat de IA terminou e tira dela o que é só interface do site.
 * Funções puras (sem página), carregadas antes do ai.js. Existem porque o botão de "parar" dos sites muda de nome
 * e a resposta era lida no meio: vinha só o rótulo do site ("O Gemini disse Pro...") ou um JSON pela metade. */

/** Tira do texto o que é interface do site e não resposta (rótulo de quem fala, aviso de IA, selo do modelo). */
function clipgringaCleanReply(text) {
  const raw = String(text || "").trim();
  let out = raw;
  out = out.replace(/(^|\n)\s*(O Gemini disse|Gemini said|O ChatGPT disse|ChatGPT said|Claude respondeu|Claude said)\s*:?[ \t]*/gi, "$1");
  out = out.replace(/O Gemini (é|e) (uma )?IA e pode cometer erros[^\n]*/gi, "");
  out = out.replace(/Gemini (is an? AI and )?can make mistakes[^\n]*/gi, "");
  out = out.replace(/O ChatGPT pode cometer erros[^\n]*|ChatGPT can make mistakes[^\n]*/gi, "");
  out = out.replace(/(^|\n)\s*(Mostrar racioc[ií]nio|Show thinking|Pensando\.*|Thinking\.*|Analisando\.*)\s*(?=\n|$)/gi, "$1");
  out = out.trim();
  // Quando havia interface do site em volta, o que sobra pode ser só o selo do modelo ("Pro", "Flash", "2.5 Pro"):
  // uma ou duas palavras, sem frase nem JSON. Resposta curta sem nada do site em volta fica como está.
  if (out !== raw && out.length <= 24 && !/[{}\[\].!?:]/.test(out) && out.split(/\s+/).length <= 3 && /^(?:\d+(?:[.,]\d+)?\s*)?[A-Z][A-Za-z0-9-]*(?:\s+[A-Z0-9][A-Za-z0-9-]*)?$/.test(out)) return "";
  return out;
}

/** O pedido exige resposta em JSON? (é como o ClipGringa pede: "responda SOMENTE com um objeto JSON válido") */
function clipgringaWantsJson(prompt) {
  return /responda SOMENTE com um objeto JSON|objeto JSON v[aá]lido|\bJSON\b/i.test(String(prompt || ""));
}

/** Há um objeto ou lista JSON completo no texto? Conta chaves e colchetes fora das aspas, do primeiro que abre até fechar. */
function clipgringaJsonComplete(text) {
  const body = String(text || "");
  let start = -1;
  for (let i = 0; i < body.length; i += 1) { if (body[i] === "{" || body[i] === "[") { start = i; break; } }
  if (start < 0) return false;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < body.length; i += 1) {
    const ch = body[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{" || ch === "[") depth += 1;
    else if (ch === "}" || ch === "]") { depth -= 1; if (depth === 0) return true; }
  }
  return false;
}

/**
 * A resposta pode ser entregue agora?
 * - quietMs: há quanto tempo o texto não muda; generating: o site ainda mostra o botão de parar;
 * - sawGenerating: o botão de parar foi visto em algum momento deste pedido (se nunca foi, o site mudou e a pausa
 *   precisa ser bem maior, porque o modelo "pensa" calado por vários segundos).
 * Devolve o texto limpo quando terminou, ou "" para continuar esperando.
 */
function clipgringaReplyDone(prompt, rawText, quietMs, generating, sawGenerating) {
  if (generating) return "";
  const text = clipgringaCleanReply(rawText);
  if (!text) return "";
  if (clipgringaWantsJson(prompt)) {
    // Com JSON pedido, só vale um JSON fechado. Texto solto ou JSON pela metade continua esperando.
    return clipgringaJsonComplete(text) && quietMs > 1200 ? text : "";
  }
  return quietMs > (sawGenerating ? 2200 : 6000) ? text : "";
}

/**
 * Continua esperando a resposta?
 * Até o prazo normal, sempre. Depois dele, só enquanto o site ainda está trabalhando (botão de parar na tela) e
 * sem passar do prazo máximo. Medido em 16/11/2026: o Gemini ficou 44 s "pensando" num pedido mínimo antes de
 * escrever a primeira letra; desistir aos 55 s e recomeçar do zero jogava fora uma resposta que estava a caminho.
 */
function clipgringaKeepWaiting(now, deadline, hardDeadline, generating) {
  return now < deadline || (generating && now < hardDeadline);
}

