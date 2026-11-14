"use client";

// ClipSpy — radar de criativos vencedores. Pesquisa anúncios ativos na Meta Ad Library
// por termo (os que estão rodando há mais tempo = prováveis vencedores) e guarda os
// escolhidos numa biblioteca interna para modelar depois na criação de vídeos.
import { Archive, Bookmark, ExternalLink, KeyRound, Loader2, RefreshCw, Search, Star } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { clipspy, type Creative } from "@/lib/clipspy";

function runLabel(c: Creative) {
  const d = c.metrics?.run_days ?? 0;
  return d > 0 ? `${d} ${d === 1 ? "dia ativo" : "dias ativo"}` : "ativo";
}

// Deep-link para a Ad Library pública da Meta, já com o termo preenchido.
// country=ALL dá a visão global (sem filtrar país). O marcador cg=1 avisa a
// extensão que esta aba veio do ClipSpy, para ela fazer a rolagem suave — e
// não mexe quando o usuário abre a Ad Library por conta própria. Não depende
// de token: é só visualização.
function adLibraryUrl(term: string) {
  const q = encodeURIComponent(term.trim());
  return (
    "https://www.facebook.com/ads/library/?active_status=active&ad_type=all" +
    `&country=ALL&q=${q}&search_type=keyword_unordered&media_type=all&cg=1`
  );
}

// Uma falha de token (ausente/expirado/sem permissão) deve levar à tela de
// configuração, não a um toast de erro genérico.
function isConfigError(message: string) {
  const m = message.toLowerCase();
  return (
    m.includes("não configurada") ||
    m.includes("nao configurada") ||
    m.includes("permission") ||
    m.includes("permissão") ||
    m.includes("token") ||
    m.includes("oauth")
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

// Skeleton: placeholders animados enquanto a busca carrega.
function CardSkeleton() {
  return (
    <div className="animate-pulse rounded-[14px] border border-white/10 bg-[#1a191d] p-3">
      <div className="mb-2 flex items-center gap-2">
        <div className="h-4 w-20 rounded-full bg-white/10" />
        <div className="ml-auto h-3 w-24 rounded bg-white/10" />
      </div>
      <div className="space-y-2">
        <div className="h-3 w-full rounded bg-white/10" />
        <div className="h-3 w-5/6 rounded bg-white/10" />
        <div className="h-3 w-2/3 rounded bg-white/10" />
      </div>
      <div className="mt-3 flex gap-2">
        <div className="h-6 w-24 rounded-full bg-white/10" />
        <div className="h-6 w-20 rounded-full bg-white/10" />
      </div>
    </div>
  );
}

function ResultsSkeleton() {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)}
    </div>
  );
}

