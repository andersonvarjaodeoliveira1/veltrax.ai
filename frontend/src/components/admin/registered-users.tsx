"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Loader2, Search } from "lucide-react";

import { formatCpf, formatPhone } from "@/lib/cadastro";

export type RegisteredUser = {
  user_id: string; name: string; email: string; is_admin: boolean; created_at: string;
  cpf: string | null; phone: string | null; status: "pending" | "approved" | "declined" | "invited";
  decided_at: string | null; last_seen: string | null;
  flow_connected: boolean; apis: number; tokens_granted: number | null; tasks: number;
};
type Filter = "all" | RegisteredUser["status"];

const STATUS: Record<RegisteredUser["status"], { label: string; className: string }> = {
  pending: { label: "Aguardando", className: "bg-[#F5B454]/15 text-[#F5B454]" },
  approved: { label: "Liberado", className: "bg-[#5BD69A]/15 text-[#5BD69A]" },
  declined: { label: "Recusado", className: "bg-[#E5484D]/15 text-[#E5484D]" },
  invited: { label: "Por convite", className: "bg-muted text-muted-foreground" },
};
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Todos" }, { id: "pending", label: "Aguardando" }, { id: "approved", label: "Liberados" },
  { id: "declined", label: "Recusados" }, { id: "invited", label: "Por convite" },
];
const TZ = "America/Sao_Paulo";
const day = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric" });
const hour = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const when = (iso: string | null) => (iso ? `${day(iso)} às ${hour(iso)}` : "");
const fmt = new Intl.NumberFormat("pt-BR");
const cell = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
const plain = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function usersCsv(users: RegisteredUser[]) {
  const rows = users.map((u) => [
    u.name, u.email, u.cpf ? formatCpf(u.cpf) : "", u.phone ? formatPhone(u.phone) : "", STATUS[u.status].label,
    day(u.created_at), hour(u.created_at), when(u.last_seen), u.flow_connected ? "Sim" : "Não", u.apis, u.tokens_granted ?? 0, u.tasks,
  ].map(cell).join(";"));
  return "﻿" + ["Nome;E-mail;CPF;Telefone;Situação;Data do cadastro;Hora do cadastro;Último acesso;Flow conectado;APIs conectadas;Tokens liberados;Vídeos enviados", ...rows].join("\r\n");
}

