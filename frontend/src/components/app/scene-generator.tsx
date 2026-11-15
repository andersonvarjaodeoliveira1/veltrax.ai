"use client";

// AntiGravity (Fase 2): transforma a copy aprovada em CENAS organizadas por beat
// (Hook → Retenção → CTA), com o prompt de cada cena pronto para o Flow.
// O "cérebro" roda no backend (copy_to_blocks); aqui é só entrada + exibição.
import { ClipboardCopy, Clapperboard, Loader2, Wand2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { clearRecipe, readRecipe, type StoredRecipe } from "@/lib/winner-recipe";
import { SceneVariations } from "./scene-variations";

type Scene = {
  idx: number;
  text: string;
  beat_role: string;
  est_seconds: number;
  scene_prompt: string;
};

const TARGETS = [15, 30, 45, 60];

// Colapsa o beat granular no arco Hook → Retenção → CTA, para o rótulo na tela.
function beatLabel(role: string): { label: string; cls: string } {
  const r = (role || "none").toLowerCase();
  if (r === "hook") return { label: "Hook", cls: "bg-[#7B3FE4]/20 text-[#C9BBFA]" };
  if (r === "cta") return { label: "CTA", cls: "bg-[#4CC38A]/15 text-[#84E0B4]" };
  if (r === "none") return { label: "—", cls: "bg-white/10 text-white/50" };
  return { label: "Retenção", cls: "bg-white/10 text-white/70" };
}

export function SceneGenerator({ initialCopy = "" }: { initialCopy?: string }) {
  const [copy, setCopy] = useState(initialCopy);
  const [target, setTarget] = useState(30);
  const [loading, setLoading] = useState(false);
  const [scenes, setScenes] = useState<Scene[] | null>(null);
  const [summary, setSummary] = useState("");
  // Receita de um vencedor do ClipSpy (se o usuário clicou em "Modelar este vencedor").
  const [winner, setWinner] = useState<StoredRecipe | null>(null);

  useEffect(() => { setWinner(readRecipe()); }, []);

  function dropWinner() { clearRecipe(); setWinner(null); }

  async function generate() {
    if (copy.trim().length < 10) {
      toast.error("Cole uma copy com pelo menos uma frase.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/multiplier/scenes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ copy: copy.trim(), target_seconds: target, template: winner?.recipe ?? null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || data.error || "Falha ao gerar as cenas");
      setScenes(data.scenes || []);
      setSummary(data.summary || "");
      if (!data.scenes?.length) toast("A IA não gerou cenas para essa copy.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function copyPrompt(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Prompt da cena copiado");
    } catch {
      toast.error("Não consegui copiar");
    }
  }

  const totalSeconds = scenes?.reduce((s, c) => s + (c.est_seconds || 0), 0) ?? 0;

  return (
    <section className="space-y-4 rounded-[22px] border border-[#7B3FE4]/30 bg-[#19191b] p-6">
      <div className="flex items-center gap-2">
        <span className="inline-flex size-8 items-center justify-center rounded-full bg-[#7B3FE4]/20 text-[#C9BBFA]">
          <Clapperboard className="size-4" />
        </span>
        <div>
          <h3 className="text-base font-semibold text-white">Gerar cenas (AntiGravity)</h3>
          <p className="text-xs text-white/50">Vira sua copy em cenas organizadas por beat, com o prompt pronto pro Flow.</p>
        </div>
      </div>

      {winner && (
        <div className="flex flex-wrap items-center gap-2 rounded-[12px] border border-white/10 bg-white/[0.04] px-3 py-2">
          <span className="text-xs text-white/80">Modelando a estrutura do texto de: <span className="font-medium text-white">{winner.advertiser || "vencedor do ClipSpy"}</span></span>
          <span className="text-[11px] text-white/45">{winner.recipe.beats.map((b) => beatLabel(b.beat_role).label).join(" → ")}</span>
          <button type="button" onClick={dropWinner} className="ml-auto inline-flex items-center gap-1 rounded-full border border-white/15 px-2 py-1 text-[11px] text-white/70">
            <X className="size-3" /> Usar estrutura padrão
          </button>
        </div>
      )}

      <label className="block text-xs text-white/60">Copy aprovada</label>
      <textarea
        value={copy}
        onChange={(e) => setCopy(e.target.value)}
        rows={5}
        placeholder="Cole aqui a copy aprovada (hook + corpo + CTA)…"
        className="w-full resize-y rounded-[14px] border border-white/15 bg-black/30 px-4 py-3 text-sm text-white outline-none"
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-white/60">Duração alvo</span>
          <div className="inline-flex rounded-full border border-white/10 bg-white/[0.03] p-1">
            {TARGETS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTarget(t)}
                className={`rounded-full px-3 py-1 text-xs ${target === t ? "bg-white/10 text-white" : "text-white/55"}`}
              >
                {t}s
              </button>
            ))}
          </div>
        </div>
        <Button type="button" onClick={generate} disabled={loading} className="ml-auto gap-2 bg-gradient-to-br from-[#8B5CF6] to-[#7B3FE4]">
          {loading ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />} Gerar cenas
        </Button>
      </div>

      {scenes && (
        scenes.length === 0 ? (
          <p className="text-sm text-white/60">A IA não gerou cenas para essa copy. Tente uma copy mais completa.</p>
        ) : (
          <div className="space-y-2">
            {summary && <p className="text-xs text-white/50">{summary} · {scenes.length} cenas · ~{Math.round(totalSeconds)}s</p>}
            {scenes.map((s) => {
              const beat = beatLabel(s.beat_role);
              return (
                <div key={s.idx} className="rounded-[14px] border border-white/10 bg-[#1f1f22] p-3">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-[11px] font-medium text-white/40">#{s.idx + 1}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${beat.cls}`}>{beat.label}</span>
                    <span className="ml-auto text-[11px] text-white/40">~{s.est_seconds}s</span>
                  </div>
                  <p className="text-sm text-white/85">{s.text}</p>
                  {s.scene_prompt && (
                    <div className="mt-2 flex items-start gap-2 rounded-[10px] border border-white/10 bg-black/30 p-2">
                      <p className="flex-1 text-xs text-white/60">🎬 {s.scene_prompt}</p>
                      <button
                        type="button"
                        onClick={() => copyPrompt(s.scene_prompt)}
                        className="inline-flex items-center gap-1 rounded-full border border-white/15 px-2 py-1 text-[11px] text-white/70"
                      >
                        <ClipboardCopy className="size-3" /> Copiar
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
            {scenes.some((s) => s.scene_prompt) ? <SceneVariations scenes={scenes.filter((s) => s.scene_prompt)} /> : null}
          </div>
        )
      )}
    </section>
  );
}
