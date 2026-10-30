import prisma from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";

type Row = Record<string, unknown>;

async function safe<T = Row[]>(run: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await run();
  } catch {
    return fallback; // tabela ainda não existe neste ambiente
  }
}

const fmt = (d: unknown) => (d ? new Date(d as string).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—");
const num = (n: unknown) => Number(n ?? 0).toLocaleString("pt-BR");

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-0.5 text-sm font-medium">{children}</div>
    </div>
  );
}

/** Ficha da conta de um membro para o suporte: plano, IA conectada, Flow, uso e problemas recentes. */
export async function AccountDetails({ userId }: { userId: string }) {
  const [user, tasksByStatus, integrations, quota, usage, flow, videos, failed, lastTask] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        email: true, name: true, createdAt: true, plan: true, subscription_status: true, subscription_provider: true,
        billing_period_end: true, trial_ends_at: true, is_admin: true, emailVerified: true,
        acquisition: { select: { utm_source: true, ref: true, referrer_host: true, first_clip_exported_at: true } },
        sessions: { orderBy: { updatedAt: "desc" }, take: 1, select: { updatedAt: true } },
      },
    }),
    safe(() => prisma.$queryRaw<Row[]>`SELECT status, COUNT(*)::int AS n FROM tasks WHERE user_id = ${userId} GROUP BY status`, []),
    safe(() => prisma.$queryRaw<Row[]>`SELECT provider, hint, updated_at FROM user_integrations WHERE user_id = ${userId} ORDER BY provider`, []),
    safe(() => prisma.$queryRaw<Row[]>`SELECT granted FROM user_token_quota WHERE user_id = ${userId}`, []),
    safe(() => prisma.$queryRaw<Row[]>`SELECT COALESCE(SUM(input_tokens + output_tokens),0)::bigint AS used, COALESCE(SUM(CASE WHEN own_key THEN input_tokens + output_tokens ELSE 0 END),0)::bigint AS own, MAX(created_at) AS last FROM llm_usage WHERE user_id = ${userId}`, []),
    safe(() => prisma.$queryRaw<Row[]>`SELECT connected, plan, credits, connected_since, disconnected_at, checked_at FROM flow_connection WHERE user_id = ${userId}`, []),
    safe(() => prisma.$queryRaw<Row[]>`SELECT COUNT(*)::int AS n, MAX(created_at) AS last FROM flow_videos WHERE user_id = ${userId} AND deleted_at IS NULL`, []),
    safe(() => prisma.$queryRaw<Row[]>`SELECT t.id, t.status, t.created_at, t.progress_message FROM tasks t WHERE t.user_id = ${userId} AND t.status = 'error' ORDER BY t.created_at DESC LIMIT 5`, []),
    safe(() => prisma.$queryRaw<Row[]>`SELECT MAX(created_at) AS last FROM tasks WHERE user_id = ${userId}`, []),
  ]);

  if (!user) return null;
  const counts = new Map(tasksByStatus.map((r) => [String(r.status), Number(r.n)]));
  const totalTasks = [...counts.values()].reduce((a, b) => a + b, 0);
  const granted = Number(quota[0]?.granted ?? 0);
  const used = Number(usage[0]?.used ?? 0);
  const f = flow[0];
  const paid = user.plan !== "free";

  const hints: string[] = [];
  if (!paid && totalTasks === 0 && !integrations.length) hints.push("Plano Free, sem nenhuma tarefa e sem IA própria conectada: provavelmente nunca conseguiu gerar. Confira se ele conectou a conta do Gemini/ChatGPT pela extensão ou colocou uma chave em Minhas APIs.");
  if (!paid && granted > 0 && used >= granted) hints.push("Acabaram os créditos de IA gratuitos dele.");
  if (f && !f.connected) hints.push("O Flow aparece como desconectado.");
  if (!f) hints.push("Nunca abriu o Flow com a extensão (sem conexão registrada).");
  if (counts.get("error")) hints.push(`${counts.get("error")} tarefa(s) com erro, veja abaixo.`);

  return (
    <section id="ficha" className="mt-6 scroll-mt-20 rounded-2xl border bg-card">
      <header className="flex flex-wrap items-center gap-2 border-b px-5 py-4">
        <h2 className="text-base font-semibold">Ficha de {user.name || user.email}</h2>
        <Badge variant="outline" className="capitalize">{user.plan}</Badge>
        {user.is_admin && <Badge className="bg-foreground text-background">Admin</Badge>}
        <span className="text-xs text-muted-foreground">{user.email}</span>
      </header>
      <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-4">
        <Item label="Cadastro">{fmt(user.createdAt)}{!user.emailVerified && <span className="ml-1 text-xs text-amber-600">e-mail não confirmado</span>}</Item>
        <Item label="Último acesso">{fmt(user.sessions[0]?.updatedAt)}</Item>
        <Item label="Assinatura">{user.subscription_status}{user.subscription_provider ? ` · ${user.subscription_provider}` : ""}</Item>
        <Item label="Plano vence">{fmt(user.billing_period_end ?? user.trial_ends_at)}</Item>
        <Item label="Veio de">{[user.acquisition?.utm_source, user.acquisition?.ref && `ref ${user.acquisition.ref}`, user.acquisition?.referrer_host].filter(Boolean).join(" · ") || "—"}</Item>
        <Item label="Tarefas">{num(totalTasks)}{counts.size ? <span className="ml-1 text-xs font-normal text-muted-foreground">({[...counts].map(([s, n]) => `${n} ${s}`).join(", ")})</span> : null}</Item>
        <Item label="Última tarefa">{fmt(lastTask[0]?.last)}</Item>
        <Item label="Vídeos do Flow guardados">{num(videos[0]?.n)}{videos[0]?.last ? <span className="ml-1 text-xs font-normal text-muted-foreground">último {fmt(videos[0].last)}</span> : null}</Item>
        <Item label="Tokens de IA">{num(used)} usados{granted ? ` de ${num(granted)}` : ""}{Number(usage[0]?.own) ? <span className="ml-1 text-xs font-normal text-muted-foreground">({num(usage[0]?.own)} com chave dele)</span> : null}</Item>
        <Item label="Último uso de IA">{fmt(usage[0]?.last)}</Item>
        <Item label="Flow">{f ? (f.connected ? "Conectado" : "Desconectado") : "Sem registro"}{f?.plan ? ` · ${String(f.plan)}` : ""}{f?.credits != null ? ` · ${num(f.credits)} créditos` : ""}</Item>
        <Item label="Flow verificado em">{fmt(f?.checked_at)}</Item>
      </div>
      <div className="border-t px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Chaves de IA (Minhas APIs)</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {integrations.length === 0 ? <span className="text-sm text-muted-foreground">Nenhuma chave cadastrada.</span> : integrations.map((i) => (
            <Badge key={String(i.provider)} variant="outline">{String(i.provider)} · …{String(i.hint)} · {fmt(i.updated_at)}</Badge>
          ))}
        </div>
      </div>
      {hints.length > 0 && (
        <div className="border-t bg-amber-500/5 px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">O que isso indica</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{hints.map((h) => <li key={h}>{h}</li>)}</ul>
        </div>
      )}
      {failed.length > 0 && (
        <div className="border-t px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Últimos erros</p>
          <ul className="mt-2 space-y-1 text-sm">
            {failed.map((t) => <li key={String(t.id)}><span className="text-muted-foreground">{fmt(t.created_at)}</span> · {String(t.progress_message ?? "sem mensagem").slice(0, 220)}</li>)}
          </ul>
        </div>
      )}
    </section>
  );
}
