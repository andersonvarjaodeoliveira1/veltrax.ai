"use client";

import { Loader2 } from "lucide-react";

type Props = {
  stage: "upload" | "render";
  /** 0-100. `null` shows an indeterminate bar. */
  percent: number | null;
  detail?: string;
};

const STEPS = [
  { key: "upload", label: "Enviando" },
  { key: "render", label: "Criando" },
] as const;

/** Loading panel with an animated bar, used while sending files and while videos are created. */
export function ProgressPanel({ stage, percent, detail }: Props) {
  const value = percent === null ? null : Math.max(0, Math.min(100, Math.round(percent)));
  const title = stage === "upload" ? "Enviando seus vídeos…" : "Criando seus vídeos…";
  return (
    <div role="status" aria-live="polite" data-no-translate className="rounded-[18px] border border-border bg-card p-5">
      <style>{`@keyframes gv-shimmer{0%{transform:translateX(-100%)}100%{transform:translateX(100%)}}
@keyframes gv-indeterminate{0%{left:-40%}100%{left:100%}}`}</style>
      <div className="flex items-center gap-3">
        <Loader2 className="size-5 animate-spin text-brand motion-reduce:animate-none" />
        <div className="min-w-0 flex-1">
          <p className="font-medium">{title}</p>
          {detail && <p className="truncate text-xs text-muted-foreground">{detail}</p>}
        </div>
        <span className="text-sm font-semibold tabular-nums">{value === null ? "" : `${value}%`}</span>
      </div>

      <div
        className="relative mt-4 h-3 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value ?? undefined}
      >
        {value === null ? (
          <div
            className="absolute top-0 h-full w-2/5 rounded-full bg-gradient-to-r from-[#8b5cf6] to-[#7b3fe4] motion-reduce:hidden"
            style={{ animation: "gv-indeterminate 1.2s ease-in-out infinite" }}
          />
        ) : (
          <div
            className="relative h-full overflow-hidden rounded-full bg-gradient-to-r from-[#8b5cf6] to-[#7b3fe4] transition-[width] duration-500 ease-out motion-reduce:transition-none"
            style={{ width: `${Math.max(value, 3)}%` }}
          >
            <span
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/35 to-transparent motion-reduce:hidden"
              style={{ animation: "gv-shimmer 1.4s linear infinite" }}
            />
          </div>
        )}
      </div>

      <ol className="mt-4 flex items-center gap-2 text-xs">
        {STEPS.map((step, index) => {
          const done = stage === "render" && step.key === "upload";
          const active = step.key === stage;
          return (
            <li key={step.key} className="flex items-center gap-2">
              <span
                className={
                  "flex size-5 items-center justify-center rounded-full text-[10px] font-semibold " +
                  (done ? "bg-brand text-white" : active ? "border border-brand text-brand" : "border border-border text-muted-foreground")
                }
              >
                {done ? "✓" : index + 1}
              </span>
              <span className={active || done ? "text-foreground" : "text-muted-foreground"}>{step.label}</span>
              {index < STEPS.length - 1 && <span className="h-px w-6 bg-border" />}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
