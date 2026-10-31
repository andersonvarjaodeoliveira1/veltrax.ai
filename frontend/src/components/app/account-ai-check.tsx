"use client";

import { useRef, useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import { accountReasonText } from "@/lib/ai-errors";
import { ACCOUNT_SITES, askAccount, extensionHasAi, probeSite, type AccountSite, type SiteState } from "@/lib/account-ai";

type Row = { id: string; label: string; state: "wait" | "run" | "ok" | "fail"; hint?: string };

const SITE_HINT: Partial<Record<SiteState, string>> = {
  notab: "Não achei uma aba aberta. Abra o site, entre na conta e deixe a aba aberta.",
  login: "O site está aberto, mas você não entrou na conta.",
  guest: "Você está sem login. Entre na sua conta.",
  loading: "A página ainda estava carregando. Espere e tente de novo.",
  blocked: "O site pediu uma verificação (captcha). Resolva na aba dele.",
  nopage: "A extensão não conseguiu falar com o site. Recarregue a aba do site e esta página.",
};

const BASE = (name: string): Row[] => [
  { id: "ext", label: "Extensão do ClipGringa instalada e atualizada", state: "wait" },
  { id: "tab", label: `${name} aberto e logado neste Chrome`, state: "wait" },
  { id: "relay", label: "ClipGringa respondendo pelo relay", state: "wait" },
  { id: "test", label: `Teste real: pedir uma resposta ao ${name}`, state: "wait" },
];

/** Passo a passo que mostra onde a geração pela conta da pessoa trava (extensão, login, relay, resposta). */
export function AccountAiCheck({ site }: { site: AccountSite }) {
  const name = ACCOUNT_SITES[site].label;
  const [rows, setRows] = useState<Row[]>(() => BASE(name));
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState("");
  const busy = useRef(false);

  async function run() {
    if (busy.current) return;
    busy.current = true; setRunning(true); setReport("");
    const log: string[] = [];
    const set = (id: string, state: Row["state"], hint?: string) => {
      setRows((current) => current.map((row) => (row.id === id ? { ...row, state, hint } : row)));
      log.push(`${id}: ${state}${hint ? ` - ${hint}` : ""}`);
    };
    setRows(BASE(name));
    try {
      set("ext", "run");
      const hello = await extensionHasAi();
      if (!hello) { set("ext", "fail", "Não detectei a extensão. Instale ou atualize em Conectar Flow (versão 1.21.1) e recarregue esta página."); return; }
      set("ext", "ok", `Versão ${hello.version || "?"}`);

      set("tab", "run");
      const state = await probeSite(site, false);
      if (state !== "ready") { set("tab", "fail", SITE_HINT[state] ?? "Não consegui ver o site."); return; }
      set("tab", "ok");

      set("relay", "run");
      let ready = false;
      try {
        const response = await fetch("/api/multiplier/ai-relay/status", { cache: "no-store" });
        ready = response.ok && Boolean((await response.json()).ready);
      } catch { ready = false; }
      if (!ready) { set("relay", "fail", "O servidor ainda não vê a sua conta ligada. Deixe esta aba do ClipGringa aberta por uns 30 segundos e tente de novo."); return; }
      set("relay", "ok");

      set("test", "run");
      const result = await askAccount(site, "Responda apenas com a palavra OK.", 70_000);
      if (result.ok && (result.text ?? "").trim()) { set("test", "ok", "Respondeu. Pode gerar pela sua conta."); return; }
      const reason = (result.error ?? "failed").split(":")[0];
      set("test", "fail", accountReasonText(site, reason));
      log.push(`erro bruto: ${result.error ?? "sem detalhe"}`);
    } finally {
      setReport(`Checagem da conta ${name} (${new Date().toLocaleString("pt-BR")})\n${log.join("\n")}`);
      busy.current = false; setRunning(false);
    }
  }

  return (
    <div data-testid="account-ai-check" className="w-full space-y-2 rounded-[14px] border border-border bg-background/40 p-3 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => void run()} disabled={running} className="rounded-full border border-[#7B3FE4]/60 px-4 py-2 text-xs font-medium text-[#A98BFF] disabled:opacity-60">
          {running ? "Verificando…" : `Verificar minha conta do ${name}`}
        </button>
        <span className="text-muted-foreground">Mostra o que falta para gerar pela sua conta, sem usar chave nem créditos.</span>
      </div>
      {rows.some((row) => row.state !== "wait") && (
        <ul className="space-y-1.5">
          {rows.map((row) => (
            <li key={row.id} className="flex items-start gap-2">
              <span className="mt-0.5">
                {row.state === "run" ? <Loader2 className="size-3.5 animate-spin" /> : row.state === "ok" ? <Check className="size-3.5 text-[#5BD69A]" /> : row.state === "fail" ? <X className="size-3.5 text-[#F0466B]" /> : <span className="block size-3.5 rounded-full border border-border" />}
              </span>
              <span><b className="font-medium">{row.label}</b>{row.hint && <span className="block text-muted-foreground">{row.hint}</span>}</span>
            </li>
          ))}
        </ul>
      )}
      {report && rows.some((row) => row.state === "fail") && (
        <button type="button" onClick={() => { void navigator.clipboard?.writeText(report).catch(() => undefined); }} className="rounded-full border border-border px-3 py-1.5 text-[11px]">Copiar relatório para o suporte</button>
      )}
    </div>
  );
}
