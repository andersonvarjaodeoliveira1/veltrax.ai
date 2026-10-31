"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ExternalLink, Loader2, Zap } from "lucide-react";
import { useFlowConnection } from "@/hooks/use-flow-connection";
import { ACCOUNT_SITES, probeSite, writeChoice, readChoice, type SiteState } from "@/lib/account-ai";

const FLOW_URL = "https://labs.google/fx/pt/tools/flow";

/** Um botão só: abre o Flow e o Gemini (mesma conta Google), escolhe o Gemini como IA grátis e mostra quando cada parte conectou. */
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

  const flowOk = state === "connected";
  const geminiOk = gemini === "ready";
  const extOk = state !== "no-extension" && state !== "unknown";

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

  const announced = useRef(false);
  useEffect(() => {
    if (!(flowOk && geminiOk && started) || announced.current) return;
    announced.current = true;
    const timer = window.setTimeout(() => {
      for (const tab of opened.current) { try { tab.close(); } catch { /* já fechada */ } }
      opened.current = [];
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [flowOk, geminiOk, started]);

  const rows = [
    { id: "ext", label: "Extensão", ok: extOk, wait: state === "unknown", text: extOk ? "Instalada" : "Não encontrei no Chrome. Baixe, extraia e carregue (passo 2 abaixo)" },
    { id: "flow", label: "Flow", ok: flowOk, wait: false, text: flowOk ? `Conta conectada${account.plan ? ` · plano ${account.plan}` : ""}${account.credits !== null ? ` · ${account.credits} créditos` : ""}` : "Entre com sua conta Google" },
    { id: "gem", label: "IA grátis (Gemini)", ok: geminiOk, wait: gemini === "checking" && extOk, text: geminiOk ? "Pronta, sem custo" : gemini === "login" || gemini === "guest" ? "Entre na mesma conta Google" : "Abra o Gemini e entre" },
  ];
  const all = rows.every((r) => r.ok);

  return (
    <section data-testid="connect-all" className="space-y-3 rounded-[18px] border border-[#7B3FE4]/40 bg-gradient-to-br from-[#7B3FE4]/15 to-transparent p-5">
      <p className="flex items-center gap-2 font-medium"><Zap className="size-4 text-[#A98BFF]" /> Conectar tudo de uma vez</p>
      <p className="text-xs text-muted-foreground">Abrimos o Flow e o Gemini juntos. Entre com a <b>mesma conta Google</b> nas duas abas e volte aqui: o resto é automático e sem custo.</p>
      <ul className="space-y-1.5">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center gap-2 text-sm">
            <span className="grid size-5 place-items-center rounded-full bg-muted">{r.ok ? <Check className="size-3.5 text-[#5BD69A]" /> : r.wait ? <Loader2 className="size-3.5 animate-spin" /> : <span className="size-2 rounded-full bg-[#F5B454]" />}</span>
            <span className="font-medium">{r.label}</span><span className="text-xs text-muted-foreground">{r.text}</span>
          </li>
        ))}
      </ul>
      {!extOk && state !== "unknown" && <a href="/extensao/clipgringa-flow.zip" download className="inline-block rounded-full border border-border px-3 py-1.5 text-xs hover:text-foreground">Baixar a extensão (1.21.1)</a>}
      {all
        ? <p role="status" className="rounded-[12px] border border-[#5BD69A]/40 bg-[#5BD69A]/10 p-2.5 text-sm text-[#5BD69A]">Já conectado ✓ Pode criar seus vídeos{opened.current.length ? ". Vamos fechar as abas do Flow e do Gemini." : "."}</p>
        : <button type="button" onClick={start} className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[#8B5CF6] to-[#7B3FE4] px-4 py-2 text-sm font-medium text-white"><ExternalLink className="size-4" />{started ? "Abrir de novo Flow e Gemini" : "Conectar Flow e Gemini"}</button>}
    </section>
  );
}
