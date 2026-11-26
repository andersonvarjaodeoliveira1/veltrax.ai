import { describe, expect, it } from "vitest";

import { AI_AGENT_UA, AI_BAIT_LINK, AI_BAIT_PATHS, aiReason, guardToken } from "./ai-agents";

const none = { get: () => null };

describe("robôs e agentes de IA", () => {
  it.each([
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22B83 Instagram 356.0.0.24.90 (iPhone15,3; iOS 18_1; pt_BR)",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 OPR/116.0.0.0",
    "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
    "WhatsApp/2.23.20.0",
    "Stripe/1.0 (+https://stripe.com/docs/webhooks)",
  ])("não confunde navegador de gente nem serviço conhecido (%s)", (userAgent) => {
    expect(AI_AGENT_UA.test(userAgent)).toBe(false);
    expect(aiReason("/", userAgent, none)).toBeNull();
  });

  it.each(["GPTBot/1.3", "ChatGPT-User/1.0", "Claude-User/1.0", "Perplexity-User/1.0", "Google-CloudVertexBot", "Gemini-Deep-Research", "GoogleAgent-Mariner",
    "Google-NotebookLM", "Manus-User", "NovaAct", "TwinAgent", "MistralAI-User/1.0", "DeepSeekBot", "FirecrawlAgent", "Devin", "meta-externalagent/1.1", "CCBot/2.0", "bedrockbot"])(
    "reconhece %s", (token) => {
      expect(aiReason("/", `Mozilla/5.0 (compatible; ${token}; +https://example.com/bot)`, none)).toBe("agente_ia");
    });

  it("o cabeçalho assinado vale mais que o User-Agent", () => {
    const signed = { get: (name: string) => (name === "signature-agent" ? '"https://chatgpt.com"' : null) };
    expect(aiReason("/", "Mozilla/5.0 (Macintosh) Chrome/138.0.0.0 Safari/537.36", signed)).toBe("agente_assinado");
  });

  it("a isca está na lista de caminhos e as telas de verdade não", () => {
    expect(AI_BAIT_PATHS.test(AI_BAIT_LINK)).toBe(true);
    for (const path of ["/", "/sign-in", "/api/tasks/create", "/api/integrations", "/api/security/report", "/robots.txt", "/sitemap.xml", "/minhas-apis", "/api/auth/get-session", "/.well-known/apple-app-site-association"]) {
      expect(AI_BAIT_PATHS.test(path), path).toBe(false);
    }
  });

  it("a marca do middleware depende do segredo do servidor", async () => {
    const before = process.env.BETTER_AUTH_SECRET;
    process.env.BETTER_AUTH_SECRET = "segredo-a";
    const a = await guardToken();
    process.env.BETTER_AUTH_SECRET = "segredo-b";
    const b = await guardToken();
    process.env.BETTER_AUTH_SECRET = before;
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });
});
