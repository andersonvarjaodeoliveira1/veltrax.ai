// Módulo Facebook (em construção, só administradores).
// Duas pontas: a API do ClipGringa (/api/facebook/...) e o conector local no computador da pessoa
// (http://localhost:3790), que lê e abre os perfis do Dolphin, AdsPower e DICloak.

export type AccountStatus = "ativa" | "confirmacao" | "restricao" | "bloqueada";
export type FbEvent = { id: string; actor: "app" | "voce" | "claude"; text: string; created_at: string };
export type FbAccount = {
  id: string; provider: string; external_id: string; name: string; proxy: string; email: string;
  account_created_on: string | null; age: string; status: AccountStatus; status_reason: string; status_changed_at: string | null;
  notes: string; pages: number; events: FbEvent[]; protection: Protection;
};
// Onde a conta abre e como está protegida
export type Protection = "navegador" | "antidetect_proxy" | "antidetect";
export const PROTECTION_TEXT: Record<Protection, string> = {
  antidetect_proxy: "Antidetect com proxy",
  antidetect: "Antidetect sem proxy",
  navegador: "Navegador comum",
};
export const PROVIDER_TEXT: Record<string, string> = {
  manual: "Navegador comum", dolphin: "Dolphin", adspower: "AdsPower", dicloak: "DICloak", multilogin: "Multilogin",
};
export type FbTodo = { id: string; text: string; done_at: string | null };
export type FbPage = {
  id: string; account_id: string | null; account_name: string | null; name: string; link: string; niche: string; language: string;
  status: "ativa" | "restricao" | "bloqueada"; has_photo: boolean; has_cover: boolean; posts_per_day: number;
  meta_connected: boolean; meta_error: string | null; published: number; upcoming: number; failed: number;
  next_at: string | null; until_at: string | null; todos: FbTodo[]; events: FbEvent[];
  ideas: FbIdea[]; plan_seed: number; meta_page_id: string | null;
  // nossos registros: posts normais (texto e imagem), vídeos com CTA (Vídeo orgânico), cortes e vídeos feitos à mão
  posts_normal: number; videos_cta: number; videos_cut: number; videos_manual: number;
  // lidos do Facebook quando a página está conectada
  fb_followers: number | null; fb_posts_normal: number | null; fb_posts_video: number | null; fb_scheduled: number | null; fb_synced_at: string | null;
};
/** Números de uma página: os do Facebook quando existem, senão os registrados aqui. */
export function pageNumbers(p: FbPage) {
  const synced = p.fb_synced_at !== null && p.fb_posts_normal !== null;
  const clip = p.videos_cta + p.videos_cut;
  return {
    synced,
    normal: synced ? (p.fb_posts_normal ?? 0) : p.posts_normal,
    videos: synced ? (p.fb_posts_video ?? 0) : clip + p.videos_manual,
    cta: p.videos_cta, cuts: p.videos_cut,
    scheduled: Math.max(p.upcoming, synced ? (p.fb_scheduled ?? 0) : 0),
    followers: p.fb_followers,
  };
}
export type FbIdea = { id: string; title: string; script: string; caption: string; used: boolean };
export type FbVideo = { id: string; source: "final" | "flow"; title: string; duration: number | null; created_at: string | null; used_in: string | null };
export type FbClip = { id: string; task_id: string; hook_title: string | null; duration: number; virality_score: number | null; source_title: string | null; used_in: string | null };
export type FbPost = { id: string; kind: "video" | "texto" | "imagem"; source: "corte" | "organico" | "manual"; title: string; caption: string; scheduled_at: string; status: "pendente" | "agendado" | "publicado" | "falhou"; error: string | null };

