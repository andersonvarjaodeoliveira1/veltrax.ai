// Cliente do ClipSpy (radar de criativos vencedores).
export type Creative = {
  id: string;
  source: string;
  external_id: string;
  advertiser: string;
  title: string;
  permalink: string;
  thumbnail: string;
  metrics: { run_days?: number; views?: number; likes?: number; comments?: number; shares?: number };
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
};
