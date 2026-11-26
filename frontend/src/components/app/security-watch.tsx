"use client";

import { useEffect, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { isEditable, looksLikeCode, shortcutKind, type WatchKind } from "@/lib/security-watch";
import { SECURITY_WHATSAPP_URL } from "@/lib/token-balance";

type Strikes = { strikes: number; blocked: boolean; limit: number };
const SAME_KIND_MS = 3000;

// Marcas que ferramentas de automação deixam na página (Selenium, Puppeteer, PhantomJS, Nightmare).
const AUTOMATION_GLOBALS = ["__webdriver_evaluate", "__selenium_evaluate", "__webdriver_script_function", "__webdriver_script_func", "__webdriver_script_fn",
  "__fxdriver_evaluate", "__driver_unwrapped", "__webdriver_unwrapped", "__driver_evaluate", "__selenium_unwrapped", "__fxdriver_unwrapped",
  "_Selenium_IDE_Recorder", "_selenium", "calledSelenium", "__puppeteer_evaluation_script__", "callPhantom", "_phantom", "__nightmare", "domAutomation", "domAutomationController"];
// Marcas que agentes de IA que navegam sozinhos (browser-use e derivados) desenham por cima da tela para "enxergar" os botões.
const AGENT_MARKS = "#playwright-highlight-container, [browser-user-highlight-id]";

type AutomationView = { webdriver?: boolean; userAgent?: string };

/** Robô / navegador automatizado: não é uso normal de quem assina. Devolve o sinal encontrado, ou "" se não achou nada. */
export function automationSignal(
  nav: AutomationView = typeof navigator === "undefined" ? {} : navigator,
  win: Record<string, unknown> | undefined = typeof window === "undefined" ? undefined : (window as unknown as Record<string, unknown>),
  doc: Pick<Document, "querySelector"> | undefined = typeof document === "undefined" ? undefined : document,
): string {
  if (nav.webdriver === true) return "navegador controlado por automação";
  if (/HeadlessChrome|PhantomJS|Puppeteer|Playwright/i.test(nav.userAgent ?? "")) return "navegador sem tela";
  if (win) {
    if (AUTOMATION_GLOBALS.some((name) => name in win)) return "ferramenta de automação na página";
    // O ChromeDriver deixa variáveis que começam com cdc_ ou $cdc_ no documento.
    const docKeys = doc ? Object.keys(doc as unknown as Record<string, unknown>) : [];
    if (docKeys.some((key) => /^\$?cdc_/.test(key))) return "ChromeDriver";
  }
  try {
    if (doc?.querySelector(AGENT_MARKS)) return "agente de IA marcando a tela";
  } catch { /* seletor não suportado */ }
  return "";
}

export function looksAutomated(nav: AutomationView = typeof navigator === "undefined" ? {} : navigator): boolean {
  return automationSignal(nav, undefined, undefined) !== "";
}

/**
 * Avisa o servidor (alerta por e-mail) quando alguém tenta abrir o código ou copiar a tela.
 * Na 1ª tentativa mostra um aviso amarelo; na 2ª (ou ao detectar um robô) a conta é bloqueada e a pessoa
 * é mandada falar com o Anderson pelo WhatsApp. O bloqueio fica guardado no servidor, não só no navegador.
 */
export function SecurityWatch({ enabled }: { enabled: boolean }) {
  const [state, setState] = useState<Strikes>({ strikes: 0, blocked: false, limit: 2 });
  const [warn, setWarn] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    void fetch("/api/security/status", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((data: Strikes | null) => { if (alive && data) setState(data); }).catch(() => {});
    return () => { alive = false; };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const last: Partial<Record<WatchKind | "automation", number>> = {};
    const report = (kind: WatchKind | "automation", detail = "") => {
      const now = Date.now();
      if (now - (last[kind] ?? 0) < SAME_KIND_MS) return;
      last[kind] = now;
      void fetch("/api/security/report", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, page: window.location.pathname, detail }), keepalive: true })
        .then((r) => (r.ok ? r.json() : null))
        .then((data: (Strikes & { ok?: boolean }) | null) => {
          if (!data || typeof data.strikes !== "number") return;
          setState({ strikes: data.strikes, blocked: Boolean(data.blocked), limit: data.limit ?? 2 });
          if (!data.blocked && data.strikes > 0 && kind !== "contextmenu") setWarn(true);
        })
        .catch(() => {});
    };
    // Confere ao abrir e de tempos em tempos: um agente pode assumir o navegador depois que a tela já carregou.
    const checkAutomation = () => { const signal = automationSignal(); if (signal) report("automation", signal); };
    checkAutomation();
    const automationTimer = window.setInterval(checkAutomation, 5000);
    const onContext = (event: MouseEvent) => { if (!isEditable(event.target)) report("contextmenu"); };
    const onKey = (event: KeyboardEvent) => { const kind = shortcutKind(event); if (kind) report(kind); };
    const onPaste = (event: ClipboardEvent) => {
      const text = event.clipboardData?.getData("text") ?? "";
      if (looksLikeCode(text)) report("paste_code", `${text.length} caracteres`); // nunca envia o conteúdo colado
    };
    const onCopy = () => {
      const size = window.getSelection()?.toString().length ?? 0;
      if (size > 1500) report("copy_large", `${size} caracteres`);
    };
    document.addEventListener("contextmenu", onContext);
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("paste", onPaste, true);
    document.addEventListener("copy", onCopy);
    return () => {
      window.clearInterval(automationTimer);
      document.removeEventListener("contextmenu", onContext);
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("paste", onPaste, true);
      document.removeEventListener("copy", onCopy);
    };
  }, [enabled]);

  if (!enabled) return null;
  if (state.blocked) {
    return (
      <div role="alertdialog" aria-modal="true" aria-labelledby="sec-block-title" data-testid="security-block" className="fixed inset-0 z-[200] grid place-items-center bg-black/85 p-4 backdrop-blur-md">
        <div className="w-full max-w-md space-y-4 rounded-[22px] border border-[#F5B454]/60 bg-[#F5B454]/10 p-6 text-center shadow-[0_0_80px_-20px_#F5B454]">
          <span className="mx-auto grid size-12 place-items-center rounded-full bg-[#F5B454]/20 text-[#F5B454]"><TriangleAlert className="size-6" /></span>
          <h2 id="sec-block-title" className="text-lg font-semibold text-[#F5B454]">Atividade incomum detectada</h2>
          <p className="text-sm text-foreground">Por segurança, o seu acesso foi bloqueado. Entre em contato com o <b>Anderson</b> pelo WhatsApp para entender o que aconteceu e liberar a sua conta.</p>
          <a href={SECURITY_WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center rounded-full bg-[#F5B454] px-6 py-2.5 text-sm font-semibold text-black">Falar com o Anderson · 11 91314-2143</a>
        </div>
      </div>
    );
  }
  if (warn) {
    return (
      <div role="alert" data-testid="security-warn" className="fixed inset-x-0 top-0 z-[150] flex items-center justify-center gap-3 border-b border-[#F5B454]/60 bg-[#F5B454] px-4 py-2 text-sm font-medium text-black">
        <TriangleAlert className="size-4 shrink-0" />
        <span>Atividade incomum detectada. Se isso acontecer de novo, o seu acesso será bloqueado.</span>
        <button type="button" onClick={() => setWarn(false)} className="rounded-full bg-black/15 px-3 py-0.5 text-xs">Entendi</button>
      </div>
    );
  }
  return null;
}
