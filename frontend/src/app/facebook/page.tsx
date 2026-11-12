"use client";

import { Megaphone } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/app/page-header";
import { AccountsPanel } from "@/components/facebook/accounts-panel";
import { CommentsPanel } from "@/components/facebook/comments-panel";
import { PagesPanel } from "@/components/facebook/pages-panel";
import { SummaryPanel } from "@/components/facebook/summary-panel";
import { fb, type FbAccount, type FbPage } from "@/lib/facebook";
import { cn } from "@/lib/utils";

type Tab = "resumo" | "paginas" | "contas" | "comentarios";

export default function FacebookPage() {
  const [tab, setTab] = useState<Tab>("resumo");
  const [data, setData] = useState<{ accounts: FbAccount[]; pages: FbPage[] } | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try { setData(await fb.overview()); setError(""); } catch (problem) { setError((problem as Error).message); }
  }, []);
  useEffect(() => {
    const aba = new URLSearchParams(window.location.search).get("aba");
    if (aba === "contas" || aba === "paginas" || aba === "resumo" || aba === "comentarios") setTab(aba);
    void load();
  }, [load]);

  const tabs: Array<[Tab, string, number | undefined]> = [
    ["resumo", "Resumo", undefined],
    ["paginas", "Páginas", data?.pages.length],
    ["contas", "Perfis", data?.accounts.length],
    ["comentarios", "Comentários", undefined],
  ];

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-4 sm:p-8">
      <PageHeader
        icon={Megaphone}
        title="Facebook"
        description="Perfis, páginas, posts e comentários, tudo num lugar só."
        action={<span className="rounded-full border border-amber-400/40 px-3 py-1 text-xs font-semibold text-amber-300">Em construção</span>}
      />
      <div role="tablist" aria-label="Facebook" className="flex w-fit max-w-full gap-1 overflow-x-auto rounded-full border border-white/10 bg-black/30 p-1">
        {tabs.map(([key, label, count]) => (
          <button key={key} role="tab" type="button" aria-selected={tab === key} onClick={() => setTab(key)}
            className={cn("shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors", tab === key ? "bg-white/10 text-white" : "text-white/60 hover:text-white")}>
            {label}{count !== undefined ? <span className="ml-1.5 text-white/50">{count}</span> : null}
          </button>
        ))}
      </div>
      {error ? <p role="alert" className="text-sm text-[#F0466B]">{error}</p> : null}
      {!data ? <p className="text-sm text-white/60">Carregando…</p>
        : tab === "resumo" ? <SummaryPanel accounts={data.accounts} pages={data.pages} onOpen={setTab} />
        : tab === "comentarios" ? <CommentsPanel />
        : tab === "contas" ? <AccountsPanel accounts={data.accounts} onChange={load} />
        : <PagesPanel pages={data.pages} accounts={data.accounts} onChange={load} />}
    </div>
  );
}
