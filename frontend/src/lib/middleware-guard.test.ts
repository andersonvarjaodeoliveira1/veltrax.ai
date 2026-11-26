import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { isHostileRequest, isLegalProbe, middleware } from "../middleware";
import { MAX_SITE_UPLOAD_BYTES } from "./upload-limit";

describe("middleware · robôs e varreduras", () => {
  it("bloqueia scanners, copiadores e robôs de IA", () => {
    for (const ua of ["sqlmap/1.7", "Nikto/2.5", "Mozilla/5.0 (compatible; GPTBot/1.1)", "HTTrack 3.49", "Mozilla/5.0 AppleWebKit ClaudeBot/1.0", "Scrapy/2.11"]) {
      expect(isHostileRequest("/", ua)).toBe(true);
    }
  });
  it("bloqueia caminhos de sondagem", () => {
    for (const path of ["/.env", "/.git/config", "/wp-login.php", "/phpmyadmin/", "/actuator/health"]) {
      expect(isHostileRequest(path, "Mozilla/5.0")).toBe(true);
    }
  });
  it("bloqueia scripts e navegadores sem cabeça nas páginas, mas não em /api nem em arquivos", () => {
    for (const ua of ["curl/8.5.0", "python-requests/2.31", "Wget/1.21", "Mozilla/5.0 HeadlessChrome/130", "Go-http-client/2.0", "Claude-User/1.0"]) {
      expect(isHostileRequest("/automacao", ua)).toBe(true);
    }
    expect(isHostileRequest("/", null)).toBe(true);
    expect(isHostileRequest("/api/billing/webhook", "Go-http-client/2.0")).toBe(false);
    expect(isHostileRequest("/api/health", null)).toBe(false);
    expect(isHostileRequest("/extensao/clipgringa-flow.zip", "curl/8.5.0")).toBe(false);
  });
  it("recusa quem pesca arquivos-fonte do aplicativo", () => {
    for (const path of ["/_next/static/chunks/main.js.map", "/src/middleware.ts", "/components/app/app-shell.tsx", "/app.js.bak", "/server.ts", "/node_modules/next/package.json"]) {
      expect(isHostileRequest(path, "Mozilla/5.0 (Windows NT 10.0) Chrome/130")).toBe(true);
    }
    // os arquivos que o site serve de verdade continuam passando
    const chrome = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130";
    for (const path of ["/_next/static/chunks/main-abc.js", "/_next/static/css/app.css", "/extensao/clipgringa-flow.zip", "/extensao/version.json", "/fontes/Inter.woff2", "/icone.png", "/site.webmanifest"]) {
      expect(isHostileRequest(path, chrome)).toBe(false);
    }
  });
  it("deixa passar navegadores, Stripe e o aplicativo", () => {
    const chrome = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36";
    expect(isHostileRequest("/automacao", chrome)).toBe(false);
    expect(isHostileRequest("/api/billing/webhook", "Stripe/1.0 (+https://stripe.com/docs/webhooks)")).toBe(false);
    expect(isHostileRequest("/api/billing/revenuecat-webhook", null)).toBe(false);
    expect(isHostileRequest("/.well-known/apple-app-site-association", chrome)).toBe(false);
  });
  it("deixa qualquer agente ler os textos legais, que a Meta confere no cadastro do app", () => {
    for (const path of ["/robots.txt", "/privacy", "/terms", "/data-deletion", "/data-deletion/"]) {
      for (const ua of ["meta-externalfetcher/1.1", "meta-externalagent/1.1", "facebookexternalhit/1.1", "curl/8.4.0", null]) {
        expect(isHostileRequest(path, ua)).toBe(false);
      }
    }
    expect(isHostileRequest("/privacy/extra", "curl/8.4.0")).toBe(true);
    expect(isHostileRequest("/clipspy", "meta-externalfetcher/1.1")).toBe(true);
  });
  it("anota quem lê o robots.txt e os textos legais sem ser navegador comum", () => {
    const chrome = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36";
    expect(isLegalProbe("/robots.txt", "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)")).toBe(true);
    expect(isLegalProbe("/data-deletion", "Mozilla/5.0 (compatible; meta-externalagent/1.1)")).toBe(true);
    expect(isLegalProbe("/privacy", null)).toBe(true);
    expect(isLegalProbe("/privacy", chrome)).toBe(false);
    expect(isLegalProbe("/clipspy", "facebookexternalhit/1.1")).toBe(false);
  });
});