async function call<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const response = await fetch(`/api/facebook/${path}`, {
    method: init?.method ?? "GET",
    cache: "no-store",
    headers: init?.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const data = (await response.json().catch(() => ({}))) as T & { detail?: string };
  if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Não foi possível concluir. Tente de novo.");
  return data;
}

export type MetaProfile = { id: string; name: string; pages: number; connected_at: string | null };
export type MetaStatus = { configured: boolean; profiles: MetaProfile[] };
export type MapResult = { name?: string; conectadas: string[]; novas: string[]; sem_permissao: string[]; expirados?: string[] };
export type CalendarPost = { id: string; page_id: string; page_name: string; kind: string; source: string; title: string; scheduled_at: string; status: FbPost["status"] };
export type FbComment = { id: string; from_name: string; message: string; keyword: string; product: string; commented_at: string | null; page_id: string; page_name: string; account_name: string | null;
  dm_status?: "" | "enviada" | "falhou"; dm_error?: string };
export type CommentsData = { total: number; products: Array<{ product: string; keyword: string; total: number; people: number }>; comments: FbComment[] };
export const metaCallbackUrl = () => `${window.location.origin}/facebook/meta`;

export const fb = {
  metaStatus: () => call<MetaStatus>("meta/status"),
  metaStart: () => call<{ url: string }>("meta/start", { method: "POST", body: { redirect_uri: metaCallbackUrl() } }),
  metaFinish: (code: string, state: string) => call<MapResult>("meta/finish", { method: "POST", body: { code, state, redirect_uri: metaCallbackUrl() } }),
  metaSync: () => call<MapResult>("meta/sync", { method: "POST", body: {} }),
  metaForget: (id: string) => call("meta/" + id, { method: "DELETE" }),
  calendar: (days = 7) => call<{ start: string; days: number; posts: CalendarPost[] }>(`calendar?days=${days}`),
  comments: () => call<CommentsData>("comments"),
  manualPosts: (pageId: string, kind: "texto" | "imagem" | "video", count: number) => call<{ registrados: number }>(`pages/${pageId}/posts/manual`, { method: "POST", body: { kind, count } }),
  postDone: (postId: string) => call(`posts/${postId}/done`, { method: "POST", body: {} }),
  postFileUrl: (postId: string) => `/api/facebook/posts/${postId}/file`,
  overview: () => call<{ accounts: FbAccount[]; pages: FbPage[] }>("overview"),
  syncAccounts: (provider: string, profiles: Array<{ external_id: string; name: string; proxy?: string; notes?: string }>) =>
    call<{ novas: number; atualizadas: number }>("accounts/sync", { method: "POST", body: { provider, profiles } }),
  addAccount: (body: { name: string; provider?: string; proxy?: string; email?: string; account_created_on?: string }) => call<{ id: string }>("accounts", { method: "POST", body }),
  updateAccount: (id: string, body: Record<string, unknown>) => call("accounts/" + id, { method: "PATCH", body }),
  removeAccount: (id: string) => call("accounts/" + id, { method: "DELETE" }),
  addPage: (body: Record<string, unknown>) => call<{ id: string }>("pages", { method: "POST", body }),
  updatePage: (id: string, body: Record<string, unknown>) => call("pages/" + id, { method: "PATCH", body }),
  removePage: (id: string) => call("pages/" + id, { method: "DELETE" }),
  connectMeta: (id: string, token: string) => call<{ page: string }>(`pages/${id}/meta`, { method: "POST", body: { token } }),
  getPageProfile: (id: string) => call<{ about: string; description: string; category: string }>(`pages/${id}/profile`),
  applyPageProfile: (id: string, body: { about?: string; description?: string }) => call<{ ok: boolean }>(`pages/${id}/profile`, { method: "POST", body }),
  disconnectMeta: (id: string) => call(`pages/${id}/meta`, { method: "DELETE" }),
  note: (id: string, text: string) => call(`pages/${id}/events`, { method: "POST", body: { text } }),
  addTodo: (id: string, text: string) => call(`pages/${id}/todos`, { method: "POST", body: { text } }),
  doneTodo: (id: string, done: boolean) => call("todos/" + id, { method: "PATCH", body: { done } }),
  clips: () => call<{ clips: FbClip[] }>("clips").then((r) => r.clips),
  library: () => call<{ clips: FbClip[]; videos: FbVideo[] }>("clips"),
  addClips: (pageId: string, clipIds: string[], videos: Array<{ id: string; source: string }> = []) =>
    call<{ agendados: number }>(`pages/${pageId}/clips`, { method: "POST", body: { clip_ids: clipIds, videos } }),
  ideas: (pageId: string) => call<{ ideas: FbIdea[] }>(`pages/${pageId}/ideas`, { method: "POST", body: {} }).then((r) => r.ideas),
  markIdea: (pageId: string, ideaId: string, body: { used?: boolean; remove?: boolean }) => call<{ ideas: FbIdea[] }>(`pages/${pageId}/ideas/${ideaId}`, { method: "PATCH", body }).then((r) => r.ideas),
  posts: (pageId: string) => call<{ posts: FbPost[] }>(`pages/${pageId}/posts`).then((r) => r.posts),
  removePost: (id: string) => call("posts/" + id, { method: "DELETE" }),
  publish: () => call<{ enviados: number; falharam: number }>("publish", { method: "POST", body: {} }),
  // Upload vai como multipart/form-data, então não passa pelo helper `call` (que manda JSON).
  applyPagePhotos: async (pageId: string, picture?: File, cover?: File, offsetY?: number): Promise<{ ok: boolean; feito: string[] }> => {
    const form = new FormData();
    if (picture) form.append("picture", picture);
    if (cover) form.append("cover", cover);
    if (offsetY !== undefined) form.append("offset_y", String(offsetY));
    const res = await fetch(`/api/facebook/pages/${pageId}/photos`, { method: "POST", body: form });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; feito?: string[]; detail?: string };
    if (!res.ok) throw new Error(data.detail || "Não deu para trocar as imagens");
    return { ok: !!data.ok, feito: data.feito ?? [] };
  },
};

