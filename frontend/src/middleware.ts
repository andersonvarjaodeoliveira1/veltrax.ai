import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_FILE = /\.(.*)$/;

// Ferramentas de varredura, copiadores de site e robôs de coleta (IA/raspagem). Navegadores, Stripe e RevenueCat não entram.
const BLOCKED_AGENTS = new RegExp(
  [
    "sqlmap", "nikto", "nmap", "masscan", "nuclei", "wpscan", "gobuster", "dirbuster", "feroxbuster", "ffuf", "wfuzz", "acunetix", "nessus", "openvas",
    "burp", "zgrab", "zmap", "shodan", "censys", "netsparker", "arachni", "havij", "metasploit", "hydra", "httrack", "webcopier", "teleport", "scrapy",
    "libwww-perl", "nutch", "gptbot", "chatgpt-user", "oai-searchbot", "ccbot", "claudebot", "anthropic-ai", "claude-web", "bytespider", "perplexitybot",
    "amazonbot", "claude-user", "claude-searchbot", "perplexity-user", "meta-externalagent", "meta-externalfetcher", "applebot-extended", "ai2bot", "youbot", "timpibot", "kangaroo", "duckassistbot", "mistralai-user", "cohere-training-data-crawler", "friendlycrawler", "img2dataset", "firecrawl", "crawl4ai", "diffbot", "petalbot", "semrush", "ahrefs", "mj12bot", "dotbot", "imagesiftbot", "omgili", "cohere-ai", "google-extended", "facebookbot",
  ].join("|"),
  "i",
);
// Caminhos que só robôs de varredura pedem; a aplicação não tem nada disso.
const PROBE_PATHS = /^\/(?:\.env|\.git|\.svn|\.hg|\.aws|\.ssh|\.ds_store|wp-admin|wp-login|wp-content|wp-includes|xmlrpc\.php|phpmyadmin|pma|admin\.php|config\.php|cgi-bin|vendor\/phpunit|actuator|server-status|manager\/html|backup|dump|db\.sql|database\.sql|id_rsa|docker-compose|dockerfile|composer\.json)/i;

// Scripts e navegadores sem cabeça que baixam as páginas para copiar: só valem para as páginas do site (não para /api, arquivos ou webhooks).
const SCRIPT_AGENTS = /^(?:curl|wget|python-requests|python-urllib|python-httpx|aiohttp|httpx|go-http-client|node-fetch|undici|axios|okhttp|java\/|libcurl|php|ruby|guzzle|postmanruntime|insomnia)|headlesschrome|phantomjs|puppeteer|playwright|selenium|webdriver/i;

function isPagePath(pathname: string) {
  return !pathname.startsWith("/api") && !pathname.startsWith("/_next") && !pathname.startsWith("/extensao") && !pathname.startsWith("/.well-known") && !PUBLIC_FILE.test(pathname);
}

export function isHostileRequest(pathname: string, userAgent: string | null): boolean {
  if (PROBE_PATHS.test(pathname) || BLOCKED_AGENTS.test(userAgent ?? "")) return true;
  if (isPagePath(pathname) && (!userAgent || SCRIPT_AGENTS.test(userAgent))) return true;
  return false;
}

export function middleware(request: NextRequest) {
  if (isHostileRequest(request.nextUrl.pathname, request.headers.get("user-agent"))) {
    return new NextResponse("Forbidden", { status: 403, headers: { "Cache-Control": "no-store" } });
  }
  const isLandingOnlyModeEnabled =
    process.env.NEXT_PUBLIC_LANDING_ONLY_MODE === "true";

  if (!isLandingOnlyModeEnabled) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;

  if (
    pathname === "/" ||
    pathname === "/status" ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/billing/webhook") ||
    PUBLIC_FILE.test(pathname)
  ) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api")) {
    return NextResponse.json(
      { error: "ClipGringa is in landing-page-only mode." },
      { status: 503 }
    );
  }

  const url = request.nextUrl.clone();
  url.pathname = "/";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: "/:path*",
};
