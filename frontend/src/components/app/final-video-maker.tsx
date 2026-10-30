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

/** Depois das cenas prontas no Flow: junta tudo, põe legenda e título e entrega o vídeo final. Cada item é um vídeo (as cenas já vêm na ordem); com vários itens vira um lote que sai um por vez. */
export type FinalItem = { label: string; videoIds: string[] };

export function FinalVideoMaker({ items, defaultTitle }: { items: FinalItem[]; defaultTitle?: string }) {
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState("hormozi");
  const [title, setTitle] = useState(defaultTitle ?? "");
  const [aspect, setAspect] = useState<"9:16" | "16:9">("9:16");
  const [speed, setSpeed] = useState(1);
  const [captions, setCaptions] = useState(true);
  const [silence, setSilence] = useState<"off" | "light" | "strong">("off");
  const [transition, setTransition] = useState<"none" | "fade" | "slide" | "dissolve">("none");
  const [denoise, setDenoise] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [finals, setFinals] = useState<(Final & { label: string })[]>([]);
  const timer = useRef(0);
  const finalsRef = useRef<(Final & { label: string })[]>([]);

  useEffect(() => () => window.clearInterval(timer.current), []);

  function poll() {
    window.clearInterval(timer.current);
    timer.current = window.setInterval(async () => {
      const pending = finalsRef.current.filter((item) => item.status === "processing");
      if (!pending.length) { window.clearInterval(timer.current); setBusy(false); return; }
      const updated = await Promise.all(pending.map(async (item) => {
        try {
          const response = await fetch(`/api/multiplier/final/${item.id}`, { cache: "no-store" });
          return response.ok ? { ...(await response.json() as Final), label: item.label } : item;
        } catch { return item; }
      }));
      setFinals((current) => {
        const next = current.map((item) => updated.find((u) => u.id === item.id) ?? item);
        finalsRef.current = next;
        if (!next.some((item) => item.status === "processing")) { window.clearInterval(timer.current); setBusy(false); }
        return next;
      });
    }, 2000);
  }

  async function create() {
    setBusy(true); setError(""); setFinals([]); finalsRef.current = [];
    const made: (Final & { label: string })[] = [];
    try {
      for (const item of items) {
        const response = await fetch("/api/multiplier/final", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ video_ids: item.videoIds, template: style, title: title.trim(), aspect, speed, captions, silence, transition, denoise }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          setError(response.status === 409 ? "Você já tem vídeos finais demais na fila ou chegou ao limite de 20 guardados. Espere terminar ou apague os antigos." : "Não consegui começar. Tente de novo.");
          break;
        }
        made.push({ id: data.id, status: "processing", step: "Na fila", error: null, warning: "", duration: null, label: item.label });
      }
    } catch {
      setError("Não consegui falar com o servidor. Tente de novo.");
    }
    finalsRef.current = made;
    setFinals(made);
    if (made.length) poll(); else setBusy(false);
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} data-testid="final-open"
        className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[#8B5CF6] to-[#7B3FE4] px-4 py-2 text-xs font-medium text-white">
        <Film className="size-3.5" />{items.length > 1 ? `Finalizar todos os ${items.length} vídeos` : "Finalizar vídeo (juntar, legenda e título)"}
      </button>
    );
  }

  return (
    <div data-testid="final-maker" className="space-y-3 rounded-[16px] border border-[#7B3FE4]/50 bg-black/20 p-4 text-sm">
      <p className="font-semibold">{items.length > 1 ? `Finalizar todos os ${items.length} vídeos` : "Finalizar vídeo"}</p>
      <p className="text-xs text-muted-foreground">{items.length > 1 ? `Cada um dos ${items.length} vídeos recebe as mesmas escolhas e sai um por vez.` : `Junto as ${items[0]?.videoIds.length ?? 0} cenas na ordem, escrevo a legenda do que é falado e coloco o título no começo.`} Você recebe vídeos prontos para postar.</p>
      {finals.length === 0 && (
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
          <fieldset className="space-y-1.5"><legend className="text-xs font-medium">5. Edição automática</legend>
            <p className="text-[11px] text-muted-foreground">Cortar pausas</p>
            <div className="flex flex-wrap gap-2">
              {([["off", "Não cortar"], ["light", "Leve (só pausas longas)"], ["strong", "Forte (vídeo bem seco)"]] as const).map(([v, label]) => (
                <button key={v} type="button" aria-pressed={silence === v} onClick={() => setSilence(v)}
                  className={`rounded-full border px-3 py-1 text-xs ${silence === v ? "border-[#7B3FE4] bg-[#7B3FE4]/25" : "border-border text-muted-foreground"}`}>{label}</button>
              ))}
            </div>
            <p className="pt-1 text-[11px] text-muted-foreground">Transição entre as cenas</p>
            <div className="flex flex-wrap gap-2">
              {([["none", "Sem transição"], ["fade", "Suave"], ["slide", "Deslizar"], ["dissolve", "Dissolver"]] as const).map(([v, label]) => (
                <button key={v} type="button" aria-pressed={transition === v} onClick={() => setTransition(v)}
                  className={`rounded-full border px-3 py-1 text-xs ${transition === v ? "border-[#7B3FE4] bg-[#7B3FE4]/25" : "border-border text-muted-foreground"}`}>{label}</button>
              ))}
            </div>
            <label className="flex items-center gap-2 pt-1 text-xs text-muted-foreground"><input type="checkbox" checked={denoise} onChange={(event) => setDenoise(event.target.checked)} />Limpar o ruído do áudio</label>
          </fieldset>
          {error && <p role="alert" className="text-xs text-[#F0466B]">{error}</p>}
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={() => void create()} className="rounded-full bg-gradient-to-br from-[#8B5CF6] to-[#7B3FE4] px-4 py-2 text-xs font-medium text-white disabled:opacity-60">Criar o vídeo final</button>
            <button type="button" onClick={() => setOpen(false)} className="rounded-full border border-border px-4 py-2 text-xs">Fechar</button>
          </div>
        </>
      )}
      {finals.length > 0 && (
        <div className="space-y-3">
          {finals.map((item) => (
            <div key={item.id} className="space-y-2 rounded-[12px] border border-white/10 p-3">
              {items.length > 1 && <p className="text-xs font-medium">{item.label}</p>}
              {item.status === "processing" && (
                <p role="status" className="flex items-center gap-2 text-xs"><Loader2 className="size-3.5 animate-spin" />{item.step || "Preparando"}… pode levar alguns minutos. Pode ficar nesta tela.</p>
              )}
              {item.status === "error" && <p role="alert" className="text-xs text-[#F0466B]">{item.error ?? "Não consegui montar o vídeo final."}</p>}
              {item.status === "done" && (
                <div className="space-y-2" data-testid="final-done">
                  <p className="text-xs font-medium text-[#5BD69A]">Pronto! Seu vídeo final{item.duration ? ` (${Math.round(item.duration)}s)` : ""}:</p>
                  {item.warning && <p className="text-xs text-[#F5B454]">{item.warning}</p>}
                  <video controls playsInline src={`/api/multiplier/final/${item.id}/file`} className="mx-auto max-h-[60vh] rounded-[12px] bg-black" aria-label={`Vídeo final ${item.label}`} />
                  <a href={`/api/multiplier/final/${item.id}/file?download=1`} download className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[#8B5CF6] to-[#7B3FE4] px-4 py-2 text-xs font-medium text-white"><Download className="size-3.5" />Baixar o vídeo</a>
                </div>
              )}
            </div>
          ))}
          {!busy && <button type="button" onClick={() => { setFinals([]); finalsRef.current = []; }} className="rounded-full border border-border px-4 py-2 text-xs">Fazer de outro jeito</button>}
        </div>
      )}
    </div>
  );
}