// ---------- conector local ----------
export const CONNECTOR_URL = "http://localhost:3790";

async function local<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${CONNECTOR_URL}/api/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  const data = (await response.json().catch(() => ({}))) as T & { erro?: string };
  if (!response.ok) throw new Error(data.erro || "O conector recusou");
  return data;
}

export type LocalProfile = { id: string; nome: string; proxy: string; nota: string };
export type LocalQueue = { tarefa: string; terminada_em: string | null; parada?: boolean; itens: Array<{ id: string; nome: string; estado: "esperando" | "aberto" | "feito" | "pulado" | "erro" }> } | null;

export const connector = {
  status: () => local<{ adspower: boolean; navegador: string; navegador_nome: string }>("status"),
  dolphinProfiles: () => local<LocalProfile[]>("dolphin/perfis"),
  open: (id: string, navegador: string) => local("perfis/abrir", { id, navegador }),
  queue: () => local<LocalQueue>("fila"),
  startQueue: (tarefa: string, contas: Array<{ id: string; nome: string }>) => local("fila/criar", { tarefa, contas }),
  queueAction: (action: "terminei" | "pular" | "parar") => local("fila/" + action, {}),
};

export const STATUS_TEXT: Record<AccountStatus, string> = { ativa: "Ativa", confirmacao: "Pedindo confirmação", restricao: "Com restrição", bloqueada: "Bloqueada" };

export function brDateTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const date = d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });
  const time = d.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
  return `${date} ${time}`;
}

/** Link para o Vídeo orgânico já com o roteiro do tema e a página de destino. */
export function organicVideoUrl(page: Pick<FbPage, "id" | "language" | "name">, idea: Pick<FbIdea, "title" | "script"> & { caption?: string }): string {
  const q = new URLSearchParams({ roteiro: idea.script, idioma: page.language || "en", tema: idea.title, pagina: page.id, nome: page.name, legenda: idea.caption ?? "" });
  return `/automacao?${q.toString()}`;
}
