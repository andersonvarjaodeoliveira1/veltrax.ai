"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { brDateTime, fb, type CommentsData } from "@/lib/facebook";
import { cn } from "@/lib/utils";
import { card } from "./ui";

/** Comentários: quem comentou, em qual página e perfil, e de qual produto (pela palavra-chave da oferta). */
export function CommentsPanel() {
  const [data, setData] = useState<CommentsData | null>(null);
  const [product, setProduct] = useState<string | null>(null);
  const [onlyLeads, setOnlyLeads] = useState(false);
  useEffect(() => { fb.comments().then(setData).catch((problem) => { toast.error((problem as Error).message); setData({ total: 0, products: [], comments: [] }); }); }, []);
  if (!data) return <p className="text-sm text-white/60">Carregando…</p>;
  if (!data.total) {
    return (
      <p className="rounded-[16px] border border-dashed border-white/15 p-4 text-sm text-white/70">
        Nenhum comentário lido ainda. Eles chegam sozinhos das páginas conectadas pelo Entrar com o Facebook. Para saber de qual produto é cada um, cadastre a palavra-chave em <Link className="underline" href="/ofertas">Ofertas</Link>.
      </p>
    );
  }
  const leads = data.comments.filter((c) => c.keyword).length;
  const shown = data.comments.filter((c) => (product ? c.product === product : true) && (onlyLeads ? Boolean(c.keyword) : true));
  const chip = (active: boolean) => cn("rounded-[8px] border px-3 py-1.5 text-xs", active ? "border-white/30 bg-white/10 text-white" : "border-white/10 text-white/60 hover:text-white");
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-[12px] bg-white/[0.04] px-3 py-3"><p className="text-2xl font-medium tabular-nums text-white">{data.total}</p><p className="text-xs text-white/70">Comentários</p></div>
        <div className="rounded-[12px] bg-white/[0.04] px-3 py-3"><p className="text-2xl font-medium tabular-nums text-white">{leads}</p><p className="text-xs text-white/70">Com palavra-chave</p></div>
        {data.products.slice(0, 2).map((p) => (
          <button key={p.product + p.keyword} type="button" className="rounded-[12px] bg-white/[0.04] px-3 py-3 text-left" onClick={() => setProduct(product === p.product ? null : p.product)}>
            <p className="text-2xl font-medium tabular-nums text-white">{p.total}</p><p className="truncate text-xs text-white/70">{p.product || p.keyword}</p><p className="text-xs text-white/50">{p.people} {p.people === 1 ? "pessoa" : "pessoas"}, palavra {p.keyword}</p>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar comentários">
        <button type="button" className={chip(!product && !onlyLeads)} onClick={() => { setProduct(null); setOnlyLeads(false); }}>Todos</button>
        <button type="button" className={chip(onlyLeads)} aria-pressed={onlyLeads} onClick={() => setOnlyLeads((v) => !v)}>Só com palavra-chave</button>
        {data.products.map((p) => <button key={p.product + p.keyword} type="button" className={chip(product === p.product)} aria-pressed={product === p.product} onClick={() => setProduct(product === p.product ? null : p.product)}>{p.product || p.keyword} <span className="text-white/50">{p.total}</span></button>)}
      </div>
      <section className={cn(card, "overflow-x-auto")}>
        <table className="w-full min-w-[640px] text-sm">
          <thead><tr className="text-left text-xs text-white/50">
            <th className="py-1.5 font-normal">Quem</th><th className="py-1.5 font-normal">Comentário</th><th className="py-1.5 font-normal">Produto</th><th className="py-1.5 font-normal">Página</th><th className="py-1.5 font-normal">Perfil</th><th className="py-1.5 font-normal">Quando</th>
          </tr></thead>
          <tbody>
            {shown.map((c) => (
              <tr key={c.id} className="border-t border-white/10 align-top">
                <td className="py-2 pr-3 text-white">{c.from_name || "Sem nome"}</td>
                <td className="max-w-[240px] py-2 pr-3 text-white/70"><span className="line-clamp-2">{c.message}</span></td>
                <td className="py-2 pr-3 text-white">{c.keyword ? (c.product || c.keyword) : <span className="text-white/40">Sem palavra-chave</span>}</td>
                <td className="py-2 pr-3 text-white/70">{c.page_name}</td>
                <td className="py-2 pr-3 text-white/70">{c.account_name ?? "Sem perfil"}</td>
                <td className="py-2 text-xs text-white/60">{c.commented_at ? brDateTime(c.commented_at) : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {shown.length === 0 ? <p className="py-3 text-sm text-white/60">Nenhum comentário nesse filtro.</p> : null}
      </section>
    </div>
  );
}