describe("middleware · tamanho do envio", () => {
  const post = (size: number) => middleware(new NextRequest("https://clipgringa.gringatools.com/api/multiplier/captions/draft", {
    method: "POST", headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0) Chrome/130", "content-length": String(size) },
  }));
  it("recusa com aviso claro o arquivo acima do teto, em vez de deixar passar só o começo", async () => {
    const response = await post(MAX_SITE_UPLOAD_BYTES + 1);
    expect(response.status).toBe(413);
    expect((await response.json()).detail).toMatch(/grande demais/);
  });
  it("deixa passar o vídeo dentro do teto", async () => {
    expect((await post(250 * 1024 * 1024)).status).toBe(200);
  });
});

describe("middleware · robôs e agentes de IA", () => {
  const chromeUa = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36";
  const visit = (path: string, headers: Record<string, string>) => middleware(new NextRequest(`https://clipgringa.gringatools.com${path}`, { headers }));
  const rewrittenTo = (response: Response) => response.headers.get("x-middleware-rewrite") ?? "";

  it("desvia para o registro o agente do ChatGPT, que usa User-Agent de Chrome comum e só se entrega pelo cabeçalho assinado", async () => {
    const response = await visit("/", { "user-agent": chromeUa, "signature-agent": '"https://chatgpt.com"', cookie: "better-auth.session_token=abc" });
    expect(rewrittenTo(response)).toBe("https://clipgringa.gringatools.com/api/security/agente");
    expect(response.headers.get("x-middleware-request-x-cg-motivo")).toBe("agente_assinado");
    expect(response.headers.get("x-middleware-request-x-cg-caminho")).toBe("/");
    expect(response.headers.get("x-middleware-request-x-cg-guard")).toMatch(/^[0-9a-f]{64}$/);
  });

  it.each([
    ["Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot", "/sign-in"],
    ["Mozilla/5.0 (compatible; Google-CloudVertexBot/1.0)", "/"],
    ["Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Gemini-Deep-Research; +https://gemini.google/overview/deep-research/) Chrome/135.0.0.0 Safari/537.36", "/automacao"],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131 Safari/537.36 Manus-User/1.0", "/api/tasks/"],
  ])("desvia o robô de IA declarado (%s)", async (userAgent, path) => {
    const response = await visit(path, { "user-agent": userAgent });
    expect(rewrittenTo(response)).toContain("/api/security/agente");
    expect(response.headers.get("x-middleware-request-x-cg-motivo")).toBe("agente_ia");
  });

  it("trata como isca os arquivos que só robô procura, mesmo com navegador comum", async () => {
    for (const path of ["/llms.txt", "/openapi.json", "/.well-known/ai-plugin.json", "/api/interno/mapa-do-sistema.json"]) {
      const response = await visit(path, { "user-agent": chromeUa });
      expect(response.headers.get("x-middleware-request-x-cg-motivo"), path).toBe("isca");
    }
  });

  it("não mexe com navegador de gente nem com os textos legais", async () => {
    for (const path of ["/", "/sign-in", "/minhas-apis", "/api/auth/get-session", "/sitemap.xml"]) {
      expect(rewrittenTo(await visit(path, { "user-agent": chromeUa })), path).toBe("");
    }
    // A Meta e qualquer robô continuam lendo a política de privacidade.
    expect(rewrittenTo(await visit("/privacy", { "user-agent": "Mozilla/5.0 (compatible; ChatGPT-User/1.0)", "signature-agent": '"https://chatgpt.com"' }))).toBe("");
  });

  it("o pedido já desviado segue para o registro em vez de ser desviado de novo", async () => {
    const first = await visit("/", { "user-agent": "Mozilla/5.0 (compatible; ChatGPT-User/1.0)" });
    const token = first.headers.get("x-middleware-request-x-cg-guard")!;
    const again = await visit("/api/security/agente", { "user-agent": "Mozilla/5.0 (compatible; ChatGPT-User/1.0)", "x-cg-guard": token, "x-cg-motivo": "agente_ia" });
    expect(rewrittenTo(again)).toBe("");
    expect(again.headers.get("x-middleware-next")).toBe("1");
    // Com a marca errada, o robô que chama a rota direto é desviado como qualquer outro pedido dele.
    const forged = await visit("/api/security/agente", { "user-agent": "Mozilla/5.0 (compatible; ChatGPT-User/1.0)", "x-cg-guard": "errada" });
    expect(rewrittenTo(forged)).toContain("/api/security/agente");
    expect(forged.headers.get("x-middleware-request-x-cg-guard")).toBe(token);
  });

  it("ninguém de fora consegue fingir que é o middleware", async () => {
    const response = await visit("/minhas-apis", { "user-agent": chromeUa, "x-cg-guard": "qualquer", "x-cg-motivo": "agente_ia" });
    expect(rewrittenTo(response)).toBe("");
  });
});
