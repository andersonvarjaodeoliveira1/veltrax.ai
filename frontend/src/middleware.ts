import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { aiReason, guardToken } from "@/lib/ai-agents";
import { exceedsUploadLimit } from "@/lib/upload-limit";

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

// Fisgas de código-fonte: o site nunca serve .map, .ts/.tsx, backups ou a pasta src. Quem pede isso está atrás do código.
const SOURCE_PROBE = /\.(?:map|ts|tsx|jsx|mts|cts|scss|sass|less|bak|old|orig|swp|git)$|^\/(?:src|node_modules|\.next\/cache)\//i;

function isPagePath(pathname: string) {
  return !pathname.startsWith("/api") && !pathname.startsWith("/_next") && !pathname.startsWith("/extensao") && !pathname.startsWith("/.well-known") && !PUBLIC_FILE.test(pathname);
}

// Textos legais são para qualquer um ler, inclusive os verificadores da Meta (que conferem a política de privacidade
// e a exclusão de dados do app): nenhum agente é recusado nessas três páginas.
// O robots.txt entra junto: é o arquivo feito para os robôs lerem. Recusado, a Meta entende "tudo proibido"
// e nem chega a pedir a página (foi o que travou o cadastro do endereço de exclusão de dados).
const LEGAL_PAGES = /^\/(?:robots\.txt|(?:privacy|terms|data-deletion)\/?)$/;

export function isHostileRequest(pathname: string, userAgent: string | null): boolean {
  if (LEGAL_PAGES.test(pathname)) return false;
  if (PROBE_PATHS.test(pathname) || SOURCE_PROBE.test(pathname) || BLOCKED_AGENTS.test(userAgent ?? "")) return true;
  if (isPagePath(pathname) && (!userAgent || SCRIPT_AGENTS.test(userAgent))) return true;
  return false;
}

const COMMON_BROWSER = /^Mozilla\/5\.0 \((?:Windows|Macintosh|X11|Linux|iPhone|iPad|Android)/;

/** Quem lê o robots.txt e os textos legais sem ser um navegador comum (é assim que os verificadores da Meta chegam). */
export function isLegalProbe(pathname: string, userAgent: string | null): boolean {
  return LEGAL_PAGES.test(pathname) && !COMMON_BROWSER.test(userAgent ?? "");
}

// Rastro mínimo no log do site: só o caminho, o método e o agente. Nada de endereço, cookie ou conta.
function note(kind: "recusado" | "legal", request: NextRequest) {
  console.warn(JSON.stringify({
    guard: kind, method: request.method, path: request.nextUrl.pathname.slice(0, 80),
    ua: (request.headers.get("user-agent") ?? "").slice(0, 140),
  }));
}

const AGENT_LOG_PATH = "/api/security/agente";

export async function middleware(request: NextRequest) {
  const userAgent = request.headers.get("user-agent");
  // Robô ou agente de IA (declarado no User-Agent, assinado, ou pedindo arquivo que só robô procura): o pedido é
  // desviado para a rota que registra quem foi (e bloqueia a conta, se ele estava usando uma) e recusa.
  // Os textos legais e o robots.txt continuam abertos para qualquer um.
  const ai = LEGAL_PAGES.test(request.nextUrl.pathname) ? null : aiReason(request.nextUrl.pathname, userAgent, request.headers);
  if (ai) {
    const token = await guardToken();
    // O pedido já desviado volta a passar por aqui: com a marca certa, segue para a rota de registro.
    if (request.nextUrl.pathname === AGENT_LOG_PATH && request.headers.get("x-cg-guard") === token) return NextResponse.next();
    note("recusado", request);
    const headers = new Headers(request.headers);
    headers.set("x-cg-guard", token);
    headers.set("x-cg-motivo", ai);
    headers.set("x-cg-caminho", request.nextUrl.pathname.slice(0, 120));
    const target = request.nextUrl.clone();
    target.pathname = AGENT_LOG_PATH;
    target.search = "";
    return NextResponse.rewrite(target, { request: { headers } });
  }
  if (isHostileRequest(request.nextUrl.pathname, userAgent)) {
    note("recusado", request);
    return new NextResponse("Forbidden", { status: 403, headers: { "Cache-Control": "no-store" } });
  }
  if (isLegalProbe(request.nextUrl.pathname, userAgent)) note("legal", request);
  // Arquivo maior que o teto do site: recusa com aviso claro, em vez de deixar passar só o começo dele.
  if (exceedsUploadLimit(request.headers.get("content-length"))) {
    return NextResponse.json({ detail: "Arquivo grande demais. O limite por envio é 1 GB." }, { status: 413, headers: { "Cache-Control": "no-store" } });
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
