// Robôs e agentes de IA que leem sites a pedido de alguém ("analise este sistema", "copie esta tela").
// O ClipGringa é uma ferramenta privada: nenhum deles tem permissão. Lista usada pelo middleware e pelo robots.txt.

/** Nomes que esses robôs põem no User-Agent (como publicados pelos próprios donos). */
export const AI_AGENT_TOKENS = [
  // OpenAI, Anthropic, Perplexity, Mistral, Cohere, DeepSeek
  "GPTBot", "ChatGPT-User", "OAI-SearchBot", "ClaudeBot", "Claude-User", "Claude-SearchBot", "Claude-Web", "anthropic-ai",
  "PerplexityBot", "Perplexity-User", "MistralAI-User", "cohere-ai", "cohere-training-data-crawler", "DeepSeekBot",
  // Google
  "Google-Extended", "Google-CloudVertexBot", "Gemini-Deep-Research", "GoogleAgent-Mariner", "GoogleAgent-URLContext", "Google-Agent",
  "Google-NotebookLM", "Google-GeminiNotebook", "Google-Gemini-CLI", "GoogleOther",
  // Amazon, Meta, Apple, outros
  "Amazonbot", "Amzn-User", "AmazonBuyForMe", "NovaAct", "bedrockbot", "meta-externalagent", "FacebookBot", "Applebot-Extended",
  "Bytespider", "CCBot", "AI2Bot", "YouBot", "DuckAssistBot", "TimpiBot", "PanguBot", "Brightbot", "ICC-Crawler", "aiHitBot",
  // Agentes que navegam sozinhos e ferramentas de extração para IA
  "Manus-User", "TwinAgent", "Devin", "GeistHaus-PageFetcher", "FirecrawlAgent", "Firecrawl", "Crawl4AI", "Diffbot", "img2dataset",
] as const;

const escape = (token: string) => token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Nomes curtos só valem como palavra inteira, para não pegar um navegador comum por coincidência.
export const AI_AGENT_UA = new RegExp(AI_AGENT_TOKENS.map((token) => (token.length <= 6 ? `\\b${escape(token)}\\b` : escape(token))).join("|"), "i");

/**
 * Arquivos que só robôs e assistentes de IA procuram para "entender" um sistema. O ClipGringa não tem nenhum.
 * O último é a isca: um link escondido na tela, que nenhuma pessoa vê nem consegue clicar.
 */
export const AI_BAIT_LINK = "/api/interno/mapa-do-sistema.json";
export const AI_BAIT_PATHS = /^\/(?:llms(?:-full)?\.txt|\.well-known\/(?:ai-plugin\.json|llms\.txt|mcp(?:\.json)?|agent(?:s)?\.json)|openapi\.(?:json|ya?ml)|swagger(?:\.json|-ui(?:\/.*)?)?|api-docs(?:\/.*)?|api\/(?:docs|openapi\.json|swagger\.json)|api\/interno\/.*)$/i;

export type AiReason = "agente_assinado" | "agente_ia" | "isca";

/**
 * Diz se o pedido vem de um robô ou agente de IA, e por quê.
 * - agente_assinado: o pedido traz Signature-Agent (padrão Web Bot Auth). É como o agente do ChatGPT se identifica:
 *   ele usa o User-Agent de um Chrome comum, então só o cabeçalho entrega. Navegador de gente não manda isso.
 * - agente_ia: o User-Agent é de um robô ou assistente de IA conhecido.
 * - isca: pediu um arquivo que só robô procura.
 */
export function aiReason(pathname: string, userAgent: string | null, headers: { get(name: string): string | null }): AiReason | null {
  if (headers.get("signature-agent")) return "agente_assinado";
  if (userAgent && AI_AGENT_UA.test(userAgent)) return "agente_ia";
  if (AI_BAIT_PATHS.test(pathname)) return "isca";
  return null;
}

/** Marca que o middleware põe no pedido interno, para a rota de registro não aceitar chamada vinda de fora. */
export async function guardToken(): Promise<string> {
  const secret = process.env.BETTER_AUTH_SECRET || process.env.BACKEND_AUTH_SECRET || "clipgringa-dev";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${secret}:agente-de-ia`));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
