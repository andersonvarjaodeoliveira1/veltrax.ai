"use client";

// Analisar página: mostra os posts públicos de uma Página do Facebook com as reações, os comentários e os
// compartilhamentos de cada um, para ver qual formato rende mais e guardar como referência.
// Os dados vêm da Graph API oficial. Página de terceiros depende de a Meta aprovar o Page Public Content Access.
import { Bookmark, ExternalLink, Loader2, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { clipspy, isStandout, sortPosts, type PageAnalysis, type PagePost, type PostOrder } from "@/lib/clipspy";

const ORDERS: [PostOrder, string][] = [
  ["engajamento", "Ordenar por engajamento"],
  ["recentes", "Mais recentes primeiro"],
  ["comentarios", "Mais comentados"],
  ["compartilhamentos", "Mais compartilhados"],
];
const count = (value: number) => value.toLocaleString("pt-BR");
const plural = (value: number, one: string, many: string) => `${count(value)} ${value === 1 ? one : many}`;

function when(iso: string) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" });
}

function PostCard({ post, average, saved, busy, onSave }: { post: PagePost; average: number; saved: boolean; busy: boolean; onSave: () => void }) {
  return (
    <li className="flex gap-3 rounded-[14px] border border-white/10 bg-[#1a191d] p-3">
      {post.picture ? (
        // eslint-disable-next-line @next/next/no-img-element -- imagem pública do post, servida pelo Facebook
        <img src={post.picture} alt="" loading="lazy" referrerPolicy="no-referrer" className="size-20 shrink-0 rounded-[10px] object-cover" />
      ) : null}
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-white/50">
          <span>{post.kind}</span>
          <span>{when(post.created_at)}</span>
          {isStandout(post, average) ? <span className="rounded-full bg-white/10 px-2 py-0.5 text-white/85">Acima da média da página</span> : null}
        </p>
        <p className="mt-1 line-clamp-3 text-sm text-white/85">{post.text || "Post sem texto"}</p>
        <p className="mt-2 text-xs tabular-nums text-white/70">
          {plural(post.reactions, "reação", "reações")}, {plural(post.comments, "comentário", "comentários")}, {plural(post.shares, "compartilhamento", "compartilhamentos")}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" disabled={busy || saved || !post.link} onClick={onSave}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-white/15 px-3 text-xs text-white/85 hover:bg-white/5 disabled:opacity-60">
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Bookmark className="size-3.5" />} {saved ? "Referência salva" : "Salvar referência"}
          </button>
          {post.link ? (
            <a href={post.link} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-xs text-white/60 hover:text-white">
              <ExternalLink className="size-3.5" /> Abrir o post
            </a>
          ) : null}
        </div>
      </div>
    </li>
  );
}

