"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Film, Loader2 } from "lucide-react";

type Final = { id: string; status: "processing" | "done" | "error"; step: string; error: string | null; warning: string; duration: number | null };

export const FINAL_STYLES: { id: string; label: string; hint: string }[] = [
  { id: "default", label: "Padrão", hint: "Branca, limpa" },
  { id: "hormozi", label: "Impacto", hint: "Grande, verde no destaque" },
  { id: "mrbeast", label: "Chamativa", hint: "Colorida e animada" },
  { id: "minimal", label: "Discreta", hint: "Pequena e elegante" },
  { id: "tiktok", label: "TikTok", hint: "Estilo da plataforma" },
  { id: "neon", label: "Neon", hint: "Brilho colorido" },
  { id: "podcast", label: "Podcast", hint: "Calma, de conversa" },
];
const SPEEDS = [{ v: 1, label: "Normal" }, { v: 1.1, label: "Um pouco mais rápido" }, { v: 1.2, label: "Rápido" }];

/** Depois das cenas prontas no Flow: junta tudo, põe legenda e título e entrega o vídeo final. `videoIds` já vem na ordem das cenas. */
export function FinalVideoMaker({ videoIds, defaultTitle }: { videoIds: string[]; defaultTitle?: string }) {
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState("hormozi");
  const [title, setTitle] = useState(defaultTitle ?? "");
  const [aspect, setAspect] = useState<"9:16" | "16:9">("9:16");
  const [speed, setSpeed] = useState(1);
  const [captions, setCaptions] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [final, setFinal] = useState<Final | null>(null);
  const timer = useRef(0);

  useEffect(() => () => window.clearInterval(timer.current), []);

  function poll(id: string) {
    window.clearInterval(timer.current);
    timer.current = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/multiplier/final/${id}`, { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as Final;
        setFinal(data);
        if (data.status !== "processing") { window.clearInterval(timer.current); setBusy(false); }
      } catch { /* tenta de novo no próximo ciclo */ }
    }, 2000);
  }

  async function create() {
    setBusy(true); setError(""); setFinal(null);
    try {
      const response = await fetch("/api/multiplier/final", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ video_ids: videoIds, template: style, title: title.trim(), aspect, speed, captions }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(response.status === 409 ? "Você já tem um vídeo final sendo criado ou chegou ao limite de 10. Espere terminar ou apague um antigo." : "Não consegui começar. Tente de novo.");
        setBusy(false);
        return;
      }
      setFinal({ id: data.id, status: "processing", step: "Na fila", error: null, warning: "", duration: null });
      poll(data.id);
    } catch {
      setError("Não consegui falar com o servidor. Tente de novo.");
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} data-testid="final-open"
        className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[#8B5CF6] to-[#7B3FE4] px-4 py-2 text-xs font-medium text-white">
        <Film className="size-3.5" />Finalizar vídeo (juntar, legenda e título)
      </button>
    );
  }

  return (
    <div data-testid="final-maker" className="space-y-3 rounded-[16px] border border-[#7B3FE4]/50 bg-black/20 p-4 text-sm">
      <p className="font-semibold">Finalizar vídeo</p>
      <p className="text-xs text-muted-foreground">Junto as {videoIds.length} cenas na ordem, escrevo a legenda do que é falado e coloco o título no começo. Você recebe um vídeo pronto para postar.</p>
      {!final && (
        <>
          <fieldset className="space-y-1.5"><legend className="text-xs font-medium">1. Estilo da legenda</legend>
            <div className="flex flex-wrap gap-2">
              {FINAL_STYLES.map((s) => (
                <button key={s.id} type="button" aria-pressed={style === s.id} onClick={() => setStyle(s.id)} title={s.hint}
                  className={`rounded-full border px-3 py-1 text-xs ${style === s.id ? "border-[#7B3FE4] bg-[#7B3FE4]/25" : "border-border text-muted-foreground"}`}>{s.label}</button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={captions} onChange={(event) => setCaptions(event.target.checked)} />Colocar legenda no vídeo</label>
          </fieldset>
          <label className="block space-y-1.5"><span className="text-xs font-medium">2. Título no começo (opcional)</span>
            <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={90} placeholder="Ex.: Isso muda tudo em 7 dias"
              className="w-full rounded-full border border-border bg-background px-4 py-2 text-sm" />
          </label>
          <fieldset className="space-y-1.5"><legend className="text-xs font-medium">3. Formato</legend>
            <div className="flex flex-wrap gap-2">
              {(["9:16", "16:9"] as const).map((a) => (
                <button key={a} type="button" aria-pressed={aspect === a} onClick={() => setAspect(a)}
                  className={`rounded-full border px-3 py-1 text-xs ${aspect === a ? "border-[#7B3FE4] bg-[#7B3FE4]/25" : "border-border text-muted-foreground"}`}>{a === "9:16" ? "Vertical (9:16)" : "Horizontal (16:9)"}</button>
              ))}
            </div>
            <legend className="pt-1 text-xs font-medium">4. Velocidade da fala</legend>
            <div className="flex flex-wrap gap-2">
              {SPEEDS.map((s) => (
                <button key={s.v} type="button" aria-pressed={speed === s.v} onClick={() => setSpeed(s.v)}
                  className={`rounded-full border px-3 py-1 text-xs ${speed === s.v ? "border-[#7B3FE4] bg-[#7B3FE4]/25" : "border-border text-muted-foreground"}`}>{s.label}</button>
              ))}
            </div>
          </fieldset>
          {error && <p role="alert" className="text-xs text-[#F0466B]">{error}</p>}
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={() => void create()} className="rounded-full bg-gradient-to-br from-[#8B5CF6] to-[#7B3FE4] px-4 py-2 text-xs font-medium text-white disabled:opacity-60">Criar o vídeo final</button>
            <button type="button" onClick={() => setOpen(false)} className="rounded-full border border-border px-4 py-2 text-xs">Fechar</button>
          </div>
        </>
      )}
      {final?.status === "processing" && (
        <p role="status" className="flex items-center gap-2 text-xs"><Loader2 className="size-3.5 animate-spin" />{final.step || "Preparando"}… pode levar alguns minutos. Pode ficar nesta tela.</p>
      )}
      {final?.status === "error" && (
        <div className="space-y-2"><p role="alert" className="text-xs text-[#F0466B]">{final.error ?? "Não consegui montar o vídeo final."}</p>
          <button type="button" onClick={() => setFinal(null)} className="rounded-full border border-border px-4 py-2 text-xs">Tentar de novo</button></div>
      )}
      {final?.status === "done" && (
        <div className="space-y-2" data-testid="final-done">
          <p className="text-xs font-medium text-[#5BD69A]">Pronto! Seu vídeo final{final.duration ? ` (${Math.round(final.duration)}s)` : ""}:</p>
          {final.warning && <p className="text-xs text-[#F5B454]">{final.warning}</p>}
          <video controls playsInline src={`/api/multiplier/final/${final.id}/file`} className="mx-auto max-h-[60vh] rounded-[12px] bg-black" aria-label="Vídeo final" />
          <div className="flex flex-wrap gap-2">
            <a href={`/api/multiplier/final/${final.id}/file?download=1`} download className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[#8B5CF6] to-[#7B3FE4] px-4 py-2 text-xs font-medium text-white"><Download className="size-3.5" />Baixar o vídeo</a>
            <button type="button" onClick={() => setFinal(null)} className="rounded-full border border-border px-4 py-2 text-xs">Fazer outro estilo</button>
          </div>
        </div>
      )}
    </div>
  );
}
