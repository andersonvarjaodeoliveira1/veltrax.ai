"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = { image: string; title: string; tagline: string; steps: [string, string, string]; children: React.ReactNode };

const DURATION = 2600;

/** Tela de entrada de cada parte do funil: capa, barra e 3 etapas antes de abrir a ferramenta. */
export function FeatureIntro({ image, title, tagline, steps, children }: Props) {
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const total = reduce ? 600 : DURATION;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / total);
      setProgress(p);
      if (p < 1) frame = requestAnimationFrame(tick);
      else setTimeout(() => setDone(true), 250);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  if (done) return <>{children}</>;

  const active = progress < 0.34 ? 0 : progress < 0.67 ? 1 : progress < 1 ? 2 : 3;
  return (
    <>
    {children}
    <div role="status" aria-live="polite" data-testid="feature-intro" className="fixed inset-0 z-[80] grid place-items-center overflow-hidden bg-[#09080C] p-4">
      <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 size-[520px] rounded-full bg-[#7B3FE4]/25 blur-[110px]" />
      <div className="relative w-full max-w-[420px] rounded-[28px] border border-white/10 bg-[#141316]/95 p-7 text-center shadow-[0_30px_80px_rgba(0,0,0,.6)]">
        <div className="relative mx-auto grid size-[220px] place-items-center overflow-hidden rounded-[24px] bg-black">
          <div aria-hidden className="absolute inset-0 animate-pulse bg-[radial-gradient(60%_60%_at_50%_45%,rgba(123,63,228,.35),transparent)]" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image} alt="" width={220} height={220} className="relative size-full object-cover opacity-95" />
        </div>
        <p className="mt-5 font-mono text-[10px] uppercase tracking-[0.3em] text-[#A98BFF]">ClipGringa</p>
        <h2 className="mt-1 font-display text-2xl font-bold tracking-tight text-white">{title}</h2>
        <p className="mt-1 text-sm text-white/70">{tagline}</p>
        <div className="mt-5 h-1 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-gradient-to-r from-[#5A1BAA] via-[#7B3FE4] to-[#A98BFF] shadow-[0_0_12px_#7B3FE4]" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
        <ol className="mt-4 space-y-2.5 text-left text-sm">
          {steps.map((label, i) => (
            <li key={label} className={cn("flex items-center gap-3 transition-colors", i < active ? "text-white" : i === active ? "text-white" : "text-white/35")}>
              <span className={cn("grid size-5 place-items-center rounded-full border", i < active ? "border-transparent bg-[#7B3FE4]" : i === active ? "border-[#A98BFF]" : "border-white/20")}>
                {i < active ? <Check className="size-3" /> : i === active ? <span className="size-3 animate-spin rounded-full border-2 border-[#A98BFF] border-t-transparent" /> : null}
              </span>
              {label}
            </li>
          ))}
        </ol>
      </div>
    </div>
    </>
  );
}
