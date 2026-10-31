"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Download, ExternalLink, Loader2, Zap } from "lucide-react";
import { useFlowConnection } from "@/hooks/use-flow-connection";
import { ACCOUNT_SITES, probeSite, writeChoice, readChoice, type SiteState } from "@/lib/account-ai";
import { isNewerVersion } from "@/components/app/extension-update-notice";
import { cn } from "@/lib/utils";

const FLOW_URL = "https://labs.google/fx/pt/tools/flow";
const EXT_VERSION = "1.21.1";

/** O passo a passo único: extensão, Flow e Gemini (mesma conta Google). Cada passo anima quando conclui e a barra mostra o avanço. */
export function ConnectAll() {
  const { state, account } = useFlowConnection(true, false);
  const [gemini, setGemini] = useState<SiteState | "checking">("checking");
  const [started, setStarted] = useState(false);

  const check = useCallback(async () => {
    if (state === "no-extension" || state === "unknown") { setGemini("checking"); return; }
    setGemini(await probeSite("gemini", false));
  }, [state]);

  useEffect(() => {
    void check();
    const timer = window.setInterval(() => { void check(); }, started ? 4000 : 12000);
    return () => window.clearInterval(timer);
  }, [check, started]);

  // Com o Flow conectado, o Gemini (mesma conta Google) é conferido sozinho, uma vez, numa aba própria que a extensão abre e fecha.
  const autoProbed = useRef(false);
  useEffect(() => {
    if (state !== "connected" || gemini === "ready" || autoProbed.current) return;
    autoProbed.current = true;
    void probeSite("gemini", true).then((result) => setGemini(result));
  }, [state, gemini]);

  // Extensão recém-instalada só aparece depois de recarregar a página: ao voltar para esta aba, recarrega sozinho (no máximo a cada 20 s).
  const [downloaded, setDownloaded] = useState(false);
  useEffect(() => {
    if (state !== "no-extension" || !downloaded) return;
    const onBack = () => {
      if (document.visibilityState !== "visible") return;
      try {
        const last = Number(window.sessionStorage.getItem("gv-connect-reload") || 0);
        if (Date.now() - last < 20_000) return;
        window.sessionStorage.setItem("gv-connect-reload", String(Date.now()));
      } catch { /* sem storage: recarrega mesmo assim */ }
      window.location.reload();
    };
    document.addEventListener("visibilitychange", onBack);
    window.addEventListener("focus", onBack);
    return () => { document.removeEventListener("visibilitychange", onBack); window.removeEventListener("focus", onBack); };
  }, [state, downloaded]);

  const extOk = state !== "no-extension" && state !== "unknown";
  const outdated = extOk && Boolean(account.version) && isNewerVersion(EXT_VERSION, account.version || "0");
  const flowOk = state === "connected";
  const geminiOk = gemini === "ready";

  useEffect(() => {
    if (geminiOk) { const c = readChoice(); if (!c || c.site === "none") writeChoice("gemini"); }
  }, [geminiOk]);

  // As abas abertas por este botão: fechamos só elas quando tudo conecta (nunca as que a pessoa abriu sozinha).
  const opened = useRef<Window[]>([]);
  const openTab = (url: string) => {
    const tab = window.open("about:blank", "_blank");
    if (!tab) return;
    try { tab.opener = null; } catch { /* sem acesso */ }
    tab.location.href = url;
    opened.current.push(tab);
  };
  const start = () => {
    setStarted(true);
    writeChoice("gemini");
    opened.current = [];
    openTab(FLOW_URL);
    openTab(ACCOUNT_SITES.gemini.url);
  };

  const all = extOk && flowOk && geminiOk;
  const announced = useRef(false);
  useEffect(() => {
    if (!(all && started) || announced.current) return;
    announced.current = true;
    const timer = window.setTimeout(() => {
      for (const tab of opened.current) { try { tab.close(); } catch { /* já fechada */ } }
      opened.current = [];
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [all, started]);

  const steps = [
    { id: "ext", label: "Instalar a extensão", ok: extOk, wait: state === "unknown", text: extOk ? (outdated ? `Instalada (${account.version}), mas a nova é a ${EXT_VERSION}. Baixe de novo abaixo.` : `Instalada${account.version ? ` (${account.version})` : ""}`) : "Ainda não encontrei no Chrome." },
    { id: "flow", label: "Entrar no Flow", ok: flowOk, wait: extOk && started && !flowOk, text: flowOk ? `Conta conectada${account.plan ? ` · plano ${account.plan}` : ""}${account.credits !== null ? ` · ${account.credits} créditos` : ""}` : extOk ? "Entre com a sua conta Google na aba do Flow." : "Depende da extensão." },
    { id: "gem", label: "IA grátis (Gemini)", ok: geminiOk, wait: extOk && started && !geminiOk, text: geminiOk ? "Pronta, sem custo." : !extOk ? "Depende da extensão." : gemini === "login" || gemini === "guest" ? "Entre na mesma conta Google." : "Abra o Gemini e entre." },
  ];
  const doneCount = steps.filter((s) => s.ok).length;
  const current = steps.findIndex((s) => !s.ok);

  return (
    <section data-testid="connect-all" aria-live="polite" className="space-y-4 rounded-[18px] border border-[#7B3FE4]/40 bg-gradient-to-br from-[#7B3FE4]/15 to-transparent p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-medium"><Zap className="size-4 text-[#A98BFF]" /> Conectar tudo de uma vez</p>
        <span className="text-xs tabular-nums text-muted-foreground">{doneCount} de {steps.length}</span>
      </div>
      <div role="progressbar" aria-label="Conexões prontas" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={doneCount} className="h-1.5 overflow-hidden rounded-full bg-border">
        <div className="h-full rounded-full bg-gradient-to-r from-[#8B5CF6] to-[#5BD69A] transition-[width] duration-700" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
      </div>
      <ol className="space-y-2">
        {steps.map((step, index) => (
          <li key={step.id} data-testid={`connect-step-${step.id}`} data-state={step.ok ? "done" : index === current ? "active" : "todo"}
            className={cn("flex items-start gap-3 rounded-[14px] border p-3 transition-colors", step.ok ? "border-[#5BD69A]/40 bg-[#5BD69A]/10" : index === current ? "border-[#7B3FE4]/60 bg-[#7B3FE4]/10" : "border-border")}>
            <span className={cn("mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-xs", step.ok ? "bg-[#5BD69A]/25" : "bg-muted")}>
              {step.ok ? <Check className="gt-pop size-3.5 text-[#5BD69A]" /> : step.wait || (index === current && state === "unknown") ? <Loader2 className="size-3.5 animate-spin text-[#A98BFF]" /> : index + 1}
            </span>
            <span className="min-w-0"><span className="block text-sm font-medium">{step.label}</span><span className="block text-xs text-muted-foreground">{step.text}</span></span>
          </li>
        ))}
      </ol>

      {(!extOk || outdated) && state !== "unknown" && (
        <div data-testid="step-extension" className="space-y-2 rounded-[14px] border border-border bg-background/40 p-3">
          <a href="/extensao/clipgringa-flow.zip" download onClick={() => setDownloaded(true)} className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm hover:text-foreground"><Download className="size-4" /> Baixar a extensão ({EXT_VERSION})</a>
          <ol className="list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
            <li>Clique com o botão direito no arquivo baixado e escolha “Extrair tudo”.</li>
            <li>No Chrome, abra <span className="font-mono">chrome://extensions</span> e ligue o “Modo do desenvolvedor”.</li>
            <li>Clique em “Carregar sem compactação” e escolha a pasta extraída (a que tem o <span className="font-mono">manifest.json</span>). Depois volte para esta aba: ela atualiza sozinha.</li>
          </ol>
        </div>
      )}

      {all
        ? <p role="status" className="gt-pop rounded-[12px] border border-[#5BD69A]/40 bg-[#5BD69A]/10 p-2.5 text-sm text-[#5BD69A]">Já conectado ✓ Pode criar seus vídeos{opened.current.length ? ". Vamos fechar as abas do Flow e do Gemini." : "."}</p>
        : extOk && <button type="button" onClick={start} className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[#8B5CF6] to-[#7B3FE4] px-4 py-2 text-sm font-medium text-white"><ExternalLink className="size-4" />{started ? "Abrir de novo Flow e Gemini" : "Abrir Flow e Gemini"}</button>}
      {!all && extOk && <p className="text-xs text-muted-foreground">Entre com a <b>mesma conta Google</b> nas duas abas e volte aqui: o resto é automático e sem custo.</p>}
    </section>
  );
}
