"use client";

// ClipSpy — radar de criativos vencedores. Pesquisa anúncios ativos na Meta Ad Library
// por termo (os que estão rodando há mais tempo = prováveis vencedores) e guarda os
// escolhidos numa biblioteca interna para modelar depois na criação de vídeos.
import { Archive, Bookmark, ExternalLink, Loader2, Search, Star } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { clipspy, type Creative } from "@/lib/clipspy";

function runLabel(c: Creative) {
  const d = c.metrics?.run_days ?? 0;
  return d > 0 ? `${d} ${d === 1 ? "dia ativo" : "dias ativo"}` : "ativo";
}

// Deep-link para a Ad Library pública da Meta, já com o termo preenchido.
// country=ALL dá a visão global (sem filtrar país). O marcador cg=1 avisa a
// extensão que esta aba veio do ClipSpy, para ela fazer a rolagem suave — e
// não mexe quando o usuário abre a Ad Library por conta própria.
function adLibraryUrl(term: string) {
  const q = encodeURIComponent(term.trim());
  return (
    "https://www.facebook.com/ads/library/?active_status=active&ad_type=all" +
    `&country=ALL&q=${q}&search_type=keyword_unordered&media_type=all&cg=1`
  );
}

function Card({ c, onSave, onArchive, busy }: { c: Creative; onSave?: () => void; onArchive?: () => void; busy?: boolean }) {
  return (
    <div className="rounded-[14px] border border-white/10 bg-[#1a191d] p-3">
      <div className="mb-1 flex items-center gap-2">
        {c.is_champion && (
          <span className="inline-flex items-center gap-1 rounded-full bg-[#7B3FE4]/20 px-2 py-0.5 text-[11px] font-medium text-[#C9BBFA]">
            <Star className="size-3" /> Campeão
          </span>
        )}
        <span className="text-[11px] text-white/50">{runLabel(c)}</span>
        <span className="ml-auto text-[11px] text-white/40">{c.advertiser}</span>
      </div>
      <p className="line-clamp-3 text-sm text-white/85">{c.title || "(sem texto)"}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {c.permalink && (
          <a href={c.permalink} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-full border border-white/15 px-3 py-1 text-xs text-white/80">
            <ExternalLink className="size-3.5" /> Ver anúncio
          </a>
        )}
        {onSave && (
          <button type="button" disabled={busy} onClick={onSave}
            className="inline-flex items-center gap-1 rounded-full border border-white/15 px-3 py-1 text-xs disabled:opacity-60">
            <Bookmark className="size-3.5" /> {c.status === "salvo" ? "Salvo" : "Salvar"}
          </button>
        )}
        {onArchive && (
          <button type="button" disabled={busy} onClick={onArchive}
            className="inline-flex items-center gap-1 rounded-full border border-white/15 px-3 py-1 text-xs text-white/60 disabled:opacity-60">
            <Archive className="size-3.5" /> Arquivar
          </button>
        )}
      </div>
    </div>
  );
}

