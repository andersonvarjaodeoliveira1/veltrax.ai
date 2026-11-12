"use client";

import { useState } from "react";
import { Check, ClipboardCopy, Loader2 } from "lucide-react";

export type ViralRegion = { score: number; note: string };
export type Virality = {
  score: number; hold_rate: number;
  regions: Record<"attention" | "emotion" | "memory" | "language" | "vision" | "sound", ViralRegion>;
  strongest_line: string; drops: Array<{ quote: string; why: string; fix: string }>;
  fixes: string[]; better_hook: string; trending: string[]; verdict: string;
};

// Onde cada área fica no desenho do cérebro (visto de lado, frente à esquerda)
const AREAS: Array<{ key: keyof Virality["regions"]; label: string; x: number; y: number; lx: number; ly: number; anchor: "start" | "end" }> = [
  { key: "attention", label: "Atenção", x: 108, y: 78, lx: 20, ly: 34, anchor: "start" },
  { key: "language", label: "Linguagem", x: 122, y: 122, lx: 20, ly: 176, anchor: "start" },
  { key: "emotion", label: "Emoção", x: 168, y: 112, lx: 168, ly: 196, anchor: "start" },
  { key: "memory", label: "Memória", x: 190, y: 68, lx: 190, ly: 20, anchor: "start" },
  { key: "sound", label: "Som", x: 214, y: 124, lx: 340, ly: 176, anchor: "end" },
  { key: "vision", label: "Visão", x: 258, y: 96, lx: 340, ly: 34, anchor: "end" },
];

const level = (score: number) => (score >= 70 ? "Forte" : score >= 45 ? "Médio" : "Fraco");
const tone = (score: number) => (score >= 70 ? "#4CC38A" : score >= 45 ? "#F5B454" : "#E5484D");

/** Mapa do cérebro: cada área acende conforme a nota. A cor diz a situação e vem sempre com a palavra. */
export function BrainMap({ data, active, onPick }: { data: Virality; active: string | null; onPick: (key: string) => void }) {
  return (
    <svg viewBox="0 0 360 210" role="img" aria-label={`Mapa de viralização, nota ${data.score} de 100`} className="w-full">
      <path d="M92 150c-24-6-42-30-38-58 3-24 22-44 46-50 12-14 34-22 58-20 18-10 44-10 62 2 26 2 48 18 56 42 14 12 18 34 8 52-8 16-26 24-44 22-6 14-22 22-40 20l-8 22c-2 6-10 8-16 4l-10-18c-28 4-56 0-74-18z"
        fill="rgba(237,237,237,.04)" stroke="rgba(237,237,237,.22)" strokeWidth="1.5" />
      <path d="M118 58c14 10 20 26 14 44M176 40c-6 18-2 36 12 48M232 54c-10 14-8 34 6 46M96 112c22-6 44-2 60 12M196 128c18-10 40-10 56 0" fill="none" stroke="rgba(237,237,237,.12)" strokeWidth="1.2" strokeLinecap="round" />
      {AREAS.map((a) => {
        const r = data.regions[a.key];
        const on = active === a.key;
        return (
          <g key={a.key} role="button" tabIndex={0} aria-label={`${a.label}, ${r.score} de 100, ${level(r.score)}`} className="cursor-pointer outline-none"
            onClick={() => onPick(a.key)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(a.key); } }}>
            <line x1={a.x} y1={a.y} x2={a.anchor === "start" ? a.lx + 4 : a.lx - 4} y2={a.ly + (a.ly > 100 ? -12 : 6)} stroke="rgba(237,237,237,.18)" strokeWidth="1" />
            <circle cx={a.x} cy={a.y} r={10 + r.score / 6} fill={tone(r.score)} opacity={0.14 + r.score / 280} />
            <circle cx={a.x} cy={a.y} r={on ? 6 : 4.5} fill={tone(r.score)} stroke={on ? "#EDEDED" : "none"} strokeWidth="1.5" />
            <text x={a.lx} y={a.ly} textAnchor={a.anchor} fontSize="11" fill={on ? "#EDEDED" : "#A1A1A6"}>{a.label}</text>
            <text x={a.lx} y={a.ly + 13} textAnchor={a.anchor} fontSize="11" fill="#EDEDED" style={{ fontVariantNumeric: "tabular-nums" }}>{r.score} {level(r.score).toLowerCase()}</text>
          </g>
        );
      })}
    </svg>
  );
}