/** Aba Cadastros: todas as contas, com os dados da captura, o horário do cadastro e o que cada pessoa já conectou. */
export function RegisteredUsers() {
  const [users, setUsers] = useState<RegisteredUser[] | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/signups?all=1", { cache: "no-store" });
    if (!response.ok) { setError(response.status === 401 || response.status === 403 ? "Destrave o Admin para ver os cadastros." : "Não consegui carregar os cadastros. Atualize a página."); setUsers([]); return; }
    setError("");
    setUsers(((await response.json()) as { users: RegisteredUser[] }).users);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function decide(user: RegisteredUser, action: "approve" | "decline") {
    setBusy(user.user_id); setNotice("");
    const response = await fetch("/api/admin/signups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: user.user_id, action }) });
    const data = (await response.json().catch(() => ({}))) as { ok?: boolean; emailSent?: boolean };
    if (!response.ok || !data.ok) setNotice("Não consegui salvar. Tente de novo.");
    else if (action === "approve") setNotice(data.emailSent ? `Acesso de ${user.name} liberado. O e-mail de aviso foi enviado.` : `Acesso de ${user.name} liberado, mas o e-mail de aviso não saiu. Avise pelo WhatsApp.`);
    else setNotice(`Cadastro de ${user.name} recusado.`);
    setBusy("");
    await load();
  }

  const counts = useMemo(() => {
    const base: Record<Filter, number> = { all: users?.length ?? 0, pending: 0, approved: 0, declined: 0, invited: 0 };
    for (const user of users ?? []) base[user.status] += 1;
    return base;
  }, [users]);
  const week = useMemo(() => (users ?? []).filter((u) => Date.now() - new Date(u.created_at).getTime() < 7 * 86400_000).length, [users]);
  const shown = useMemo(() => {
    const text = plain(query.trim());
    const digits = query.replace(/\D+/g, "");
    return (users ?? []).filter((u) => (filter === "all" || u.status === filter)
      && (!text || plain(u.name).includes(text) || u.email.toLowerCase().includes(text) || (digits.length >= 3 && ((u.cpf ?? "").includes(digits) || (u.phone ?? "").includes(digits)))));
  }, [users, filter, query]);

  function download() {
    if (!shown.length) return;
    const url = URL.createObjectURL(new Blob([usersCsv(shown)], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url; link.download = "cadastros-clipgringa.csv"; link.click();
    URL.revokeObjectURL(url);
  }

  const numbers = [
    { label: "Contas cadastradas", value: counts.all, to: "all" as Filter },
    { label: "Aguardando liberação", value: counts.pending, to: "pending" as Filter },
    { label: "Liberadas pela captura", value: counts.approved, to: "approved" as Filter },
    { label: "Novas nos últimos 7 dias", value: week, to: null },
  ];

  return (
    <div data-no-translate data-testid="registered-users" className="space-y-5">
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {numbers.map((n) => {
          const body = <><span className="block text-xs text-muted-foreground">{n.label}</span><span className="mt-1 block text-2xl font-medium tabular-nums">{users ? fmt.format(n.value) : "…"}</span></>;
          return n.to
            ? <button key={n.label} type="button" onClick={() => setFilter(n.to)} className="rounded-xl bg-card p-4 text-left ring-1 ring-inset ring-border hover:ring-foreground/20">{body}</button>
            : <div key={n.label} className="rounded-xl bg-card p-4 ring-1 ring-inset ring-border">{body}</div>;
        })}
      </section>

      <section className="rounded-xl bg-card ring-1 ring-inset ring-border">
        <div className="flex flex-wrap items-center gap-2 p-4">
          <div role="group" aria-label="Filtrar por situação" className="flex flex-wrap gap-1">
            {FILTERS.map((f) => (
              <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}
                className={`inline-flex h-10 items-center gap-1.5 rounded-md px-3 text-sm ${filter === f.id ? "bg-muted font-medium text-foreground ring-1 ring-inset ring-foreground/15" : "text-muted-foreground hover:text-foreground"}`}>
                {f.label}<span className="text-xs tabular-nums text-muted-foreground">{counts[f.id]}</span>
              </button>
            ))}
          </div>
          <label className="relative ml-auto min-w-0 flex-[1_1_14rem] sm:max-w-xs">
            <span className="sr-only">Buscar por nome, e-mail, CPF ou telefone</span>
            <Search aria-hidden className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nome, e-mail, CPF ou telefone"
              className="h-10 w-full rounded-md border bg-background pl-9 pr-3 text-sm outline-none focus:border-foreground/40" />
          </label>
          <button type="button" onClick={download} disabled={!shown.length} className="inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm disabled:opacity-50">
            <Download className="size-4" /> Baixar planilha
          </button>
        </div>
        {notice ? <p role="status" className="px-4 pb-3 text-sm">{notice}</p> : null}

        {users === null ? (
          <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Carregando os cadastros…</p>
        ) : error ? (
          <p className="p-4 text-sm text-muted-foreground">{error}</p>
        ) : shown.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">{users.length === 0 ? "Nenhuma conta cadastrada ainda. Quem criar a conta em Criar acesso aparece aqui." : "Nenhum cadastro com esse filtro. Limpe a busca ou escolha Todos."}</p>
        ) : (
          <div className="overflow-x-auto border-t">
            <table className="w-full min-w-[1040px] text-left text-sm">
              <thead className="bg-muted/50 text-[12.5px] text-muted-foreground">
                <tr>{["Pessoa", "CPF", "Telefone", "Cadastro", "Último acesso", "Já conectou", "Situação", ""].map((h, i) => <th key={i} className="px-4 py-2.5 font-normal">{h}</th>)}</tr>
              </thead>
              <tbody>
                {shown.map((u) => (
                  <tr key={u.user_id} className="border-t align-top">
                    <td className="px-4 py-3">
                      <span className="block font-medium">{u.name || "Sem nome"}{u.is_admin ? <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[11px] font-normal text-muted-foreground">Admin</span> : null}</span>
                      <span className="block text-xs text-muted-foreground">{u.email}</span>
                    </td>
                    <td className="px-4 py-3 tabular-nums">{u.cpf ? formatCpf(u.cpf) : <span className="text-muted-foreground">Não informado</span>}</td>
                    <td className="px-4 py-3 tabular-nums">
                      {u.phone ? <a href={`https://wa.me/55${u.phone}`} target="_blank" rel="noopener noreferrer" className="underline-offset-4 hover:underline">{formatPhone(u.phone)}</a> : <span className="text-muted-foreground">Não informado</span>}
                    </td>
                    <td className="px-4 py-3 tabular-nums"><span className="block">{day(u.created_at)}</span><span className="block text-xs text-muted-foreground">{hour(u.created_at)}</span></td>
                    <td className="px-4 py-3 tabular-nums">
                      {u.last_seen ? <><span className="block">{day(u.last_seen)}</span><span className="block text-xs text-muted-foreground">{hour(u.last_seen)}</span></> : <span className="text-muted-foreground">Ainda não entrou</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      <span className="block">{u.flow_connected ? "Flow conectado" : "Flow não conectado"}</span>
                      <span className="block">{u.apis === 0 ? "Nenhuma API" : u.apis === 1 ? "1 API" : `${u.apis} APIs`}, {u.tasks === 1 ? "1 vídeo enviado" : `${fmt.format(u.tasks)} vídeos enviados`}</span>
                      <span className="block">{u.tokens_granted ? `${fmt.format(u.tokens_granted)} tokens liberados` : "Sem tokens liberados"}</span>
                    </td>
                    <td className="px-4 py-3"><span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] ${STATUS[u.status].className}`}>{STATUS[u.status].label}</span></td>
                    <td className="px-4 py-3 text-right">
                      <span className="inline-flex gap-2">
                        {u.status === "pending" || u.status === "declined" ? <button type="button" disabled={busy === u.user_id} onClick={() => decide(u, "approve")} className="h-10 rounded-md bg-[#7B3FE4] px-3 text-sm font-medium text-white disabled:opacity-60">Liberar</button> : null}
                        {u.status === "pending" ? <button type="button" disabled={busy === u.user_id} onClick={() => decide(u, "decline")} className="h-10 rounded-md border px-3 text-sm disabled:opacity-60">Recusar</button> : null}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
