"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Activity, AlertTriangle, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";

type Totals = Record<string, { last_24h: number; period: number }>;
type Row = { id: string; email: string | null; name: string | null; images: number; scenes: number; errors: number; last_at: string | null };
type Err = { id: number; kind: string; detail: string | null; email: string | null; at: string | null };
type Data = { days: number; totals: Totals; users: Row[]; errors: Err[] };

const when = (value: string | null) => (value ? new Date(value).toLocaleString("pt-BR") : "—");
const th = "px-4 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground";
const td = "px-4 py-2.5 text-sm tabular-nums";
const KIND: Record<string, string> = { erro: "Erro", ia_conta_falhou: "Conta de IA falhou" };

export default function AdminActivityPage() {
  const [days, setDays] = useState(7);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const response = await fetch(`/api/admin/activity?days=${days}`, { cache: "no-store" });
        if (response.status === 403) { if (alive) setError("Destrave o Admin (senha da conta) e volte aqui."); return; }
        if (!response.ok) throw new Error();
        if (alive) { setData(await response.json()); setError(null); }
      } catch {
        if (alive) setError("Não foi possível carregar a atividade agora. Atualize a página.");
      }
    })();
    return () => { alive = false; };
  }, [days]);

  const t = data?.totals ?? {};
  const n = (kind: string, key: "last_24h" | "period") => t[kind]?.[key] ?? 0;
  const errors24 = n("erro", "last_24h") + n("ia_conta_falhou", "last_24h");

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6">
      <PageHeader icon={Activity} title="Atividade" description="O que cada conta está gerando e onde deu erro." />
      <Link href="/admin" className="text-sm underline underline-offset-4">Voltar ao Admin</Link>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      {!data && !error ? <Loader2 className="size-5 animate-spin" aria-label="Carregando" /> : null}
      {data ? (
        <>
          {errors24 > 0 ? (
            <div role="alert" className="flex items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">
              <AlertTriangle className="size-4" /> {errors24} {errors24 === 1 ? "erro" : "erros"} nas últimas 24 horas. Veja a lista abaixo.
            </div>
          ) : null}
          <div className="flex gap-2 text-sm">
            {[1, 7, 30].map((d) => (
              <button key={d} type="button" onClick={() => setDays(d)} className={`rounded-full border px-3 py-1 ${days === d ? "bg-primary text-primary-foreground" : ""}`}>
                {d === 1 ? "24 horas" : `${d} dias`}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[["Imagens", n("imagem", "period")], ["Cenas", n("cena", "period")], ["Contas ativas", data.users.length], ["Erros", n("erro", "period") + n("ia_conta_falhou", "period")]].map(([label, value]) => (
              <div key={String(label)} className="rounded-2xl border p-4">
                <div className="text-xs text-muted-foreground">{label}</div>
                <div className="text-2xl font-semibold tabular-nums">{value}</div>
              </div>
            ))}
          </div>
          <div className="overflow-x-auto rounded-2xl border">
            <table className="w-full">
              <thead><tr><th className={th}>Conta</th><th className={th}>Imagens</th><th className={th}>Cenas</th><th className={th}>Erros</th><th className={th}>Última vez</th></tr></thead>
              <tbody>
                {data.users.length === 0 ? <tr><td className={td} colSpan={5}>Ninguém gerou nada nesse período.</td></tr> : null}
                {data.users.map((u) => (
                  <tr key={u.id} className="border-t">
                    <td className={td}>{u.email ?? u.name ?? u.id}</td>
                    <td className={td}>{u.images}</td>
                    <td className={td}>{u.scenes}</td>
                    <td className={td}>{u.errors}</td>
                    <td className={td}>{when(u.last_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="rounded-2xl border">
            <div className="px-4 py-3 text-sm font-medium">Erros recentes</div>
            {data.errors.length === 0 ? <p className="px-4 pb-4 text-sm text-muted-foreground">Nenhum erro nesse período.</p> : (
              <ul className="divide-y">
                {data.errors.map((e) => (
                  <li key={e.id} className="px-4 py-2.5 text-sm">
                    <div className="font-medium">{KIND[e.kind] ?? e.kind} · {e.email ?? "sem conta"}</div>
                    <div className="text-muted-foreground">{e.detail ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{when(e.at)}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
