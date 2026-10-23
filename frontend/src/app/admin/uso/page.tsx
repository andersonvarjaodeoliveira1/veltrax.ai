"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BarChart3, Download, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { MemberAccess } from "@/components/admin/member-access";

type UserUsage = {
  id: string; email: string; name: string; created_at: string | null;
  tokens_in: number; tokens_out: number; tokens_in_30d: number; tokens_out_30d: number; tokens_own_key: number;
  calls: number; jobs: number; videos: number; clips: number;
  flow?: { connected: boolean; plan: string | null; credits: number | null; checked_at: string | null; disconnected_at: string | null };
  balance: { unlimited: boolean; granted: number | null; used: number; remaining: number | null; exhausted: boolean };
};
type Detail = {
  jobs: { id: string; status: string; total: number; done: number; created_at: string | null; videos: { index: number; label: string }[] }[];
  clips: { id: string; filename: string; duration: number; created_at: string | null; task_id: string }[];
  usage: { stage: string; model: string; input_tokens: number; output_tokens: number; own_key: boolean; created_at: string | null }[];
};

const fmt = new Intl.NumberFormat("pt-BR");
const when = (value: string | null) => (value ? new Date(value).toLocaleString("pt-BR") : "—");
const th = "px-4 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground";
const td = "px-4 py-2.5 text-sm tabular-nums";

