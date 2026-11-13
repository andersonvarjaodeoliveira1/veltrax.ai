"use client";

// Takes de um vídeo final: gera os cortes inteligentes (IA encaixada nas cenas do Flow),
// deixa revisar e editar a headline de cada um, e agenda tudo na página escolhida.
import { Loader2, Scissors } from "lucide-react";
import { useState } from "react";
import type { FacebookTarget } from "@/lib/facebook-target";

type Take = {
  id: string;
  idx: number;
  hook_title: string | null;
  duration: number;
  score: number;
};

export function TakesPanel({ finalId, target }: { finalId: string; target: FacebookTarget | null }) {
  const [takes, setTakes] = useState<Take[] | null>(null);
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [scheduled, setScheduled] = useState(false);
  const [error, setError] = useState("");

  async function generate() {
    setLoading(true);
    setError("");
    setScheduled(false);
    try {
      const res = await fetch(`/api/multiplier/final/${finalId}/takes`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { takes?: Take[]; detail?: string };
      if (!res.ok) throw new Error(data.detail || "Não consegui gerar os takes");
      setTakes(data.takes ?? []);
      setTitles(Object.fromEntries((data.takes ?? []).map((t) => [t.id, t.hook_title ?? ""])));
    } catch (problem) {
      setError((problem as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function saveTitle(take: Take) {
    const hook_title = (titles[take.id] ?? "").trim();
    if (hook_title === (take.hook_title ?? "")) return;
    try {
      await fetch(`/api/multiplier/final/${finalId}/takes/${take.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hook_title }),
      });
      setTakes((cur) => (cur ?? []).map((t) => (t.id === take.id ? { ...t, hook_title: hook_title || null } : t)));
    } catch {
      /* mantém o texto digitado; tenta de novo no próximo blur */
    }
  }

  async function schedule() {
    if (!target || !takes?.length) return;
    setScheduling(true);
    setError("");
    try {
      // salva as headlines pendentes antes de agendar
      await Promise.all(takes.map((t) => saveTitle(t)));
      const res = await fetch(`/api/facebook/pages/${target.pageId}/clips`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clip_ids: [],
          videos: takes.map((t) => ({ source: "take", id: t.id })),
          caption: target.caption,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { agendados?: number; detail?: string };
      if (!res.ok) throw new Error(data.detail || "Não consegui agendar os takes");
      setScheduled(true);
    } catch (problem) {
      setError((problem as Error).message);
    } finally {
      setScheduling(false);
    }
  }

  if (takes === null) {
    return (
      <div className="space-y-1">
        <button
          type="button"
          disabled={loading}
          onClick={() => void generate()}
          data-testid="takes-generate"
          className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-xs font-medium disabled:opacity-60"
        >
          {loading ? <Loader2 className="size-3.5 animate-spin" /> : <Scissors className="size-3.5" />}
          {loading ? "Gerando os takes…" : "Gerar takes inteligentes"}
        </button>
        {error && <p role="alert" className="text-xs text-[#F0466B]">{error}</p>}
      </div>
    );
  }

  if (takes.length === 0) {
    return <p className="text-xs text-white/70">A IA não achou trechos fortes o bastante para virar takes neste vídeo.</p>;
  }

  return (
    <div className="space-y-2 rounded-[12px] bg-white/[0.03] p-3" data-testid="takes-review">
      <p className="text-xs font-medium">{takes.length} takes. Revise a headline de cada um:</p>
      {takes.map((take, i) => (
        <div key={take.id} className="flex items-center gap-2">
          <span className="w-5 shrink-0 text-xs text-white/50">{i + 1}</span>
          <input
            value={titles[take.id] ?? ""}
            onChange={(e) => setTitles((cur) => ({ ...cur, [take.id]: e.target.value }))}
            onBlur={() => void saveTitle(take)}
            maxLength={200}
            placeholder="Headline do take"
            aria-label={`Headline do take ${i + 1}`}
            className="min-w-0 flex-1 rounded-md bg-white/5 px-3 py-1.5 text-sm outline-none ring-1 ring-white/10"
          />
          <span className="shrink-0 text-xs text-white/50">{Math.round(take.duration)}s</span>
        </div>
      ))}
      {scheduled ? (
        <p role="status" className="text-xs text-[#5BD69A]">
          {takes.length} takes entraram na agenda{target ? ` de ${target.pageName}` : ""}.{" "}
          <a href="/facebook?aba=paginas" className="underline">Ver a agenda</a>
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            type="button"
            disabled={!target || scheduling}
            onClick={() => void schedule()}
            data-testid="takes-schedule"
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[#8B5CF6] to-[#7B3FE4] px-4 py-2 text-xs font-medium text-white disabled:opacity-60"
          >
            {scheduling ? "Agendando…" : target ? `Agendar na agenda de ${target.pageName}` : "Escolha uma página acima"}
          </button>
          <button type="button" onClick={() => void generate()} disabled={loading} className="rounded-full border border-white/15 px-3 py-2 text-xs disabled:opacity-60">
            Gerar de novo
          </button>
        </div>
      )}
      {error && <p role="alert" className="text-xs text-[#F0466B]">{error}</p>}
    </div>
  );
}
