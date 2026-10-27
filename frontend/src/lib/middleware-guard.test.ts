import { describe, expect, it } from "vitest";
import { isHostileRequest } from "../middleware";

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
  it("deixa passar navegadores, Stripe e o aplicativo", () => {
    const chrome = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36";
    expect(isHostileRequest("/automacao", chrome)).toBe(false);
    expect(isHostileRequest("/api/billing/webhook", "Stripe/1.0 (+https://stripe.com/docs/webhooks)")).toBe(false);
    expect(isHostileRequest("/api/billing/revenuecat-webhook", null)).toBe(false);
    expect(isHostileRequest("/.well-known/apple-app-site-association", chrome)).toBe(false);
  });
});
