"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, ChevronUp, X } from "lucide-react";
import { useFlowConnection } from "@/hooks/use-flow-connection";
import { isNewerVersion } from "@/components/app/extension-update-notice";
import { ACCOUNT_AI_EVENT, ACCOUNT_SITES, OPEN_ACCOUNT_AI_EVENT, isAccountSite, readChoice } from "@/lib/account-ai";

const FLOW_URL = "https://labs.google/fx/pt/tools/flow";
type Tone = "ok" | "warn" | "bad" | "idle";
type Row = { id: string; label: string; tone: Tone; text: string; action?: { label: string; href?: string; onClick?: () => void; external?: boolean } };

const DOT: Record<Tone, string> = { ok: "bg-[#5BD69A]", warn: "bg-[#F5B454]", bad: "bg-[#F0466B]", idle: "bg-muted-foreground" };

/** Indicador fixo: mostra, em um só lugar, se a extensão, o Flow e a conta de IA estão prontos, e o que fazer quando não estão. */
export function ConnectionStatus() {
  const { state, account } = useFlowConnection(true, false);
  const [latest, setLatest] = useState("");
  const [choice, setChoice] = useState<string | null>(null);
  const [relayReady, setRelayReady] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch("/extensao/version.json", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { version?: string } | null) => { if (!cancelled && d?.version) setLatest(d.version); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const sync = () => { const c = readChoice(); setChoice(c && isAccountSite(c.site) ? c.site : null); };
    sync();
    window.addEventListener(ACCOUNT_AI_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => { window.removeEventListener(ACCOUNT_AI_EVENT, sync); window.removeEventListener("storage", sync); };
  }, []);

  useEffect(() => {
    if (!choice) { setRelayReady(null); return; }
    let cancelled = false;
    const check = () => fetch("/api/multiplier/ai-relay/status", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled) setRelayReady(d ? Boolean(d.ready) : null); })
      .catch(() => undefined);
    void check();
    const timer = window.setInterval(check, 20000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [choice]);

  const rows: Row[] = [];
  // 1) Extensão
  if (state === "unknown") rows.push({ id: "ext", label: "Extensão", tone: "idle", text: "Verificando…" });
  else if (state === "no-extension") rows.push({ id: "ext", label: "Extensão", tone: "bad", text: "Não encontrei a extensão neste Chrome.", action: { label: "Instalar a extensão", href: "/conectar-flow" } });
  else if (latest && isNewerVersion(latest, account.version || "0")) rows.push({ id: "ext", label: "Extensão", tone: "warn", text: `Desatualizada (${account.version || "versão antiga"}). A nova é a ${latest}.`, action: { label: "Atualizar a extensão", href: "/conectar-flow" } });
  else rows.push({ id: "ext", label: "Extensão", tone: "ok", text: `Instalada${account.version ? ` (${account.version})` : ""}.` });
  // 2) Flow
  if (state === "unknown") rows.push({ id: "flow", label: "Flow", tone: "idle", text: "Verificando…" });
  else if (state === "no-extension") rows.push({ id: "flow", label: "Flow", tone: "idle", text: "Precisa da extensão primeiro." });
  else if (state === "logged-out") rows.push({ id: "flow", label: "Flow", tone: "warn", text: "Flow aberto, mas sem login.", action: { label: "Abrir o Flow e entrar", href: FLOW_URL, external: true } });
  else rows.push({ id: "flow", label: "Flow", tone: "ok", text: `Conta conectada${account.plan ? ` (${account.plan})` : ""}.` });
  // 3) Conta de IA
  const siteName = choice && isAccountSite(choice) ? ACCOUNT_SITES[choice].label : "";
  if (!choice) rows.push({ id: "ai", label: "IA", tone: "idle", text: "Usando os créditos do plano.", action: { label: "Conectar minha conta de IA", onClick: () => window.dispatchEvent(new Event(OPEN_ACCOUNT_AI_EVENT)) } });
  else if (relayReady === null) rows.push({ id: "ai", label: "IA", tone: "idle", text: `Conta do ${siteName}: verificando…` });
  else if (relayReady) rows.push({ id: "ai", label: "IA", tone: "ok", text: `Gerando pela sua conta do ${siteName}.` });
  else rows.push({ id: "ai", label: "IA", tone: "warn", text: `Conta do ${siteName} ainda não respondeu. Deixe o ClipGringa aberto e entre no ${siteName}.`, action: { label: "Verificar minha conta", href: "/minhas-apis" } });

  const worst: Tone = rows.some((r) => r.tone === "bad") ? "bad" : rows.some((r) => r.tone === "warn") ? "warn" : rows.every((r) => r.tone === "ok") ? "ok" : "idle";
  const headline = worst === "ok" ? "Tudo conectado" : worst === "bad" ? "Falta conectar" : worst === "warn" ? "Precisa de atenção" : "Verificando…";

  return (
    <div data-testid="connection-status" className="fixed bottom-20 right-3 z-40 flex flex-col items-end md:bottom-4 md:right-4">
      {open && (
        <div role="dialog" aria-label="Conexões do ClipGringa" className="mb-2 w-[min(92vw,22rem)] space-y-2 rounded-[18px] border border-border bg-card p-3 text-sm shadow-xl">
          <div className="flex items-center justify-between">
            <p className="font-semibold">Conexões</p>
            <button type="button" onClick={() => setOpen(false)} aria-label="Fechar" className="rounded-full p-1 text-muted-foreground hover:bg-accent"><X className="size-4" /></button>
          </div>
          <ul className="space-y-2">
            {rows.map((row) => (
              <li key={row.id} className="rounded-[12px] border border-border bg-background/40 p-2.5">
                <p className="flex items-center gap-2 font-medium"><span className={`size-2.5 rounded-full ${DOT[row.tone]}`} />{row.label}{row.tone === "ok" && <Check className="size-3.5 text-[#5BD69A]" />}</p>
                <p className="mt-1 text-xs text-muted-foreground">{row.text}</p>
                {row.action && (row.action.href
                  ? <Link href={row.action.href} {...(row.action.external ? { target: "_blank", rel: "noreferrer" } : {})} className="mt-2 inline-block rounded-full bg-gradient-to-br from-[#8B5CF6] to-[#7B3FE4] px-3 py-1.5 text-xs font-medium text-white">{row.action.label}</Link>
                  : <button type="button" onClick={row.action.onClick} className="mt-2 rounded-full bg-gradient-to-br from-[#8B5CF6] to-[#7B3FE4] px-3 py-1.5 text-xs font-medium text-white">{row.action.label}</button>)}
              </li>
            ))}
          </ul>
        </div>
      )}
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label={`Conexões: ${headline}`} className="flex items-center gap-2 rounded-full border border-border bg-card/95 px-3 py-2 text-xs font-medium shadow-lg backdrop-blur">
        <span className="flex items-center gap-1">{rows.map((row) => <span key={row.id} className={`size-2 rounded-full ${DOT[row.tone]}`} />)}</span>
        {headline}<ChevronUp className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
    </div>
  );
}
