"use client";

// Leitura da página: média de visualizações, vídeos que se destacaram e o próximo passo.
// Segue o método "espalhar, achar, encher": sem destaque, testa formatos; com destaque,
// repete aquele formato com variações e arquivo novo.
import Link from "next/link";
import { useEffect, useState } from "react";
import { fb, brDateTime, type FbPage, type PageReading as Reading } from "@/lib/facebook";
import { Pill, secondary } from "./ui";

const PHASE: Record<Reading["status"], string> = {
  sem_conexao: "Sem conexão", sem_leitura: "Sem leitura", poucos: "Poucos vídeos", espalhar: "Testar formatos", encher: "Repetir o formato",
};
const views = (n: number) => n.toLocaleString("pt-BR");

export function PageReading({ page, onConnect }: { page: FbPage; onConnect: () => void }) {
  const [data, setData] = useState<Reading | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const load = () => { setError(null); fb.reading(page.id).then(setData).catch((problem) => setError((problem as Error).message)); };
  useEffect(load, [page.id]);

  if (error) return <p className="text-sm text-white/70">Não consegui ler a página: {error} <button type="button" className={secondary} onClick={load}>Tentar de novo</button></p>;
  if (!data) return <p className="text-sm text-white/60">Lendo a página…</p>;
  const list = all ? data.videos : data.videos.slice(0, 8);
  return (
    <section className="space-y-2 rounded-[12px] border border-white/10 bg-black/20 p-3" aria-label={`Leitura de ${page.name}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone={data.status === "encher" ? "ok" : data.status === "sem_leitura" ? "warn" : "off"}>{PHASE[data.status]}</Pill>
        {data.base ? <span className="text-xs text-white/60">Média da página: {views(data.base)} visualizações, em {data.total} vídeos</span> : null}
      </div>
      <p className="text-sm text-white">{data.message}</p>
      <p className="text-sm text-white/70">{data.next}</p>
      {data.error ? <p className="text-xs text-white/50">{data.error}</p> : null}
      {data.status === "sem_conexao" || data.status === "sem_leitura" ? <button type="button" className={secondary} onClick={onConnect}>Conectar à Meta</button> : null}
      {data.lead ? (
        <p className="text-sm text-white/80">
          Destaque: {data.lead.link ? <a className="underline" href={data.lead.link} target="_blank" rel="noopener noreferrer">{data.lead.title || "vídeo sem título"}</a> : data.lead.title || "vídeo sem título"},
          {" "}{views(data.lead.views)} visualizações
        </p>
      ) : null}
      {data.status === "encher" && data.lead ? (
        <p><Link className={secondary} href={`/automacao?aba=criar&copy=${encodeURIComponent(data.lead.title.slice(0, 600))}`}>Gerar variações deste formato</Link></p>
      ) : null}
      {list.length ? (
        <ul className="divide-y divide-white/5 text-sm">
          {list.map((v) => (
            <li key={v.id} className="flex items-center gap-3 py-1.5">
              <span className="min-w-0 flex-1 truncate text-white/80">
                {v.link ? <a className="hover:underline" href={v.link} target="_blank" rel="noopener noreferrer">{v.title || "Vídeo sem título"}</a> : v.title || "Vídeo sem título"}
              </span>
              {v.tag ? <Pill tone="ok">{v.tag === "viral" ? "Viral" : "Sinal"}</Pill> : null}
              <span className="w-24 shrink-0 text-right tabular-nums text-white">{views(v.views)}</span>
              <span className="hidden w-24 shrink-0 text-right text-xs text-white/50 sm:block">{v.published_at ? brDateTime(v.published_at).slice(0, 5) : ""}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {data.videos.length > 8 ? <button type="button" className={secondary} onClick={() => setAll((x) => !x)}>{all ? "Ver menos" : `Ver os ${data.videos.length} vídeos`}</button> : null}
      {data.base ? <p className="text-xs text-white/40">Sinal: 3 vezes a média. Viral: 10 vezes a média.</p> : null}
    </section>
  );
}
