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
    const response = post(MAX_SITE_UPLOAD_BYTES + 1);
    expect(response.status).toBe(413);
    expect((await response.json()).detail).toMatch(/grande demais/);
  });
  it("deixa passar o vídeo dentro do teto", () => {
    expect(post(250 * 1024 * 1024).status).toBe(200);
  });
});