export function ClipSpyPanel() {
  const [view, setView] = useState<"buscar" | "biblioteca">("buscar");
  const [term, setTerm] = useState("");
  const [countries, setCountries] = useState("DE, FR, IT, ES, NL, PT");
  const [results, setResults] = useState<Creative[] | null>(null);
  const [library, setLibrary] = useState<Creative[] | null>(null);
  const [onlyChampions, setOnlyChampions] = useState(true);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function run() {
    if (term.trim().length < 2) { toast.error("Digite um termo de busca"); return; }
    // Abre a Ad Library global ANTES de qualquer await, ainda dentro do clique,
    // para o navegador não tratar como popup e bloquear a aba.
    window.open(adLibraryUrl(term), "_blank", "noopener,noreferrer");
    setLoading(true);
    try {
      const cs = countries.split(",").map((s) => s.trim()).filter(Boolean);
      const { results } = await clipspy.search(term.trim(), cs, 30);
      setResults(results);
      if (!results.length) toast("Nada ativo encontrado para esse termo nesses países.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (view !== "biblioteca") return;
    let alive = true;
    clipspy.bank({ champion: onlyChampions })
      .then((r) => { if (alive) setLibrary(r.items); })
      .catch((e) => toast.error((e as Error).message));
    return () => { alive = false; };
  }, [view, onlyChampions]);

  async function save(c: Creative) {
    setBusyId(c.id);
    try { await clipspy.setStatus(c.id, "salvo"); setResults((r) => (r ?? []).map((x) => x.id === c.id ? { ...x, status: "salvo" } : x)); toast.success("Salvo na biblioteca"); }
    catch (e) { toast.error((e as Error).message); } finally { setBusyId(null); }
  }
  async function archive(c: Creative) {
    setBusyId(c.id);
    try { await clipspy.setStatus(c.id, "arquivado"); setLibrary((l) => (l ?? []).filter((x) => x.id !== c.id)); }
    catch (e) { toast.error((e as Error).message); } finally { setBusyId(null); }
  }

  return (
    <div className="space-y-4">
      <div className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] p-1">
        <button type="button" onClick={() => setView("buscar")} className={`rounded-full px-4 py-1.5 text-sm ${view === "buscar" ? "bg-white/10 text-white" : "text-white/60"}`}>Pesquisar</button>
        <button type="button" onClick={() => setView("biblioteca")} className={`rounded-full px-4 py-1.5 text-sm ${view === "biblioteca" ? "bg-white/10 text-white" : "text-white/60"}`}>Biblioteca</button>
      </div>

      {view === "buscar" ? (
        <div className="space-y-3">
          <div className="rounded-[18px] border border-white/10 bg-[#1a191d] p-4">
            <label className="mb-1 block text-xs text-white/60">Termo de busca (nicho, produto, ângulo)</label>
            <div className="flex flex-wrap gap-2">
              <input value={term} onChange={(e) => setTerm(e.target.value)} onKeyDown={(e) => e.key === "Enter" && run()}
                placeholder="Ex.: emagrecimento, baking soda, parenting"
                className="min-w-0 flex-1 rounded-full border border-white/15 bg-black/30 px-4 py-2 text-sm text-white outline-none" />
              <button type="button" disabled={loading} onClick={run}
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[#8B5CF6] to-[#7B3FE4] px-5 py-2 text-sm font-semibold text-white disabled:opacity-60">
                {loading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />} Pesquisar
              </button>
            </div>
            <label className="mt-3 block text-xs text-white/60">Países (a UE tem a cobertura comercial mais completa)</label>
            <input value={countries} onChange={(e) => setCountries(e.target.value)}
              className="mt-1 w-full rounded-full border border-white/15 bg-black/30 px-4 py-1.5 text-xs text-white/80 outline-none" />
            <p className="mt-2 text-[11px] text-white/40">Ao pesquisar, abre a Ad Library da Meta numa nova aba (visão global) e guarda os vencedores aqui na sua biblioteca. Mostra anúncios ainda ativos, dos que rodam há mais tempo (prováveis vencedores) para os mais novos.</p>
          </div>

          {results && (
            results.length === 0 ? <p className="text-sm text-white/60">Nada ativo para esse termo nesses países. Tente outro termo ou inclua países da UE.</p> :
            <div className="grid gap-3 md:grid-cols-2">
              {results.map((c) => <Card key={c.id} c={c} onSave={() => save(c)} busy={busyId === c.id} />)}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-xs text-white/70">
            <input type="checkbox" checked={onlyChampions} onChange={(e) => setOnlyChampions(e.target.checked)} /> Só os campeões
          </label>
          {library === null ? <p className="text-sm text-white/50">Carregando…</p> :
            library.length === 0 ? <p className="text-sm text-white/60">Sua biblioteca está vazia. Pesquise um termo e salve os vencedores.</p> :
            <div className="grid gap-3 md:grid-cols-2">
              {library.map((c) => <Card key={c.id} c={c} onArchive={() => archive(c)} busy={busyId === c.id} />)}
            </div>
          }
        </div>
      )}
    </div>
  );
}