export function PageAnalysisView({ onSaved, onOpenLibrary }: { onSaved: () => void; onOpenLibrary: () => void }) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PageAnalysis | null>(null);
  const [error, setError] = useState("");
  const [order, setOrder] = useState<PostOrder>("engajamento");
  const [connected, setConnected] = useState<{ id: string; name: string }[]>([]);
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [savingId, setSavingId] = useState("");

  useEffect(() => {
    let alive = true;
    clipspy.connectedPages().then((r) => { if (alive) setConnected(r.pages); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  async function analyze(page: string) {
    if (!page.trim() || loading) return;
    setLoading(true); setError(""); setSaved(new Set());
    try { setResult(await clipspy.analyzePage(page.trim())); }
    catch (problem) { setResult(null); setError((problem as Error).message); }
    finally { setLoading(false); }
  }

  async function save(post: PagePost) {
    if (!result?.page) return;
    setSavingId(post.id);
    try {
      await clipspy.addReference({ link: post.link, text: post.text, advertiser: result.page.name, reactions: post.reactions, comments: post.comments, shares: post.shares });
      setSaved((current) => new Set(current).add(post.id));
      onSaved();
      toast.success("Referência salva na biblioteca", { action: { label: "Abrir a biblioteca", onClick: onOpenLibrary } });
    } catch (problem) { toast.error((problem as Error).message); } finally { setSavingId(""); }
  }

  const posts = useMemo(() => sortPosts(result?.posts ?? [], order), [result, order]);
  const average = result?.summary?.average ?? 0;
  const quick = connected.length ? (
    <div className="mt-3">
      <p className="text-xs text-white/60">Suas páginas conectadas</p>
      <div className="mt-1.5 flex flex-wrap gap-2">
        {connected.map((p) => (
          <button key={p.id} type="button" disabled={loading} onClick={() => { setQuery(p.name); void analyze(p.id); }}
            className="min-h-9 rounded-full border border-white/15 px-3 text-xs text-white/85 hover:bg-white/5 disabled:opacity-60">{p.name}</button>
        ))}
      </div>
    </div>
  ) : null;

  return (
    <div className="space-y-3">
      <div className="rounded-[18px] border border-white/10 bg-[#1a191d] p-4">
        <label htmlFor="page-analysis-input" className="mb-1 block text-xs text-white/60">Página do Facebook (nome ou endereço)</label>
        <div className="flex flex-wrap gap-2">
          <input id="page-analysis-input" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void analyze(query); }}
            placeholder="Ex.: facebook.com/nomedapagina" autoComplete="off"
            className="min-w-0 flex-1 rounded-full border border-white/15 bg-black/30 px-4 py-2 text-sm text-white outline-none placeholder:text-white/35" />
          <button type="button" disabled={loading || !query.trim()} onClick={() => void analyze(query)}
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[#8B5CF6] to-[#7B3FE4] px-5 py-2 text-sm font-semibold text-white disabled:opacity-60">
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />} Analisar página
          </button>
        </div>
        <p className="mt-2 text-[11px] text-white/40">Lê só o que é público na página: os posts e os totais de reações, comentários e compartilhamentos, pela API oficial do Facebook. Perfil pessoal não é lido.</p>
        {quick}
      </div>

      {error ? <p role="alert" className="rounded-[14px] border border-[#E5484D]/30 bg-[#E5484D]/10 p-4 text-sm text-white/85">{error}</p> : null}

      {result?.blocked ? (
        <div className="rounded-[14px] border border-[#F5B454]/30 bg-[#F5B454]/10 p-4">
          <p className="text-sm text-white/85">{result.blocked}</p>
          {connected.length ? <p className="mt-2 text-xs text-white/60">Escolha uma das suas páginas conectadas acima para analisar agora.</p> : null}
        </div>
      ) : null}

      {result?.candidates ? (
        result.candidates.length ? (
          <div className="rounded-[14px] border border-white/10 bg-[#1a191d] p-3">
            <p className="text-xs text-white/60">Páginas encontradas para “{result.query}”. Escolha uma.</p>
            <ul className="mt-2 divide-y divide-white/10">
              {result.candidates.map((c) => (
                <li key={c.id}>
                  <button type="button" disabled={loading} onClick={() => { setQuery(c.name); void analyze(c.id); }} className="flex min-h-11 w-full items-center gap-3 py-2 text-left hover:bg-white/5 disabled:opacity-60">
                    {c.picture ? (
                      // eslint-disable-next-line @next/next/no-img-element -- foto pública da página
                      <img src={c.picture} alt="" referrerPolicy="no-referrer" className="size-8 rounded-full object-cover" />
                    ) : <span className="size-8 rounded-full bg-white/10" />}
                    <span className="min-w-0 flex-1 truncate text-sm text-white/85">{c.name}{c.verified ? " (verificada)" : ""}</span>
                    <span className="text-xs tabular-nums text-white/50">{plural(c.followers, "curtida", "curtidas")}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : <p className="text-sm text-white/60">Nenhuma página pública com esse nome. Cole o endereço da página para ir direto.</p>
      ) : null}

      {result?.page ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3 rounded-[14px] border border-white/10 bg-[#1a191d] p-3">
            {result.page.picture ? (
              // eslint-disable-next-line @next/next/no-img-element -- foto pública da página
              <img src={result.page.picture} alt="" referrerPolicy="no-referrer" className="size-11 rounded-full object-cover" />
            ) : null}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">{result.page.name}</p>
              <p className="text-xs tabular-nums text-white/60">
                {[result.page.category, plural(result.page.followers, "seguidor", "seguidores")].filter(Boolean).join(", ")}
              </p>
            </div>
            <a href={result.page.link} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-white/15 px-3 text-xs text-white/85 hover:bg-white/5">
              <ExternalLink className="size-3.5" /> Abrir no Facebook
            </a>
          </div>

          {posts.length ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs tabular-nums text-white/60">
                  {plural(posts.length, "post lido", "posts lidos")}, engajamento típico de {count(average)} por post
                  {result.summary?.standouts ? `, ${plural(result.summary.standouts, "post acima", "posts acima")} de 3 vezes isso` : ""}
                </p>
                <label className="flex items-center gap-2 text-xs text-white/60">
                  <span className="sr-only">Ordem dos posts</span>
                  <select value={order} onChange={(e) => setOrder(e.target.value as PostOrder)} className="min-h-9 rounded-full border border-white/15 bg-[#1a191d] px-3 text-xs text-white">
                    {ORDERS.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
                  </select>
                </label>
              </div>
              <ul className="grid gap-3 md:grid-cols-2">
                {posts.map((post) => <PostCard key={post.id} post={post} average={average} saved={saved.has(post.id)} busy={savingId === post.id} onSave={() => void save(post)} />)}
              </ul>
            </>
          ) : <p className="text-sm text-white/60">Essa página ainda não tem posts públicos para ler. Publique o primeiro e analise de novo.</p>}
        </div>
      ) : null}
    </div>
  );
}
