// Cliente do ClipSpy (radar de criativos vencedores).
export type Creative = {
  id: string;
  source: string;
  external_id: string;
  advertiser: string;
  title: string;
  permalink: string;
  thumbnail: string;
  // hook, feeling e cta: anotações de quem assistiu a uma referência manual
  metrics: { run_days?: number; views?: number; likes?: number; reactions?: number; comments?: number; shares?: number; note?: string; hook?: string; feeling?: string; cta?: string };
  score: number;
  is_champion: boolean;
  term: string;
  status: string;
};

export type AdLibAccess = {
  status: "ok" | "novo" | "ausente" | "vencendo" | "expirado" | "sem_app" | "outro_app" | "falha_renovacao" | "erro";
  days_left: number | null;
  never_expires: boolean;
  auto: boolean;
  detail: string;
  // De onde veio o acesso em uso: "admin", "ambiente" ou "facebook: <perfil>".
  source?: string;
};
export type ClipSpyStatus = { configured: boolean; access?: AdLibAccess };

async function call<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(`/api/clipspy/${path}`, {
    method: init?.method ?? "GET",
    headers: init?.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { detail?: string; error?: string }).detail || (data as { error?: string }).error || "Falha no ClipSpy");
  return data as T;
}

export const clipspy = {
  // Diz se o servidor tem o token da Ad Library configurado (nunca devolve o valor).
  // Para o administrador vem também a validade e se a renovação automática está ligada.
  status: () => call<ClipSpyStatus>("status"),
  // Arquivo de referências manual: guarda um vídeo achado navegando, com o que a pessoa anotou.
  addReference: (body: { link: string; text: string; advertiser: string; views?: string; comments?: string | number; reactions?: number; shares?: number; hook?: string; feeling?: string; cta?: string; note?: string; champion?: boolean }) =>
    call<Creative>("references", { method: "POST", body }),
  // Analisar página: posts públicos de uma Página do Facebook com o engajamento público (Graph API oficial).
  analyzePage: (page: string) => call<PageAnalysis>("page-analysis", { method: "POST", body: { page } }),
  connectedPages: () => call<{ pages: { id: string; name: string }[] }>("page-analysis/pages"),
  // Confere agora a validade e renova se for hora (só administrador).
  checkAccess: () => call<ClipSpyStatus>("access/check", { method: "POST", body: {} }),
  search: (term: string, countries?: string[], limit?: number) =>
    call<{ results: Creative[]; count: number }>("search", { method: "POST", body: { term, countries, limit } }),
  bank: (opts?: { champion?: boolean; source?: string }) => {
    const q = new URLSearchParams();
    if (opts?.champion) q.set("champion", "1");
    if (opts?.source) q.set("source", opts.source);
    const qs = q.toString();
    return call<{ items: Creative[] }>(`bank${qs ? `?${qs}` : ""}`);
  },
  setStatus: (id: string, status: "novo" | "salvo" | "usado" | "arquivado") =>
    call<{ ok: boolean }>(`bank/${id}/status`, { method: "POST", body: { status } }),
  // Extrai a "receita" de beats do texto de um vencedor para modelar a copy.
  recipe: (id: string) =>
    call<{ advertiser: string; recipe: WinnerRecipe }>(`bank/${id}/recipe`, { method: "POST", body: {} }),
};

export type WinnerRecipe = {
  beats: { beat_role: string; weight: number }[];
  summary: string;
  // o que a pessoa anotou do vencedor (hook, sentimento, CTA), usado como direção no Gerador de Cenas
  notes?: { hook?: string; feeling?: string; cta?: string };
};

export type PagePost = {
  id: string; text: string; created_at: string; link: string; picture: string; kind: string;
  reactions: number; comments: number; shares: number; engagement: number;
};
export type PageCandidate = { id: string; name: string; link: string; followers: number; verified: boolean; picture: string };
// Uma das três respostas: a análise, uma lista de páginas para escolher, ou o aviso de que a Meta ainda não liberou.
export type PageAnalysis = {
  page?: { id: string; name: string; link: string; followers: number; category: string; picture: string };
  posts?: PagePost[];
  summary?: { posts: number; average: number; standouts: number };
  via?: "conectada" | "publica";
  candidates?: PageCandidate[];
  query?: string;
  blocked?: string;
  connected?: string[];
};

export type PostOrder = "engajamento" | "recentes" | "comentarios" | "compartilhamentos";
/** Ordena os posts da análise. Engajamento = reações + comentários + compartilhamentos. */
export function sortPosts(posts: PagePost[], order: PostOrder): PagePost[] {
  const key = ({ engajamento: "engagement", recentes: "created_at", comentarios: "comments", compartilhamentos: "shares" } as const)[order];
  return [...posts].sort((a, b) => (a[key] < b[key] ? 1 : a[key] > b[key] ? -1 : a.created_at < b.created_at ? 1 : -1));
}
/** Post que passa de 3 vezes o engajamento típico da página: o formato para olhar primeiro. */
export function isStandout(post: PagePost, average: number): boolean {
  return post.engagement >= 30 && post.engagement >= 3 * Math.max(1, average);
}
