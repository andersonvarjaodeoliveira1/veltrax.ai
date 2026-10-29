"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { FlowProgress } from "@/components/app/flow-run-panel";

type Images = Record<string, { file: string; data: string }>;

const ACTIVE_MS = 90_000;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Projeto que ficou pela metade no Flow: parado (pausado ou com a aba fechada) e com cenas faltando. */
export function stalledRun(progress: FlowProgress | null, now = Date.now()): FlowProgress | null {
  if (!progress || progress.total <= 0 || progress.done >= progress.total) return null;
  if (now - progress.at > MAX_AGE_MS) return null;
  if (progress.running && now - progress.at < ACTIVE_MS) return null; // ainda gerando: nada a perguntar
  return progress;
}

function ask(type: "flow-resume" | "flow-discard"): Promise<boolean> {
  const ackType = type === "flow-resume" ? "resume-ack" : "discard-ack";
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => { window.removeEventListener("message", onAck); resolve(false); }, 5000);
    function onAck(event: MessageEvent) {
      if (event.source !== window || event.data?.source !== "clipgringa-flow" || event.data?.type !== ackType) return;
      window.clearTimeout(timer);
      window.removeEventListener("message", onAck);
      resolve(event.data.ok === true);
    }
    window.addEventListener("message", onAck);
    try { window.postMessage({ source: "clipgringa-page", type }, window.location.origin); } catch { window.clearTimeout(timer); resolve(false); }
  });
}

/** Ao abrir o ClipGringa, se um projeto travou no Flow, pergunta se a pessoa quer continuar (mostrando a imagem) ou começar um projeto novo. */
export function FlowResumePrompt({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [progress, setProgress] = useState<FlowProgress | null>(null);
  const [images, setImages] = useState<Images>({});
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<"" | "resume" | "discard">("");
  const [problem, setProblem] = useState("");
  const decided = useRef(false);
  const latest = useRef<FlowProgress | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window || event.data?.source !== "clipgringa-flow" || !event.data.data) return;
      if (event.data.type === "progress") { latest.current = event.data.data as FlowProgress; setProgress(latest.current); }
      if (event.data.type === "images") setImages(event.data.data as Images);
    };
    window.addEventListener("message", onMessage);
    try {
      window.postMessage({ source: "clipgringa-page", type: "progress?" }, window.location.origin);
      window.postMessage({ source: "clipgringa-page", type: "images?" }, window.location.origin);
    } catch { /* sem janela */ }
    // Dá tempo da extensão responder; se a geração está rodando, os avisos de andamento chegam antes e nada é perguntado.
    const timer = window.setTimeout(() => {
      if (decided.current) return;
      decided.current = true;
      const stalled = stalledRun(latest.current);
      if (!stalled) return;
      const key = `gv-flow-resume-${stalled.startedAt}`;
      try {
        if (window.sessionStorage.getItem(key)) return;
        window.sessionStorage.setItem(key, "1");
      } catch { /* sem armazenamento: pergunta mesmo assim */ }
      setOpen(true);
    }, 3500);
    return () => { window.removeEventListener("message", onMessage); window.clearTimeout(timer); };
  }, [enabled]);

  if (!open || !progress) return null;
  const jobs = progress.jobs ?? [];
  const firstName = jobs[0]?.vname ?? "o seu vídeo";
  const picture = [...jobs].reverse().find((job) => job.done && images[job.key])?.key ?? jobs.find((job) => images[job.key])?.key;
  const image = picture ? images[picture] : undefined;
  const left = progress.total - progress.done;

  async function resume() {
    setBusy("resume"); setProblem("");
    if (await ask("flow-resume")) { setOpen(false); return; }
    setProblem("Não consegui falar com a extensão. Confira se ela está ligada e atualizada e tente de novo.");
    setBusy("");
  }
  async function discard() {
    setBusy("discard"); setProblem("");
    await ask("flow-discard");
    setOpen(false);
    router.push("/multiplicador");
  }

  return (
    <Dialog open onOpenChange={(value) => { if (!value && !busy) setOpen(false); }}>
      <DialogContent data-testid="flow-resume" className="max-w-md border-[#7B3FE4]/40 bg-card">
        <DialogTitle>Quer continuar o projeto que parou?</DialogTitle>
        <DialogDescription>
          {firstName} ficou pela metade no Flow: {progress.done} de {progress.total} cenas prontas, {left} faltando. As cenas prontas não são refeitas.
        </DialogDescription>
        {image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image.data} alt={`Imagem do projeto ${firstName}`} className="mx-auto max-h-64 rounded-[14px] border border-white/10 object-contain" />
        )}
        {progress.now && <p className="text-xs text-muted-foreground">Último aviso do Flow: {progress.now}</p>}
        {problem && <p role="alert" className="text-xs text-[#F0466B]">{problem}</p>}
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={!!busy} onClick={() => void resume()} className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[#8B5CF6] to-[#7B3FE4] px-4 py-2 text-xs font-medium text-white disabled:opacity-60">
            {busy === "resume" && <Loader2 className="size-3.5 animate-spin" />}Continuar no Flow
          </button>
          <button type="button" disabled={!!busy} onClick={() => void discard()} className="rounded-full border border-border px-4 py-2 text-xs font-medium disabled:opacity-60">
            Começar um projeto novo
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
