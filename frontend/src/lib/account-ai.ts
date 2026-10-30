/** Gerar os textos pela conta de IA da pessoa (Gemini, ChatGPT ou Claude) usando a extensão. */

export type AccountSite = "gemini" | "chatgpt" | "claude";
export type AccountChoice = { site: AccountSite | "api" | "none"; at: number };
/** pronta · sem login · aba não aberta · carregando · bloqueada (captcha) · sem acesso ao site */
export type SiteState = "ready" | "guest" | "login" | "notab" | "loading" | "blocked" | "nopage";

export const ACCOUNT_SITES: Record<AccountSite, { label: string; owner: string; url: string }> = {
  gemini: { label: "Gemini", owner: "Google", url: "https://gemini.google.com/app" },
  chatgpt: { label: "ChatGPT", owner: "OpenAI", url: "https://chatgpt.com/" },
  claude: { label: "Claude", owner: "Anthropic", url: "https://claude.ai/new" },
};
export const isAccountSite = (value: unknown): value is AccountSite => value === "gemini" || value === "chatgpt" || value === "claude";

const KEY = "gv-account-ai-v1";
const DISMISSED = "gv-account-ai-dismissed-v1";
export const ACCOUNT_AI_EVENT = "gv-account-ai-changed";
export const OPEN_ACCOUNT_AI_EVENT = "gv-open-account-ai";

export function readChoice(): AccountChoice | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as AccountChoice;
    return isAccountSite(data.site) || data.site === "api" || data.site === "none" ? data : null;
  } catch { return null; }
}

export function writeChoice(site: AccountChoice["site"] | null) {
  try {
    if (site === null) window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, JSON.stringify({ site, at: Date.now() }));
  } catch { /* armazenamento indisponível */ }
  try { window.dispatchEvent(new Event(ACCOUNT_AI_EVENT)); } catch { /* sem janela */ }
}

export function dismissedRecently(days = 7): boolean {
  try { const at = Number(window.localStorage.getItem(DISMISSED) || 0); return at > 0 && Date.now() - at < days * 86400_000; } catch { return false; }
}
export function dismissSetup() { try { window.localStorage.setItem(DISMISSED, String(Date.now())); } catch { /* ignora */ } }

let counter = 0;
/** Fala com a extensão pela ponte da página e espera a resposta do mesmo id. */
function bridgeCall<T>(type: string, payload: Record<string, unknown>, replyType: string, timeoutMs: number): Promise<T | null> {
  return new Promise((resolve) => {
    counter += 1;
    const id = `${Date.now().toString(36)}-${counter}`;
    let done = false;
    const finish = (value: T | null) => { if (done) return; done = true; window.removeEventListener("message", on); window.clearTimeout(timer); resolve(value); };
    const on = (event: MessageEvent) => {
      if ((event.origin && event.origin !== window.location.origin) || !event.data || event.data.source !== "clipgringa-flow" || event.data.type !== replyType) return;
      if (event.data.id !== id) return;
      finish(event.data.data as T);
    };
    const timer = window.setTimeout(() => finish(null), timeoutMs);
    window.addEventListener("message", on);
    window.postMessage({ source: "clipgringa-page", type, id, ...payload }, window.location.origin);
  });
}

/** A extensão instalada sabe gerar texto pela conta? (versão 1.16.0 ou mais nova) */
export function extensionHasAi(timeoutMs = 2500): Promise<{ version: string } | null> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (value: { version: string } | null) => { if (done) return; done = true; window.removeEventListener("message", on); window.clearTimeout(timer); resolve(value); };
    const on = (event: MessageEvent) => {
      if ((event.origin && event.origin !== window.location.origin) || !event.data || event.data.source !== "clipgringa-flow" || event.data.type !== "ai-hello") return;
      finish({ version: String(event.data.version || "") });
    };
    const timer = window.setTimeout(() => finish(null), timeoutMs);
    window.addEventListener("message", on);
    window.postMessage({ source: "clipgringa-page", type: "ai-hello?" }, window.location.origin);
  });
}

/** Vê se a pessoa está logada no site da IA. `open: true` abre uma aba própria (e fecha); sem isso só olha as abas que ela já tem. */
export async function probeSite(site: AccountSite, open = false): Promise<SiteState> {
  const reply = await bridgeCall<{ state?: SiteState }>("ai-probe", { site, open }, "ai-probe-result", open ? 45_000 : 9_000);
  return reply?.state ?? "nopage";
}

export type AskResult = { ok: boolean; text?: string; error?: string };
export type AskImage = { mime: string; data: string };
export async function askAccount(site: AccountSite, prompt: string, timeoutMs = 100_000, images: AskImage[] = []): Promise<AskResult> {
  const reply = await bridgeCall<AskResult>("ai-ask", { site, prompt, timeoutMs: timeoutMs + (images.length ? 40_000 : 0), images }, "ai-answer", timeoutMs + (images.length ? 40_000 : 0) + 40_000);
  return reply ?? { ok: false, error: "nopage" };
}

/** Texto do aviso fixo sobre por onde a IA gerou (o servidor diz em x-ai-path). */
export function aiPathLabel(path: string): { text: string; kind: "api" | "account" | "plan" } {
  const [kind, who] = path.split(":");
  const names: Record<string, string> = { gemini: "Gemini", chatgpt: "ChatGPT", claude: "Claude", openrouter: "OpenRouter", huggingface: "Hugging Face", ollama: "Ollama" };
  if (kind === "api") return { kind: "api", text: `Texto gerado pela sua chave de API do ${names[who] ?? "provedor"}.` };
  if (kind === "account") return { kind: "account", text: `Texto gerado pela sua conta do ${names[who] ?? "provedor"} (extensão).` };
  return { kind: "plan", text: "Texto gerado com os créditos do plano ClipGringa." };
}
