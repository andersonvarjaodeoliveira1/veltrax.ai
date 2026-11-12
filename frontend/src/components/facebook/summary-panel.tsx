"use client";

import { useEffect, useState } from "react";
import { fb, pageNumbers, PROTECTION_TEXT, type CalendarPost, type FbAccount, type FbPage } from "@/lib/facebook";
import { cn } from "@/lib/utils";
import { card } from "./ui";

const sum = (list: number[]) => list.reduce((a, b) => a + b, 0);
const WEEKDAY = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

function Kpi({ value, label, hint }: { value: number; label: string; hint?: string }) {
  return (
    <div className="rounded-[12px] bg-white/[0.04] px-3 py-3">
      <p className="text-2xl font-medium tabular-nums text-white">{value}</p>
      <p className="text-xs text-white/70">{label}</p>
      {hint ? <p className="mt-0.5 text-xs text-white/50">{hint}</p> : null}
    </div>
  );
}

/** Resumo: quantos perfis, páginas por perfil, posts normais e vídeos do ClipGringa, e a semana. */
export function SummaryPanel({ accounts, pages, onOpen }: { accounts: FbAccount[]; pages: FbPage[]; onOpen: (tab: "paginas" | "contas") => void }) {
  const [week, setWeek] = useState<{ start: string; posts: CalendarPost[] } | null>(null);
  useEffect(() => { fb.calendar(7).then(setWeek).catch(() => setWeek({ start: "", posts: [] })); }, []);

  const numbers = pages.map((p) => ({ p, n: pageNumbers(p) }));
  const groups: Array<{ key: string; name: string; hint: string; rows: typeof numbers }> = [
    ...accounts.map((a) => ({ key: a.id, name: a.name, hint: PROTECTION_TEXT[a.protection], rows: numbers.filter((x) => x.p.account_id === a.id) })),
    { key: "sem", name: "Sem perfil", hint: "Páginas ainda sem perfil ligado", rows: numbers.filter((x) => !x.p.account_id || !accounts.some((a) => a.id === x.p.account_id)) },
  ].filter((g) => g.key !== "sem" || g.rows.length);
  const total = (pick: (x: (typeof numbers)[number]) => number, rows = numbers) => sum(rows.map(pick));

  if (!accounts.length && !pages.length) {
    return <p className="rounded-[16px] border border-dashed border-white/15 p-4 text-sm text-white/70">Nada mapeado ainda. Na aba Páginas, clique em Entrar com o Facebook e tudo aparece aqui.</p>;
  }

  const days = week?.start ? Array.from({ length: 7 }, (_, i) => { const d = new Date(`${week.start}T12:00:00`); d.setDate(d.getDate() + i); return d; }) : [];
  const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const postDay = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(iso));
  const postTime = (iso: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <button type="button" className="text-left" onClick={() => onOpen("contas")}><Kpi value={accounts.length} label={accounts.length === 1 ? "Perfil" : "Perfis"} /></button>
        <button type="button" className="text-left" onClick={() => onOpen("paginas")}><Kpi value={pages.length} label={pages.length === 1 ? "Página" : "Páginas"} hint={`${pages.filter((p) => p.meta_connected).length} conectadas`} /></button>
        <Kpi value={total((x) => x.n.normal)} label="Posts normais" hint="Texto e imagem" />
        <Kpi value={total((x) => x.n.cta + x.n.cuts)} label="Vídeos do ClipGringa" hint={`${total((x) => x.n.cta)} com CTA, ${total((x) => x.n.cuts)} cortes`} />
      </div>

      <section className={cn(card, "space-y-3 overflow-x-auto")} aria-label="Por perfil">
        <p className="text-sm font-medium text-white">Por perfil</p>
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="text-left text-xs font-normal text-white/50">
              <th className="py-1.5 font-normal">Perfil e páginas</th>
              <th className="py-1.5 text-right font-normal">Posts normais</th>
              <th className="py-1.5 text-right font-normal">Vídeos com CTA</th>
              <th className="py-1.5 text-right font-normal">Cortes</th>
              <th className="py-1.5 text-right font-normal">Agendados</th>
              <th className="py-1.5 text-right font-normal">Seguidores</th>
            </tr>
          </thead>
          {groups.map((g) => (
            <tbody key={g.key} className="border-t border-white/10">
              <tr className="text-white">
                <td className="py-2"><span className="font-medium">{g.name}</span> <span className="text-xs text-white/50">{g.rows.length} {g.rows.length === 1 ? "página" : "páginas"}, {g.hint.toLowerCase()}</span></td>
                <td className="py-2 text-right tabular-nums">{total((x) => x.n.normal, g.rows)}</td>
                <td className="py-2 text-right tabular-nums">{total((x) => x.n.cta, g.rows)}</td>
                <td className="py-2 text-right tabular-nums">{total((x) => x.n.cuts, g.rows)}</td>
                <td className="py-2 text-right tabular-nums">{total((x) => x.n.scheduled, g.rows)}</td>
                <td className="py-2 text-right tabular-nums">{total((x) => x.n.followers ?? 0, g.rows)}</td>
              </tr>
              {g.rows.map(({ p, n }) => (
                <tr key={p.id} className="text-white/70">
                  <td className="py-1.5 pl-4">{p.name} <span className="text-xs text-white/40">{n.synced ? "lido do Facebook" : "registrado aqui"}</span></td>
                  <td className="py-1.5 text-right tabular-nums">{n.normal}</td>
                  <td className="py-1.5 text-right tabular-nums">{n.cta}</td>
                  <td className="py-1.5 text-right tabular-nums">{n.cuts}</td>
                  <td className="py-1.5 text-right tabular-nums">{n.scheduled}</td>
                  <td className="py-1.5 text-right tabular-nums">{n.followers ?? "sem dado"}</td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </section>

      <section className={cn(card, "space-y-3")} aria-label="Esta semana">
        <p className="text-sm font-medium text-white">Próximos 7 dias</p>
        {!week ? <p className="text-xs text-white/50">Carregando…</p> : week.posts.length === 0 ? <p className="text-sm text-white/60">Nada na agenda. Adicione vídeos numa página.</p> : (
          <div className="grid gap-2 sm:grid-cols-7">
            {days.map((d) => {
              const list = week.posts.filter((x) => postDay(x.scheduled_at) === dayKey(d));
              return (
                <div key={dayKey(d)} className="min-w-0 rounded-[8px] bg-white/[0.04] p-2">
                  <p className="text-xs text-white/60">{WEEKDAY[d.getDay()]} {String(d.getDate()).padStart(2, "0")}</p>
                  {list.length === 0 ? <p className="mt-1 text-xs text-white/30">Vazio</p> : (
                    <ul className="mt-1 space-y-1">
                      {list.map((x) => (
                        <li key={x.id} className="truncate text-xs text-white" title={`${x.title}, ${x.page_name}`}>
                          <span className="tabular-nums text-white/60">{postTime(x.scheduled_at)}</span> {x.page_name}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