export default function AdminUsagePage() {
  const [users, setUsers] = useState<UserUsage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<UserUsage | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/admin/usage", { cache: "no-store" });
        if (response.status === 403) { setError("Destrave o Admin (senha da conta) e volte aqui."); setUsers([]); return; }
        if (!response.ok) throw new Error();
        setUsers((await response.json()).users ?? []);
      } catch {
        setError("Não foi possível carregar o uso agora. Atualize a página.");
        setUsers([]);
      }
    })();
  }, [tick]);

  const [custom, setCustom] = useState<Record<string, string>>({});

  async function setTotal(userId: string, total: number) {
    try {
      const response = await fetch(`/api/admin/users/${userId}/tokens`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ set: total }) });
      if (!response.ok) throw new Error();
      const balance = await response.json();
      setUsers((current) => (current ?? []).map((u) => (u.id === userId ? { ...u, balance } : u)));
    } catch {
      setError("Não foi possível definir os tokens agora. Tente de novo.");
    }
  }

  async function addTokens(userId: string, amount: number) {
    try {
      const response = await fetch(`/api/admin/users/${userId}/tokens`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ add: amount }) });
      if (!response.ok) throw new Error();
      const balance = await response.json();
      setUsers((current) => (current ?? []).map((u) => (u.id === userId ? { ...u, balance } : u)));
    } catch {
      setError("Não foi possível liberar os tokens agora. Tente de novo.");
    }
  }

  async function show(user: UserUsage) {
    setOpen(user); setDetail(null); setLoading(true);
    try {
      const response = await fetch(`/api/admin/users/${user.id}/videos`, { cache: "no-store" });
      if (!response.ok) throw new Error();
      setDetail(await response.json());
    } catch {
      setError("Não foi possível abrir os vídeos desse usuário.");
    } finally {
      setLoading(false);
    }
  }

  const totalTokens = (users ?? []).reduce((sum, u) => sum + u.tokens_in + u.tokens_out, 0);

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-8">
      <PageHeader icon={BarChart3} title="Uso por usuário" description="Tokens de IA gastos nos textos da Automação e os vídeos gerados por cada pessoa."
        action={<Link href="/admin" className="inline-flex items-center rounded-full border border-border px-4 py-2 text-sm hover:text-foreground">Voltar ao Admin</Link>} />

      {error && <p role="alert" className="rounded-[14px] border border-[#F0466B]/40 bg-[#F0466B]/10 p-3 text-sm text-[#F0466B]">{error}</p>}

      <MemberAccess onDone={() => setTick((n) => n + 1)} />

      {users === null ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Carregando…</p>
      ) : (
        <section className="overflow-x-auto rounded-2xl border">
          <p className="border-b px-4 py-3 text-xs text-muted-foreground">Total de tokens de todos os usuários: <b className="text-foreground tabular-nums">{fmt.format(totalTokens)}</b>. “Chave própria” = tokens que saíram da chave do próprio usuário (não custam ao servidor).</p>
          <table className="min-w-full divide-y">
            <thead><tr>
              <th className={th}>Usuário</th><th className={th}>Tokens (total)</th><th className={th}>Últimos 30 dias</th><th className={th}>Chave própria</th><th className={th}>Saldo restante</th><th className={th}>Conta do Flow</th>
              <th className={th}>Vídeos montados</th><th className={th}>Cortes</th><th className={th} />
            </tr></thead>
            <tbody className="divide-y">
              {(users ?? []).map((user) => (
                <tr key={user.id} data-testid={`usage-${user.email}`}>
                  <td className={td}><span className="block font-medium">{user.email}</span><span className="text-xs text-muted-foreground">{user.calls} chamadas</span></td>
                  <td className={td}>{fmt.format(user.tokens_in + user.tokens_out)}<span className="block text-xs text-muted-foreground">entrada {fmt.format(user.tokens_in)} · saída {fmt.format(user.tokens_out)}</span></td>
                  <td className={td}>{fmt.format(user.tokens_in_30d + user.tokens_out_30d)}</td>
                  <td className={td}>{fmt.format(user.tokens_own_key)}</td>
                  <td className={td}>
                    {user.balance.unlimited ? <span className="text-muted-foreground">ilimitado</span> : (
                      <>
                        <span className={user.balance.exhausted ? "font-medium text-[#F0466B]" : ""}>{fmt.format(user.balance.remaining ?? 0)}</span>
                        <span className="block text-xs text-muted-foreground">de {fmt.format(user.balance.granted ?? 0)}</span>
                        <span className="mt-1 flex gap-1">
                          <input
                            type="number" min={0} step={10000} placeholder="tokens" aria-label={`Tokens para ${user.email}`}
                            value={custom[user.id] ?? ""} onChange={(event) => setCustom((current) => ({ ...current, [user.id]: event.target.value }))}
                            className="w-24 rounded-full border bg-background px-2 py-0.5 text-[11px]"
                          />
                          <button type="button" className="rounded-full border px-2 py-0.5 text-[11px] hover:bg-muted" disabled={!Number(custom[user.id])}
                            onClick={() => { void setTotal(user.id, Number(custom[user.id])); setCustom((current) => ({ ...current, [user.id]: "" })); }}>definir total</button>
                          {[100_000, 500_000].map((amount) => (
                            <button key={amount} type="button" className="rounded-full border px-2 py-0.5 text-[11px] hover:bg-muted" onClick={() => void addTokens(user.id, amount)}>+{fmt.format(amount)}</button>
                          ))}
                        </span>
                      </>
                    )}
                  </td>
                  <td className={td}>
                    {!user.flow?.checked_at ? <span className="text-muted-foreground">nunca conectou</span> : user.flow.connected ? (
                      <>
                        <span className="font-medium text-[#5BD69A]">● conectada</span>
                        <span className="block text-xs text-muted-foreground">{user.flow.plan ? `plano ${user.flow.plan}` : "plano não lido"}{user.flow.credits !== null ? ` · ${fmt.format(user.flow.credits)} créditos` : ""}</span>
                        <span className="block text-xs text-muted-foreground">visto {new Date(user.flow.checked_at).toLocaleString("pt-BR")}</span>
                      </>
                    ) : (
                      <>
                        <span className="font-medium text-[#F5B454]">● desconectada</span>
                        <span className="block text-xs text-muted-foreground">desde {new Date(user.flow.disconnected_at ?? user.flow.checked_at).toLocaleString("pt-BR")}</span>
                      </>
                    )}
                  </td>
                  <td className={td}>{user.videos}</td>
                  <td className={td}>{user.clips}</td>
                  <td className={td}><button type="button" className="underline" onClick={() => void show(user)}>Ver vídeos</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {open && (
        <section className="space-y-4 rounded-2xl border p-5" data-testid="usage-detail">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">{open.email}</h2>
            <button type="button" className="text-sm underline" onClick={() => { setOpen(null); setDetail(null); }}>Fechar</button>
          </div>
          {loading || !detail ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Abrindo…</p> : (
            <>
              <div className="space-y-2">
                <p className="text-sm font-medium">Vídeos montados na Automação</p>
                {detail.jobs.every((job) => job.videos.length === 0) && <p className="text-xs text-muted-foreground">Nenhum vídeo pronto guardado. Os arquivos ficam no servidor por um tempo limitado.</p>}
                {detail.jobs.filter((job) => job.videos.length > 0).map((job) => (
                  <div key={job.id} className="space-y-2 rounded-[14px] border p-3">
                    <p className="text-xs text-muted-foreground">{when(job.created_at)} · {job.done} de {job.total} prontos</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {job.videos.map((video) => (
                        <div key={video.index} className="space-y-1">
                          <video controls preload="none" className="w-full max-w-[220px] rounded-[12px] bg-black" src={`/api/admin/jobs/${job.id}/outputs/${video.index}`} />
                          <p className="flex items-center gap-2 text-xs">{video.label}
                            <a className="inline-flex items-center gap-1 underline" href={`/api/admin/jobs/${job.id}/outputs/${video.index}?download=true`}><Download className="size-3" /> baixar</a>
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">Cortes gerados</p>
                {detail.clips.length === 0 ? <p className="text-xs text-muted-foreground">Nenhum corte.</p> : (
                  <ul className="space-y-1 text-xs">{detail.clips.map((clip) => (
                    <li key={clip.id}><Link href={`/tasks/${clip.task_id}`} className="underline">{clip.filename}</Link> · {Math.round(clip.duration)}s · {when(clip.created_at)}</li>
                  ))}</ul>
                )}
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">Últimos gastos de tokens</p>
                {detail.usage.length === 0 ? <p className="text-xs text-muted-foreground">Nenhum gasto registrado ainda.</p> : (
                  <ul className="space-y-1 text-xs">{detail.usage.slice(0, 30).map((item, i) => (
                    <li key={i} className="tabular-nums">{when(item.created_at)} · {item.stage} · {item.model} · entrada {fmt.format(item.input_tokens)} / saída {fmt.format(item.output_tokens)}{item.own_key ? " · chave própria" : ""}</li>
                  ))}</ul>
                )}
              </div>
            </>
          )}
        </section>
      )}
    </main>
  );
}
