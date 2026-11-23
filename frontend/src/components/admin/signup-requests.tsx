"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Download, Loader2, UserPlus } from "lucide-react";

import { formatCpf, formatPhone } from "@/lib/cadastro";

type Item = { user_id: string; name: string; email: string; cpf: string; phone: string; status: "pending" | "approved" | "declined"; created_at: string };

const STATUS: Record<Item["status"], { label: string; className: string }> = {
  pending: { label: "Aguardando", className: "bg-[#F5B454]/15 text-[#F5B454]" },
  approved: { label: "Liberado", className: "bg-[#5BD69A]/15 text-[#5BD69A]" },
  declined: { label: "Recusado", className: "bg-[#E5484D]/15 text-[#E5484D]" },
};
const when = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const cell = (value: string) => `"${String(value).replace(/"/g, '""')}"`;

export function signupsCsv(items: Item[]) {
  const rows = items.map((i) => [i.name, i.email, formatCpf(i.cpf), formatPhone(i.phone), STATUS[i.status].label, when(i.created_at)].map(cell).join(";"));
  return "﻿" + ["Nome;E-mail;CPF;Telefone;Situação;Cadastro", ...rows].join("\r\n");
}

/** Cadastros da captura: nome, e-mail, CPF e telefone de quem criou conta, com liberar e recusar. */
export function SignupRequestsPanel() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/signups", { cache: "no-store" });
    if (!response.ok) { setError(response.status === 423 || response.status === 401 || response.status === 403 ? "Destrave o Admin para ver os cadastros." : "Não consegui carregar os cadastros."); setItems([]); return; }
    setError("");
    setItems(((await response.json()) as { items: Item[] }).items);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function decide(item: Item, action: "approve" | "decline") {
    setBusy(item.user_id); setNotice("");
    const response = await fetch("/api/admin/signups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: item.user_id, action }) });
    const data = (await response.json().catch(() => ({}))) as { ok?: boolean; emailSent?: boolean };
    if (!response.ok || !data.ok) setNotice("Não consegui salvar. Tente de novo.");
    else if (action === "approve") setNotice(data.emailSent ? `Acesso de ${item.name} liberado. Ela recebeu o e-mail avisando.` : `Acesso de ${item.name} liberado, mas o e-mail de aviso não saiu. Avise pelo WhatsApp.`);
    else setNotice(`Cadastro de ${item.name} recusado.`);
    setBusy("");
    await load();
  }

  function download() {
    if (!items?.length) return;
    const url = URL.createObjectURL(new Blob([signupsCsv(items)], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url; link.download = "cadastros-clipgringa.csv"; link.click();
    URL.revokeObjectURL(url);
  }

  const waiting = items?.filter((i) => i.status === "pending").length ?? 0;
  return (
    <section id="cadastros" className="space-y-3 rounded-[18px] border border-border bg-card p-5" data-testid="signup-requests">
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex items-center gap-2 font-medium"><UserPlus className="size-4 text-[#A98BFF]" /> Cadastros aguardando liberação
          {items ? <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] tabular-nums text-muted-foreground">{waiting}</span> : null}
        </p>
        <button type="button" onClick={download} disabled={!items?.length} className="ml-auto inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm disabled:opacity-50">
          <Download className="size-4" /> Baixar planilha
        </button>
      </div>
      <p className="text-xs text-muted-foreground">Quem cria a conta em Criar acesso informa nome, e-mail, CPF e telefone e só entra depois que você liberar aqui. <Link href="/admin/cadastros" className="underline underline-offset-4">Ver todas as contas na aba Cadastros</Link></p>
      {notice ? <p role="status" className="text-sm text-foreground">{notice}</p> : null}
      {items === null ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Carregando…</p>
      ) : error ? (
        <p className="text-sm text-muted-foreground">{error}</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum cadastro ainda. Quando alguém criar a conta, aparece aqui e você recebe um e-mail.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr><th className="py-2 pr-3 font-normal">Nome</th><th className="py-2 pr-3 font-normal">E-mail</th><th className="py-2 pr-3 font-normal">CPF</th><th className="py-2 pr-3 font-normal">Telefone</th><th className="py-2 pr-3 font-normal">Cadastro</th><th className="py-2 pr-3 font-normal">Situação</th><th className="py-2 font-normal" /></tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.user_id} className="border-t border-border">
                  <td className="py-2.5 pr-3 font-medium">{item.name}</td>
                  <td className="py-2.5 pr-3">{item.email}</td>
                  <td className="py-2.5 pr-3 tabular-nums">{formatCpf(item.cpf)}</td>
                  <td className="py-2.5 pr-3 tabular-nums"><a href={`https://wa.me/55${item.phone}`} target="_blank" rel="noopener noreferrer" className="underline-offset-4 hover:underline">{formatPhone(item.phone)}</a></td>
                  <td className="py-2.5 pr-3 tabular-nums text-muted-foreground">{when(item.created_at)}</td>
                  <td className="py-2.5 pr-3"><span className={`rounded-full px-2 py-0.5 text-[11px] ${STATUS[item.status].className}`}>{STATUS[item.status].label}</span></td>
                  <td className="py-2.5 text-right">
                    <span className="inline-flex gap-2">
                      {item.status !== "approved" ? <button type="button" disabled={busy === item.user_id} onClick={() => decide(item, "approve")} className="h-10 rounded-md bg-[#7B3FE4] px-3 text-sm font-medium text-white disabled:opacity-60">Liberar</button> : null}
                      {item.status === "pending" ? <button type="button" disabled={busy === item.user_id} onClick={() => decide(item, "decline")} className="h-10 rounded-md border px-3 text-sm disabled:opacity-60">Recusar</button> : null}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
