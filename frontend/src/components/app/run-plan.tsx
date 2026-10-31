"use client";

import { estimateRun, formatDuration } from "@/lib/run-metrics";

/** Mostra ao cliente o que vai ser feito (vídeos, cenas, imagens, animações) e quanto tempo deve levar, antes e depois de gerar. */
export function RunPlanCard({ videos, scenes, takes, lastRun }: { videos: number; scenes: number; takes?: number; lastRun?: { ms: number; videos: number } | null }) {
  const plan = estimateRun(videos, scenes, takes);
  const items: [string, string][] = [["Vídeos", String(plan.videos)], ["Cenas por vídeo", String(plan.scenes)], ["Imagens", String(plan.images)], ["Animações", String(plan.animations)], ["Tempo estimado", `~${plan.minutes} min`]];
  return (
    <section data-testid="run-plan" aria-label="Resumo do pedido" className="space-y-2 rounded-[18px] border border-border bg-card p-4">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">O que vamos fazer</p>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {items.map(([label, value]) => (
          <div key={label} className="rounded-[12px] border border-border bg-background/40 p-2.5">
            <dt className="text-[11px] text-muted-foreground">{label}</dt>
            <dd className="text-base font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-muted-foreground">O tempo é uma média: depende da fila do Flow e da sua internet.</p>
      {lastRun && <p data-testid="last-run" className="rounded-[12px] border border-[#5BD69A]/40 bg-[#5BD69A]/10 p-2.5 text-xs text-[#5BD69A]">Último pedido: {lastRun.videos} {lastRun.videos === 1 ? "vídeo preparado" : "vídeos preparados"} em {formatDuration(lastRun.ms)}.</p>}
    </section>
  );
}
