"use client";

import { useEffect, useState } from "react";
import { Check, ClipboardCopy, Film, Loader2 } from "lucide-react";

type Frame = { t: number; src: string };
type Meta = { duration: number; width: number; height: number };

const clock = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

function once(target: HTMLVideoElement, event: string, ms: number) {
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => { target.removeEventListener(event, done); reject(new Error("timeout")); }, ms);
    const done = () => { window.clearTimeout(timer); resolve(); };
    target.addEventListener(event, done, { once: true });
  });
}

/** Resumo visual (quadros com o tempo de cada um) e a copy (transcrição) do criativo que a pessoa anexou. */
export function ReferenceSummary({ file, transcript, reading = false, noSpeech = false }: { file: File | null; transcript: string; reading?: boolean; noSpeech?: boolean }) {
  const [frames, setFrames] = useState<Frame[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [state, setState] = useState<"idle" | "working" | "done" | "failed">("idle");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setFrames([]);
    setMeta(null);
    if (!file) { setState("idle"); return; }
    let cancelled = false;
    let url: string | null = null;
    void (async () => {
      try {
        setState("working");
        url = URL.createObjectURL(file);
        const video = document.createElement("video");
        video.muted = true;
        video.playsInline = true;
        video.preload = "auto";
        video.src = url;
        await once(video, "loadedmetadata", 10000);
        // Sem o primeiro quadro decodificado, videoWidth fica 0 e o desenho sai preto (codec que o navegador não abre).
        if (!video.videoWidth) await once(video, "loadeddata", 10000);
        if (!video.videoWidth || !video.videoHeight) throw new Error("undecodable");
        const duration = video.duration;
        if (!Number.isFinite(duration) || duration <= 0) throw new Error("no duration");
        if (cancelled) return;
        setMeta({ duration, width: video.videoWidth, height: video.videoHeight });
        const count = duration >= 36 ? 12 : Math.max(4, Math.ceil(duration / 3));
        const thumbW = 200;
        const thumbH = Math.max(1, Math.round((thumbW * (video.videoHeight || 16)) / (video.videoWidth || 9)));
        const canvas = document.createElement("canvas");
        canvas.width = thumbW;
        canvas.height = thumbH;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("no canvas");
        let lit = 0;
        for (let i = 0; i < count; i += 1) {
          const t = Math.min(duration - 0.05, ((i + 0.5) / count) * duration);
          const seeked = once(video, "seeked", 6000);
          video.currentTime = t;
          await seeked;
          if (cancelled) return;
          context.drawImage(video, 0, 0, thumbW, thumbH);
          const px = context.getImageData(0, 0, thumbW, thumbH).data;
          for (let k = 0; k < px.length; k += 64) if (px[k] > 8 || px[k + 1] > 8 || px[k + 2] > 8) { lit += 1; break; }
          const src = canvas.toDataURL("image/jpeg", 0.72);
          setFrames((current) => [...current, { t, src }]);
        }
        if (cancelled) return;
        if (lit === 0) { setFrames([]); throw new Error("black frames"); }
        setState("done");
      } catch {
        if (!cancelled) setState("failed");
      }
    })();
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [file]);

  const text = transcript.trim();
  if (!file && !text) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch { /* o texto continua visível para copiar à mão */ }
  };

  return (
    <section aria-label="Resumo do criativo" className="space-y-4 rounded-[18px] border border-border bg-card p-5" data-testid="reference-summary">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-medium"><Film className="size-4 text-[#A98BFF]" /> Resumo do criativo</p>
        {meta && <p className="text-xs text-muted-foreground">Duração: <b className="text-foreground">{clock(meta.duration)}</b> · Resolução: <b className="text-foreground">{meta.width}x{meta.height}</b></p>}
      </div>

      {file && (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Quadros do vídeo, na ordem</p>
          {frames.length > 0 && (
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
              {frames.map((frame) => (
                <li key={frame.t} className="relative overflow-hidden rounded-[12px] border border-border bg-black">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={frame.src} alt={`Quadro em ${clock(frame.t)}`} className="aspect-[9/12] w-full object-cover" />
                  <span className="absolute left-1 top-1 rounded-full bg-black/70 px-1.5 py-0.5 text-[10px] tabular-nums text-white">{clock(frame.t)}</span>
                </li>
              ))}
            </ul>
          )}
          {state === "working" && <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="size-3.5 animate-spin" /> Montando os quadros…</p>}
          {state === "failed" && frames.length === 0 && <p className="text-xs text-muted-foreground">Não foi possível mostrar os quadros deste vídeo. A copy abaixo continua valendo.</p>}
        </div>
      )}

      {text ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Copy do criativo (o que é dito)</p>
            <button type="button" onClick={() => void copy()} className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs hover:text-foreground">
              {copied ? <Check className="size-3.5 text-[#5BD69A]" /> : <ClipboardCopy className="size-3.5" />} {copied ? "Copiado" : "Copiar"}
            </button>
          </div>
          <blockquote className="max-h-72 overflow-y-auto whitespace-pre-line border-l-2 border-[#A98BFF] pl-4 text-sm leading-relaxed">{text}</blockquote>
          <p className="text-xs text-muted-foreground">{text.split(/\s+/).filter(Boolean).length} palavras.</p>
        </div>
      ) : noSpeech ? (
        <p role="status" className="text-xs text-muted-foreground">Não encontrei fala nesse vídeo. Isso não é um erro: descreva o que acontece nele no campo de notas e o ClipGringa segue a partir daí.</p>
      ) : file && reading ? (
        <p className="text-xs text-muted-foreground">Ainda lendo o que é dito no vídeo…</p>
      ) : null}
    </section>
  );
}
