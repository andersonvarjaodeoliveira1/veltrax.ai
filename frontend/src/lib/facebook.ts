// Módulo Facebook (em construção, só administradores).
// Duas pontas: a API do ClipGringa (/api/facebook/...) e o conector local no computador da pessoa
// (http://localhost:3790), que lê e abre os perfis do Dolphin, AdsPower e DICloak.

export type AccountStatus = "ativa" | "confirmacao" | "restricao" | "bloqueada";
export type FbEvent = { id: string; actor: "app" | "voce" | "claude"; text: string; created_at: string };
export type FbAccount = {
  id: string; provider: string; external_id: string; name: string; proxy: string; email: string;
  account_created_on: string | null; age: string; status: AccountStatus; status_reason: string; status_changed_at: string | null;
  notes: string; pages: number; events: FbEvent[];
};
export type FbTodo = { id: string; text: string; done_at: string | null };
export type FbPage = {
  id: string; account_id: string | null; account_name: string | null; name: string; link: string; niche: string; language: string;
  status: "ativa" | "restricao" | "bloqueada"; has_photo: boolean; has_cover: boolean; posts_per_day: number;
  meta_connected: boolean; meta_error: string | null; published: number; upcoming: number; failed: number;
  next_at: string | null; until_at: string | null; todos: FbTodo[]; events: FbEvent[];
};
export type FbClip = { id: string; task_id: string; hook_title: string | null; duration: number; virality_score: number | null; source_title: string | null; used_in: string | null };
export type FbPost = { id: string; title: string; caption: string; scheduled_at: string; status: "pendente" | "agendado" | "publicado" | "falhou"; error: string | null };

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

export const fb = {
  overview: () => call<{ accounts: FbAccount[]; pages: FbPage[] }>("overview"),
  syncAccounts: (provider: string, profiles: Array<{ external_id: string; name: string; proxy?: string; notes?: string }>) =>
    call<{ novas: number; atualizadas: number }>("accounts/sync", { method: "POST", body: { provider, profiles } }),
  addAccount: (body: { name: string; proxy?: string; email?: string; account_created_on?: string }) => call<{ id: string }>("accounts", { method: "POST", body }),
  updateAccount: (id: string, body: Record<string, unknown>) => call("accounts/" + id, { method: "PATCH", body }),
  removeAccount: (id: string) => call("accounts/" + id, { method: "DELETE" }),
  addPage: (body: Record<string, unknown>) => call<{ id: string }>("pages", { method: "POST", body }),
  updatePage: (id: string, body: Record<string, unknown>) => call("pages/" + id, { method: "PATCH", body }),
  removePage: (id: string) => call("pages/" + id, { method: "DELETE" }),
  connectMeta: (id: string, token: string) => call<{ page: string }>(`pages/${id}/meta`, { method: "POST", body: { token } }),
  disconnectMeta: (id: string) => call(`pages/${id}/meta`, { method: "DELETE" }),
  note: (id: string, text: string) => call(`pages/${id}/events`, { method: "POST", body: { text } }),
  addTodo: (id: string, text: string) => call(`pages/${id}/todos`, { method: "POST", body: { text } }),
  doneTodo: (id: string, done: boolean) => call("todos/" + id, { method: "PATCH", body: { done } }),
  clips: () => call<{ clips: FbClip[] }>("clips").then((r) => r.clips),
  addClips: (pageId: string, clipIds: string[]) => call<{ agendados: number }>(`pages/${pageId}/clips`, { method: "POST", body: { clip_ids: clipIds } }),
  posts: (pageId: string) => call<{ posts: FbPost[] }>(`pages/${pageId}/posts`).then((r) => r.posts),
  removePost: (id: string) => call("posts/" + id, { method: "DELETE" }),
  publish: () => call<{ enviados: number; falharam: number }>("publish", { method: "POST", body: {} }),
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
