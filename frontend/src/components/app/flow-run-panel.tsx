"use client";

import { useEffect, useState } from "react";
import { Download, ImageDown } from "lucide-react";
import { TAKE_KINDS, type TakeKind } from "@/lib/take-kinds";
import { FinalVideoMaker } from "@/components/app/final-video-maker";

export type FlowProgress = {
  at: number; running: boolean; total: number; done: number; errors: number; phase: string; now: string;
  limit?: { since: number; resumeAt: number; known: boolean; kind: "limit" | "credits"; message: string } | null;
  current: { vi: number; si: number } | null; startedAt: number; jobStartedAt: number; dur: Record<string, number>;
  jobs: { key: string; vi: number; si: number; vname?: string; sname?: string; vbase?: number; sbase?: number; file: string; done: boolean; error: string; pct?: number | null }[];
};

/** Painel do que a extensão está gerando no Flow: progresso, tempo, vídeos para assistir/baixar, fotos e "+ take". */
export function FlowRunPanel({ onRetake, onVariations }: { onRetake: (vbase: number, sbase: number, kind: TakeKind) => void; onVariations?: (count: number) => void }) {
  const [menu, setMenu] = useState<string | null>(null);
  const [varCount, setVarCount] = useState(2);
  const [varAsked, setVarAsked] = useState<"" | "yes" | "no">("");
  const [flowProg, setFlowProg] = useState<FlowProgress | null>(null);
  const [flowImages, setFlowImages] = useState<Record<string, { file: string; data: string }>>({});
  const [watching, setWatching] = useState<string | null>(null);
  const [flowFiles, setFlowFiles] = useState<Record<string, string>>({}); // nome do arquivo -> id no ClipGringa
  useEffect(() => {
    const onImages = (event: MessageEvent) => {
      if (event.source !== window || event.data?.source !== "clipgringa-flow" || event.data?.type !== "images" || !event.data.data) return;
      setFlowImages(event.data.data as Record<string, { file: string; data: string }>);
    };
    window.addEventListener("message", onImages);
    window.postMessage({ source: "clipgringa-page", type: "images?" }, window.location.origin);
    return () => window.removeEventListener("message", onImages);
  }, []);
  const [tick, setTick] = useState(() => Date.now());
  const limit = flowProg?.limit && Date.now() - flowProg.at < 15_000 ? flowProg.limit : null;
  useEffect(() => {
    if (!limit) return;
    const t = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [limit]);
  const flowActive = !!flowProg && flowProg.total > 0 && flowProg.done < flowProg.total;
  useEffect(() => {
    if (!flowProg || flowProg.total === 0) return;
    let stop = false;
    const load = async () => {
      try {
        const response = await fetch("/api/multiplier/flow-videos", { cache: "no-store" });
        if (!response.ok) return;
        const list = ((await response.json()).videos ?? []) as { id: string; file: string; created_at?: string }[];
        // Só vale o que foi enviado nesta geração: criativos antigos têm os mesmos nomes (Video01_Cena01.mp4) e mostrariam a cena errada.
        // A lista vem do mais novo para o mais antigo: fica o mais novo de cada nome.
        const since = (flowProg.startedAt || 0) - 30_000;
        const mine: Record<string, string> = {};
        for (const v of list) {
          if (since > 0 && (!v.created_at || Date.parse(v.created_at) < since)) continue;
          if (!(v.file in mine)) mine[v.file] = v.id;
        }
        if (!stop) setFlowFiles(mine);
      } catch { /* sem lista: o painel segue sem as setas */ }
    };
    void load();
    const timer = flowActive ? window.setInterval(load, 6000) : 0;
    return () => { stop = true; if (timer) window.clearInterval(timer); };
  }, [flowProg?.total, flowProg?.done, flowProg?.startedAt, flowActive]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const onMsg = (event: MessageEvent) => {
      if (event.source !== window || event.data?.source !== "clipgringa-flow" || event.data?.type !== "progress" || !event.data.data) return;
      setFlowProg(event.data.data as FlowProgress);
    };
    window.addEventListener("message", onMsg);
    try { window.postMessage({ source: "clipgringa-page", type: "progress?" }, window.location.origin); } catch { /* sem janela */ }
    return () => window.removeEventListener("message", onMsg);
  }, []);
  return (
    <>
  {flowProg && flowProg.total > 0 && Date.now() - flowProg.at < 6 * 60 * 60 * 1000 && (() => {
    const pct = Math.round((flowProg.done / flowProg.total) * 100);
    const videos = Array.from(new Set(flowProg.jobs.map((j) => j.vi))).sort((a, b) => a - b);
    const left = flowProg.total - flowProg.done;
    const fmtTime = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}`;
    const total = flowProg.startedAt ? Math.max(0, Math.round(((flowProg.running ? Date.now() : flowProg.at) - flowProg.startedAt) / 1000)) : 0;
    return (
      <section role="status" className="space-y-4 rounded-[22px] border border-[#7B3FE4]/60 bg-[#7B3FE4]/10 p-5" data-testid="flow-progress">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-lg font-semibold">{flowProg.done === flowProg.total ? "Tudo pronto no Flow!" : flowProg.running ? "Criando os vídeos no Flow" : "Geração pausada"}</p>
            {flowProg.now && <p className="mt-0.5 text-xs text-muted-foreground">{flowProg.now}</p>}
          </div>
          <div className="flex gap-2 text-center text-xs">
            <div className="rounded-[14px] border border-white/10 bg-black/20 px-3 py-2"><p className="text-lg font-semibold tabular-nums text-[#5BD69A]">{flowProg.done}</p><p className="text-muted-foreground">prontas</p></div>
            <div className="rounded-[14px] border border-white/10 bg-black/20 px-3 py-2"><p className="text-lg font-semibold tabular-nums">{left}</p><p className="text-muted-foreground">faltam</p></div>
            <div className="rounded-[14px] border border-white/10 bg-black/20 px-3 py-2"><p className="text-lg font-semibold tabular-nums text-[#A98BFF]">{fmtTime(total)}</p><p className="text-muted-foreground">tempo</p></div>
          </div>
        </div>
        {limit && (() => {
          const secs = Math.max(0, Math.round((limit.resumeAt - tick) / 1000));
          const clock = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
          const credits = limit.kind === "credits";
          return (
            <div role="alert" data-testid="flow-limit" className="space-y-3 rounded-[18px] border border-[#F5B454]/50 bg-[#F5B454]/10 p-4">
              <p className="text-sm font-semibold text-[#F5B454]">{credits ? "Os créditos desta conta do Flow acabaram" : "Esta conta do Flow atingiu o limite"}</p>
              <p className="text-xs text-foreground/85">
                {limit.known
                  ? <>O Flow informou o tempo de espera. Retomamos sozinhos em <strong className="tabular-nums">{clock}</strong>.</>
                  : <>O Flow não disse quanto tempo falta. Tentamos de novo a cada 2 minutos; a próxima tentativa é em <strong className="tabular-nums">{clock}</strong>.</>}
              </p>
              <div className="grid gap-2 text-xs sm:grid-cols-2">
                <p className="rounded-[14px] border border-white/10 bg-black/20 p-3"><strong>Esperar</strong><br />Pode deixar esta aba aberta. Quando o tempo acabar, a geração continua de onde parou, sem refazer as cenas prontas.</p>
                <p className="rounded-[14px] border border-white/10 bg-black/20 p-3"><strong>Trocar de conta</strong><br />No Flow, clique na sua foto do Google e escolha outra conta. Ao detectar créditos novos, continuamos na hora.</p>
              </div>
              {limit.message && <p className="text-[11px] text-muted-foreground">Mensagem do Flow: “{limit.message}”</p>}
            </div>
          );
        })()}
        <div className="h-2.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-[#8B5CF6] to-[#A98BFF] transition-all duration-700" style={{ width: `${pct}%` }} /></div>
        {onVariations && flowProg.done === flowProg.total && !flowProg.running && varAsked === "" && (
          <div data-testid="ask-variations" className="space-y-3 rounded-[18px] border border-[#5BD69A]/40 bg-[#5BD69A]/10 p-4">
            <p className="text-sm font-semibold">Terminou! Quer criar variações deste vídeo?</p>
            <p className="text-xs text-muted-foreground">Mesma mensagem e mesmo produto, com outros avatares e cenários.</p>
            <div className="flex flex-wrap items-center gap-2">
              {[1, 2, 3, 5].map((n) => (
                <button key={n} type="button" aria-pressed={varCount === n} onClick={() => setVarCount(n)}
                  className={`rounded-full border px-3 py-1 text-xs ${varCount === n ? "border-[#7B3FE4] bg-[#7B3FE4]/25" : "border-border text-muted-foreground"}`}>{n} {n === 1 ? "variação" : "variações"}</button>
              ))}
              <button type="button" onClick={() => { setVarAsked("yes"); onVariations(varCount); }} className="rounded-full bg-gradient-to-br from-[#8B5CF6] to-[#7B3FE4] px-4 py-1.5 text-xs font-medium text-white">Sim, criar variações</button>
              <button type="button" onClick={() => setVarAsked("no")} className="rounded-full border border-border px-4 py-1.5 text-xs text-muted-foreground">Agora não</button>
            </div>
          </div>
        )}
        <div className="space-y-4">
          {videos.map((vi) => {
            const mine = flowProg.jobs.filter((j) => j.vi === vi).sort((a, b) => a.si - b.si);
            const doneN = mine.filter((j) => j.done).length;
            return (
              <div key={vi} className="space-y-2">
                <p className="text-sm font-medium">{mine[0]?.vname ?? `Vídeo ${String(vi + 1).padStart(2, "0")}`} <span className="font-normal text-muted-foreground">· {doneN}/{mine.length} cenas</span></p>
                {mine.length > 0 && doneN === mine.length && !flowProg.running && mine.every((j) => flowFiles[j.file]) && (
                  <FinalVideoMaker videoIds={mine.map((j) => flowFiles[j.file])} defaultTitle="" />
                )}
                <ul className="grid gap-2 sm:grid-cols-2">
                  {mine.map((job) => {
                    const running = flowProg.running && flowProg.current?.vi === job.vi && flowProg.current?.si === job.si;
                    const secs = flowProg.dur?.[job.key];
                    const image = flowImages[job.key];
                    const videoId = flowFiles[job.file];
                    const value = job.done ? 100 : typeof job.pct === "number" ? job.pct : running ? 8 : 0;
                    return (
                      <li key={job.key} className="flex flex-wrap items-center gap-3 rounded-[14px] border border-white/10 bg-black/20 p-2.5">
                        {videoId ? (
                          <button type="button" onClick={() => setWatching(watching === job.key ? null : job.key)} aria-label={`Assistir a cena ${job.si + 1} do vídeo ${vi + 1}`} title="Assistir" className="relative h-14 w-10 shrink-0 overflow-hidden rounded-[8px] bg-black">
                            <video preload="metadata" muted playsInline src={`/api/multiplier/flow-videos/${videoId}/file#t=0.5`} className="size-full object-cover" />
                            <span aria-hidden className="absolute inset-0 grid place-items-center bg-black/30 text-xs text-white">▶</span>
                          </button>
                        ) : image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={image.data} alt={`Foto da cena ${job.si + 1}`} className="h-14 w-10 shrink-0 rounded-[8px] object-cover" />
                        ) : (
                          <span aria-hidden className="grid h-14 w-10 shrink-0 place-items-center rounded-[8px] bg-white/5 text-xs text-muted-foreground">{job.si + 1}</span>
                        )}
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <span className="truncate font-medium">{job.sname ?? `Cena ${String(job.si + 1).padStart(2, "0")}`}</span>
                            <span className={job.error ? "text-[#F0466B]" : job.done ? "text-[#5BD69A]" : "text-muted-foreground"}>
                              {job.error ? "erro" : job.done ? `pronta${secs ? ` · ${fmtTime(secs)}` : ""}` : running || typeof job.pct === "number" ? `${value}%` : "na fila"}
                            </span>
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-white/10"><div className={`h-full rounded-full transition-all duration-700 ${job.done ? "bg-[#5BD69A]" : "bg-gradient-to-r from-[#8B5CF6] to-[#A98BFF]"}`} style={{ width: `${value}%` }} /></div>
                        </div>
                        <div className="flex shrink-0 gap-1">
                          {job.done && !flowProg.running && (
                          <div className="relative">
                            <button type="button" onClick={() => setMenu(menu === job.key ? null : job.key)} aria-expanded={menu === job.key} aria-label={`Mais um take da cena ${(job.sbase ?? job.si) + 1} do vídeo ${(job.vbase ?? job.vi) + 1}`} title="Mais um take desta cena" className="grid h-8 place-items-center rounded-full border border-border px-2 text-[11px] text-muted-foreground hover:text-foreground">+ take</button>
                            {menu === job.key && (
                              <div role="menu" aria-label="Tipo de take" className="absolute right-0 z-20 mt-1 w-64 space-y-1 rounded-[14px] border border-white/10 bg-card p-2 shadow-xl">
                                {TAKE_KINDS.map((kind) => (
                                  <button key={kind.id} type="button" role="menuitem" onClick={() => { setMenu(null); onRetake(job.vbase ?? job.vi, job.sbase ?? job.si, kind.id); }} className="block w-full rounded-[10px] px-3 py-2 text-left hover:bg-white/5">
                                    <span className="block text-sm font-medium">{kind.label}</span>
                                    <span className="block text-[11px] text-muted-foreground">{kind.hint}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                          {image && <a href={image.data} download={image.file} aria-label={`Baixar a foto da cena ${job.si + 1} do vídeo ${vi + 1}`} title="Baixar a foto" className="grid size-8 place-items-center rounded-full border border-border text-muted-foreground hover:text-foreground"><ImageDown className="size-4" /></a>}
                          {videoId && <a href={`/api/multiplier/flow-videos/${videoId}/file?download=1`} download={job.file} aria-label={`Baixar o vídeo da cena ${job.si + 1} do vídeo ${vi + 1}`} title="Baixar o vídeo" className="grid size-8 place-items-center rounded-full bg-gradient-to-br from-[#8B5CF6] to-[#7B3FE4] text-white"><Download className="size-4" /></a>}
                        </div>
                        {watching === job.key && videoId && (
                          <video controls autoPlay playsInline src={`/api/multiplier/flow-videos/${videoId}/file`} className="mx-auto mt-1 max-h-[70vh] w-full basis-full rounded-[12px] bg-black object-contain" aria-label={`Vídeo ${job.file}`} />
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      </section>
    );
  })()}
    </>
  );
}
