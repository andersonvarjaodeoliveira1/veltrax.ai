"use client";

// Variações de um roteiro de cenas: o texto fica igual e cada variação troca uma coisa só
// (pessoa, roupa, ambiente ou quem aparece). Serve para repetir um formato que deu certo
// com arquivo novo em cada post, em vez de repostar o mesmo vídeo.
import { ClipboardCopy, Loader2, Shuffle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export type VariationScene = { idx: number; text: string; scene_prompt: string };
type Variant = { label: string; axis: string; scenes: VariationScene[] };

const AXES: Array<{ key: string; label: string }> = [
  { key: "pessoa", label: "Pessoa" },
  { key: "roupa", label: "Roupa" },
  { key: "ambiente", label: "Ambiente" },
  { key: "elenco", label: "Quem aparece" },
];
const COUNTS = [3, 5, 10];
const axisLabel = (key: string) => AXES.find((a) => a.key === key)?.label ?? key;

export function SceneVariations({ scenes }: { scenes: VariationScene[] }) {
  const [axes, setAxes] = useState<string[]>(["pessoa"]);
  const [count, setCount] = useState(5);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [variants, setVariants] = useState<Variant[] | null>(null);

  const toggle = (key: string) => setAxes((list) => (list.includes(key) ? list.filter((x) => x !== key) : [...list, key]));

  async function generate() {
    setLoading(true);
    try {
      const res = await fetch("/api/multiplier/scenes/variations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenes, count, axes, note: note.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || data.error || "Falha ao gerar as variações");
      setVariants(data.variants || []);
      if (!data.variants?.length) toast("A IA não devolveu variações diferentes do original. Tente outro eixo.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function copy(text: string, ok: string) {
    try { await navigator.clipboard.writeText(text); toast.success(ok); } catch { toast.error("Não consegui copiar"); }
  }

  return (
    <div className="space-y-3 rounded-[14px] border border-white/10 bg-black/20 p-4">
      <div>
        <h4 className="text-sm font-semibold text-white">Variações deste roteiro</h4>
        <p className="text-xs text-white/50">O texto fica igual. Cada variação troca uma coisa só, para virar um vídeo novo sem mudar o formato.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-white/60">Trocar</span>
        {AXES.map((a) => (
          <button key={a.key} type="button" aria-pressed={axes.includes(a.key)} onClick={() => toggle(a.key)}
            className={`rounded-full border px-3 py-1 text-xs ${axes.includes(a.key) ? "border-white/30 bg-white/10 text-white" : "border-white/10 text-white/55"}`}>
            {a.label}
          </button>
        ))}
        <span className="ml-2 text-xs text-white/60">Quantas</span>
        <div className="inline-flex rounded-full border border-white/10 bg-white/[0.03] p-1">
          {COUNTS.map((n) => (
            <button key={n} type="button" onClick={() => setCount(n)} className={`rounded-full px-3 py-1 text-xs ${count === n ? "bg-white/10 text-white" : "text-white/55"}`}>{n}</button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={400} aria-label="Observação para as variações"
          placeholder="Observação opcional. Ex.: manter a mesma faixa de idade"
          className="min-w-0 flex-1 rounded-full border border-white/15 bg-black/30 px-4 py-2 text-xs text-white outline-none" />
        <Button type="button" onClick={generate} disabled={loading || axes.length === 0} className="gap-2 bg-gradient-to-br from-[#8B5CF6] to-[#7B3FE4]">
          {loading ? <Loader2 className="size-4 animate-spin" /> : <Shuffle className="size-4" />} Gerar variações
        </Button>
      </div>
      {axes.length === 0 ? <p className="text-xs text-white/50">Escolha pelo menos uma coisa para trocar.</p> : null}

      {variants?.map((v, i) => (
        <details key={`${i}-${v.label}`} className="rounded-[12px] border border-white/10 bg-[#1f1f22] p-3" open={i === 0}>
          <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm text-white">
            <span className="text-[11px] font-medium text-white/40">#{i + 1}</span>
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-white/70">{axisLabel(v.axis)}</span>
            <span className="min-w-0 flex-1 truncate">{v.label}</span>
            <button type="button" onClick={(e) => { e.preventDefault(); void copy(v.scenes.map((s, n) => `Cena ${n + 1}: ${s.scene_prompt}`).join("\n\n"), "Prompts da variação copiados"); }}
              className="inline-flex items-center gap-1 rounded-full border border-white/15 px-2 py-1 text-[11px] text-white/70">
              <ClipboardCopy className="size-3" /> Copiar todos
            </button>
          </summary>
          <ol className="mt-2 space-y-2">
            {v.scenes.map((s) => (
              <li key={s.idx} className="flex items-start gap-2 rounded-[10px] border border-white/10 bg-black/30 p-2">
                <div className="min-w-0 flex-1">
                  {s.text ? <p className="text-xs text-white/45">{s.text}</p> : null}
                  <p className="text-xs text-white/75">{s.scene_prompt}</p>
                </div>
                <button type="button" onClick={() => void copy(s.scene_prompt, "Prompt da cena copiado")}
                  className="inline-flex items-center gap-1 rounded-full border border-white/15 px-2 py-1 text-[11px] text-white/70">
                  <ClipboardCopy className="size-3" /> Copiar
                </button>
              </li>
            ))}
          </ol>
        </details>
      ))}
    </div>
  );
}
