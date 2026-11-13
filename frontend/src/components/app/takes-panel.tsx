"use client";

// Takes de um vídeo final: gera os cortes inteligentes (IA encaixada nas cenas do Flow),
// une tudo num arquivo final e abre um popup para baixar agora ou depois.
// Também deixa revisar/editar a headline de cada take e agendar na página escolhida.
import { Download, Loader2, Scissors, X } from "lucide-react";
import { useState } from "react";
import type { FacebookTarget } from "@/lib/facebook-target";

type Take = {
  id: string;
  idx: number;
  hook_title: string | null;
  duration: number;
  score: number;
};

type Phase = "idle" | "generating" | "merging";

export function TakesPanel({ finalId, target }: { finalId: string; target: FacebookTarget | null }) {
  const [takes, setTakes] = useState<Take[] | null>(null);
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [phase, setPhase] = useState<Phase>("idle");
  const [merged, setMerged] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [scheduled, setScheduled] = useState(false);
  const [error, setError] = useState("");

  const mergeFileUrl = `/api/multiplier/final/${finalId}/takes/merge/file?download=1`;

  // Encadeia: gera os takes -> une num arquivo só -> abre o popup de download.
  // Se o merge falhar, os takes continuam disponíveis para revisar/agendar (o fluxo não trava).
  async function generateAndMerge() {
    setPhase("generating");
    setError("");
    setScheduled(false);
    setMerged(false);
    try {
      const res = await fetch(`/api/multiplier/final/${finalId}/takes`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { takes?: Take[]; detail?: string };
      if (!res.ok) throw new Error(data.detail || "Não consegui gerar os takes");
      const list = data.takes ?? [];
      setTakes(list);
      setTitles(Object.fromEntries(list.map((t) => [t.id, t.hook_title ?? ""])));
      if (!list.length) {
        setPhase("idle");
        return;
      }
      setPhase("merging");
      const mres = await fetch(`/api/multiplier/final/${finalId}/takes/merge`, { method: "POST" });
      const mdata = (await mres.json().catch(() => ({}))) as { ok?: boolean; detail?: string };
      if (!mres.ok) throw new Error(mdata.detail || "Não consegui unir os takes");
      setMerged(true);
      setShowModal(true);
      setPhase("idle");
    } catch (problem) {
      setError((problem as Error).message);
      setPhase("idle");
    }
  }

  function downloadMerged() {
    const a = document.createElement("a");
    a.href = mergeFileUrl;
    a.download = "takes-unidos.mp4";
    document.body.appendChild(a);
    a.click();
    a.remove();
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

  const busy = phase !== "idle";
  const busyLabel = phase === "generating" ? "Gerando os takes…" : phase === "merging" ? "Unindo os vídeos…" : "";

  if (takes === null) {
    return (
      <div className="space-y-1">
        <button
          type="button"
          disabled={busy}
          onClick={() => void generateAndMerge()}
          data-testid="takes-generate"
          className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-xs font-medium disabled:opacity-60"
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Scissors className="size-3.5" />}
          {busy ? busyLabel : "Gerar takes inteligentes"}
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
      <p className="text-xs font-medium">{takes.length === 1 ? "1 take" : `${takes.length} takes`}. Revise a headline{takes.length === 1 ? "" : " de cada um"}:</p>
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

      {busy && (
        <p role="status" className="flex items-center gap-2 text-xs text-white/70">
          <Loader2 className="size-3.5 animate-spin" /> {busyLabel}
        </p>
      )}

      {scheduled ? (
        <p role="status" className="text-xs text-[#5BD69A]">
          {takes.length === 1 ? "1 take entrou" : `${takes.length} takes entraram`} na agenda{target ? ` de ${target.pageName}` : ""}.{" "}
          <a href="/facebook?aba=paginas" className="underline">Ver a agenda</a>
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {merged && (
            <button
              type="button"
              onClick={downloadMerged}
              data-testid="takes-download-merged"
              className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-xs font-medium"
            >
              <Download className="size-3.5" /> Baixar vídeo unido
            </button>
          )}
          <button
            type="button"
            disabled={!target || scheduling || busy}
            onClick={() => void schedule()}
            data-testid="takes-schedule"
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[#8B5CF6] to-[#7B3FE4] px-4 py-2 text-xs font-medium text-white disabled:opacity-60"
          >
            {scheduling ? "Agendando…" : target ? `Agendar na agenda de ${target.pageName}` : "Escolha uma página acima"}
          </button>
          <button
            type="button"
            onClick={() => void generateAndMerge()}
            disabled={busy}
            className="rounded-full border border-white/15 px-3 py-2 text-xs disabled:opacity-60"
          >
            Gerar de novo
          </button>
        </div>
      )}
      {error && <p role="alert" className="text-xs text-[#F0466B]">{error}</p>}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label="Vídeo unido pronto">
          <div className="w-full max-w-sm space-y-4 rounded-[16px] border border-white/10 bg-[#1a191d] p-5">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-sm font-semibold">Seu vídeo unido está pronto</h3>
              <button type="button" aria-label="Fechar" onClick={() => setShowModal(false)} className="text-white/60 hover:text-white">
                <X className="size-4" />
              </button>
            </div>
            <p className="text-xs text-white/70">
              Juntei {takes.length === 1 ? "1 take" : `${takes.length} takes`} num arquivo só. Quer baixar agora ou deixar para depois?
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => { downloadMerged(); setShowModal(false); }}
                data-testid="takes-modal-download-now"
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[#8B5CF6] to-[#7B3FE4] px-4 py-2 text-xs font-medium text-white"
              >
                <Download className="size-3.5" /> Baixar agora
              </button>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                data-testid="takes-modal-download-later"
                className="rounded-full border border-white/15 px-4 py-2 text-xs font-medium"
              >
                Baixar depois
              </button>
            </div>
            <p className="text-[11px] text-white/40">
              Se escolher depois, o botão “Baixar vídeo unido” fica disponível aqui.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