/** Prévia de viralização do roteiro, antes de gastar créditos no vídeo. */
export function ViralityPreview({ script, niche }: { script: string; niche?: string }) {
  const [data, setData] = useState<Virality | null>(null);
  const [state, setState] = useState<"idle" | "working" | "failed">("idle");
  const [active, setActive] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const run = async () => {
    setState("working");
    try {
      const response = await fetch("/api/multiplier/clone/virality", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ script, niche }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error("falhou");
      const got = body as Virality;
      setData(got);
      setActive(Object.entries(got.regions).sort((a, b) => a[1].score - b[1].score)[0]?.[0] ?? null);
      setState("idle");
    } catch { setState("failed"); }
  };
  const copyHook = async () => {
    if (!data) return;
    try { await navigator.clipboard.writeText(data.better_hook); setCopied(true); window.setTimeout(() => setCopied(false), 1500); } catch { /* sem área de transferência */ }
  };

  if (script.trim().length < 20) return null;
  if (!data) {
    return (
      <div className="space-y-1.5">
        <button type="button" onClick={() => void run()} disabled={state === "working"} className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs hover:text-foreground disabled:opacity-60">
          {state === "working" ? <Loader2 className="size-3.5 animate-spin" /> : null} {state === "working" ? "Lendo o roteiro…" : "Prever viralização"}
        </button>
        {state === "failed" ? <p role="alert" className="text-xs text-[#F0466B]">Não foi possível analisar agora. Tente de novo em instantes.</p> : null}
      </div>
    );
  }
  const area = AREAS.find((a) => a.key === active);
  return (
    <section data-testid="virality" aria-label="Prévia de viralização" className="space-y-3 rounded-[14px] border border-border p-3 text-sm">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">Chance de viralizar</p>
          <p className="text-3xl font-medium tabular-nums">{data.score}<span className="text-sm text-muted-foreground"> de 100, {level(data.score).toLowerCase()}</span></p>
        </div>
        <p className="text-xs text-muted-foreground">Ficam até o fim: <span className="tabular-nums text-foreground">{data.hold_rate}%</span></p>
      </div>
      {data.verdict ? <p>{data.verdict}</p> : null}
      <BrainMap data={data} active={active} onPick={setActive} />
      {area ? <p className="text-xs text-muted-foreground"><span className="text-foreground">{area.label}:</span> {data.regions[area.key].note || "Sem observação."}</p> : null}

      {data.better_hook ? (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">Abertura sugerida</p>
          <p>{data.better_hook}</p>
          <button type="button" onClick={() => void copyHook()} className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs hover:text-foreground">
            {copied ? <Check className="size-3.5" /> : <ClipboardCopy className="size-3.5" />} {copied ? "Copiado" : "Copiar abertura"}
          </button>
        </div>
      ) : null}
      {data.fixes.length ? (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">O que arrumar antes de gerar</p>
          <ol className="list-decimal space-y-1 pl-4">{data.fixes.map((f) => <li key={f}>{f}</li>)}</ol>
        </div>
      ) : null}
      {data.drops.length ? (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Onde a atenção cai</p>
          <ul className="space-y-1.5">{data.drops.map((d) => <li key={d.quote + d.why}><span className="text-foreground">“{d.quote}”</span> <span className="text-muted-foreground">{d.why} {d.fix}</span></li>)}</ul>
        </div>
      ) : null}
      {data.trending.length ? (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">O que costuma funcionar nesse tipo de conteúdo</p>
          <ul className="list-disc space-y-1 pl-4">{data.trending.map((t) => <li key={t}>{t}</li>)}</ul>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">Estimativa da IA pela leitura do roteiro. Serve para comparar versões, não é garantia.</p>
        <button type="button" onClick={() => void run()} disabled={state === "working"} className="text-xs text-muted-foreground underline-offset-2 hover:underline">{state === "working" ? "Lendo…" : "Analisar de novo"}</button>
      </div>
    </section>
  );
}
