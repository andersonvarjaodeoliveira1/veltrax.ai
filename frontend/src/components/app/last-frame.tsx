"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ClipboardCopy, Download, Loader2, Upload } from "lucide-react";

/** Pega o último quadro de um vídeo, para usar como frame inicial da próxima cena no Flow. */
export async function extractLastFrame(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = url;
    const wait = (event: string, ms: number) => new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error("timeout")), ms);
      video.addEventListener(event, () => { window.clearTimeout(timer); resolve(); }, { once: true });
    });
    await wait("loadedmetadata", 10000);
    if (!Number.isFinite(video.duration) || video.duration <= 0) throw new Error("no duration");
    const seeked = wait("seeked", 8000);
    video.currentTime = Math.max(0, video.duration - 0.06);
    await seeked;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("no canvas");
    context.drawImage(video, 0, 0);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("no blob"))), "image/png"));
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function LastFrame({ sceneNumber, nextScene }: { sceneNumber: number; nextScene: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "working" | "failed">("idle");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!blob) { setPreview(null); return; }
    const url = URL.createObjectURL(blob);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [blob]);

  async function pick(file: File) {
    setState("working");
    try { setBlob(await extractLastFrame(file)); setState("idle"); } catch { setBlob(null); setState("failed"); }
  }

  async function copy() {
    if (!blob) return;
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch { /* use o botão Baixar */ }
  }

  function download() {
    if (!blob) return;
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Cena${String(sceneNumber).padStart(2, "0")}_ultimo-frame.png`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-[12px] border border-dashed border-border p-2 text-xs">
      <input ref={input} type="file" accept="video/*" className="sr-only" aria-label={`Vídeo da cena ${sceneNumber}`}
        onChange={(event) => { const file = event.target.files?.[0]; if (file) void pick(file); event.target.value = ""; }} />
      <button type="button" onClick={() => input.current?.click()} className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 hover:text-foreground">
        {state === "working" ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />} Subir o vídeo da cena {sceneNumber}
      </button>
      {preview && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt={`Último frame da cena ${sceneNumber}`} className="h-14 w-10 rounded-md border border-border object-cover" />
          <button type="button" onClick={() => void copy()} className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 hover:text-foreground">
            {copied ? <Check className="size-3.5 text-[#5BD69A]" /> : <ClipboardCopy className="size-3.5" />} {copied ? "Copiado" : "Copiar frame"}
          </button>
          <button type="button" onClick={download} className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 hover:text-foreground"><Download className="size-3.5" /> Baixar frame</button>
          {nextScene && <span className="text-muted-foreground">Use como frame inicial da cena {sceneNumber + 1}.</span>}
        </>
      )}
      {state === "failed" && <span className="text-muted-foreground">Não consegui ler esse vídeo. Salve o último quadro à mão no Flow.</span>}
    </div>
  );
}