// Tela de configuração: aparece quando o servidor ainda não tem o token da
// Ad Library. Não há campo de token aqui de propósito — é um segredo de
// servidor e nunca passa pelo navegador. A visualização (deep-link) continua.
function ConfigScreen({ term, onRecheck, rechecking }: { term: string; onRecheck: () => void; rechecking: boolean }) {
  return (
    <div className="rounded-[18px] border border-[#7B3FE4]/30 bg-[#1a191d] p-5">
      <div className="mb-2 flex items-center gap-2">
        <span className="inline-flex size-8 items-center justify-center rounded-full bg-[#7B3FE4]/20 text-[#C9BBFA]">
          <KeyRound className="size-4" />
        </span>
        <h3 className="text-base font-semibold text-white">ClipSpy ainda não está configurado</h3>
      </div>
      <p className="text-sm text-white/70">
        A mineração automática usa a Ad Library API oficial da Meta, que precisa de um token no servidor.
        Por segurança, esse token fica só no servidor e nunca no navegador — então não dá para colá-lo aqui.
      </p>
      <div className="mt-3 rounded-[12px] border border-white/10 bg-black/30 p-3 text-sm text-white/70">
        <p className="mb-1 font-medium text-white/85">Para liberar (feito uma vez, no servidor):</p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Gere um token no Graph API Explorer do app ClipGringa com a permissão <span className="text-white/90">ads_read</span>.</li>
          <li>Garanta que o app esteja habilitado na Ad Library API (identidade confirmada e termos aceitos).</li>
          <li>Defina <span className="text-white/90">META_ADLIB_TOKEN</span> no ambiente do servidor e reinicie o backend.</li>
        </ol>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="button" onClick={onRecheck} disabled={rechecking}
          className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-1.5 text-sm text-white/80 disabled:opacity-60">
          {rechecking ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Já configurei, verificar de novo
        </button>
        {term.trim().length >= 2 && (
          <a href={adLibraryUrl(term)} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-1.5 text-sm text-white/80">
            <ExternalLink className="size-4" /> Abrir a Ad Library mesmo assim
          </a>
        )}
      </div>
      <p className="mt-3 text-[11px] text-white/40">
        Enquanto não configurar, a visualização na Ad Library (deep-link) funciona normalmente — só a biblioteca interna não é populada.
      </p>
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
  // null = ainda verificando; true/false = resposta do servidor.
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [rechecking, setRechecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkStatus = useCallback(async () => {
    try {
      const { configured } = await clipspy.status();
      setConfigured(configured);
      return configured;
    } catch {
      // Falha ao checar status não deve travar a tela: deixa o fluxo seguir e o
      // próprio search dirá se há problema de configuração.
      setConfigured(true);
      return true;
    }
  }, []);

  useEffect(() => { void checkStatus(); }, [checkStatus]);

  async function recheck() {
    setRechecking(true);
    const ok = await checkStatus();
    setRechecking(false);
    if (ok) toast.success("Token encontrado. ClipSpy liberado.");
    else toast("Ainda sem token no servidor.");
  }

  async function run() {
    if (term.trim().length < 2) { toast.error("Digite um termo de busca"); return; }
    // Abre a Ad Library global ANTES de qualquer await, ainda dentro do clique,
    // para o navegador não tratar como popup e bloquear a aba. Isso não depende
    // de token, então acontece mesmo quando a mineração está indisponível.
    window.open(adLibraryUrl(term), "_blank", "noopener,noreferrer");
    setLoading(true);
    setError(null);
    try {
      const cs = countries.split(",").map((s) => s.trim()).filter(Boolean);
      const { results } = await clipspy.search(term.trim(), cs, 30);
      setResults(results);
      if (!results.length) toast("Nada ativo encontrado para esse termo nesses países.");
    } catch (e) {
      const msg = (e as Error).message;
      if (isConfigError(msg)) {
        // Token ausente/expirado/sem permissão: manda para a tela de configuração.
        setConfigured(false);
        setResults(null);
      } else {
        setError(msg);
      }
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
        configured === false ? (
          <ConfigScreen term={term} onRecheck={recheck} rechecking={rechecking} />
        ) : (
        <div className="space-y-3">
          <div className="rounded-[18px] border border-white/10 bg-[#1a191d] p-4">
            <label className="mb-1 block text-xs text-white/60">Termo de busca (nicho, produto, ângulo)</label>
            <div className="flex flex-wrap gap-2">
              <input value={term} onChange={(e) => setTerm(e.target.value)} onKeyDown={(e) => e.key === "Enter" && run()}
                placeholder="Ex.: emagrecimento, baking soda, parenting"
                className="min-w-0 flex-1 rounded-full border border-white/15 bg-black/30 px-4 py-2 text-sm text-white outline-none" />
              <button type="button" disabled={loading || configured === null} onClick={run}
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[#8B5CF6] to-[#7B3FE4] px-5 py-2 text-sm font-semibold text-white disabled:opacity-60">
                {loading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />} Pesquisar
              </button>
            </div>
            <label className="mt-3 block text-xs text-white/60">Países (a UE tem a cobertura comercial mais completa)</label>
            <input value={countries} onChange={(e) => setCountries(e.target.value)}
              className="mt-1 w-full rounded-full border border-white/15 bg-black/30 px-4 py-1.5 text-xs text-white/80 outline-none" />
            <p className="mt-2 text-[11px] text-white/40">Ao pesquisar, abre a Ad Library da Meta numa nova aba (visão global) e guarda os vencedores aqui na sua biblioteca. Mostra anúncios ainda ativos, dos que rodam há mais tempo (prováveis vencedores) para os mais novos.</p>
          </div>

          {loading ? <ResultsSkeleton /> :
            error ? (
              <div className="rounded-[14px] border border-[#E5484D]/30 bg-[#E5484D]/10 p-4">
                <p className="text-sm text-white/85">Não consegui buscar agora: {error}</p>
                <button type="button" onClick={run}
                  className="mt-2 inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-1.5 text-sm text-white/80">
                  <RefreshCw className="size-4" /> Tentar de novo
                </button>
              </div>
            ) :
            results && (
              results.length === 0 ? <p className="text-sm text-white/60">Nada ativo para esse termo nesses países. Tente outro termo ou inclua países da UE.</p> :
              <div className="grid gap-3 md:grid-cols-2">
                {results.map((c) => <Card key={c.id} c={c} onSave={() => save(c)} busy={busyId === c.id} />)}
              </div>
            )
          }
        </div>
        )
      ) : (
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-xs text-white/70">
            <input type="checkbox" checked={onlyChampions} onChange={(e) => setOnlyChampions(e.target.checked)} /> Só os campeões
          </label>
          {library === null ? <ResultsSkeleton /> :
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
