"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bug } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";

type Report = { id: string; kind: string; message: string; email: string | null; phone: string | null; page: string | null; handled: boolean; created_at: string | null; user_name: string | null };

const when = (value: string | null) => (value ? new Date(value).toLocaleString("pt-BR") : "—");

export default function AdminReportsPage() {
  const [reports, setReports] = useState<Report[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/admin/reports", { cache: "no-store" });
        if (response.status === 403) { setError("Destrave o Admin (senha da conta) e volte aqui."); setReports([]); return; }
        if (!response.ok) throw new Error();
        setReports((await response.json()).reports ?? []);
      } catch {
        setError("Não foi possível carregar os relatos agora. Atualize a página.");
        setReports([]);
      }
    })();
  }, []);

  async function toggle(report: Report) {
    const handled = !report.handled;
    const response = await fetch(`/api/admin/reports/${report.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ handled }) });
    if (response.ok) setReports((current) => (current ?? []).map((r) => (r.id === report.id ? { ...r, handled } : r)));
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5 p-4 sm:p-8">
      <PageHeader icon={Bug} title="Relatos dos clientes" description="Erros e sugestões enviados pelo balão do inseto, com e-mail e telefone para você responder." />
      <Link href="/admin" className="text-xs underline underline-offset-4">← Voltar ao Admin</Link>
      {error && <p role="alert" className="text-sm text-muted-foreground">{error}</p>}
      {reports === null && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {reports !== null && reports.length === 0 && !error && <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">Nenhum relato ainda.</p>}
      <ul className="space-y-3">
        {(reports ?? []).map((report) => (
          <li key={report.id} data-testid="report" className="space-y-2 rounded-2xl border bg-card p-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className={report.kind === "bug" ? "rounded-full bg-[#F0466B]/20 px-2 py-0.5 text-[11px] font-semibold text-[#F0466B]" : "rounded-full bg-[#7B3FE4]/25 px-2 py-0.5 text-[11px] font-semibold text-[#A98BFF]"}>{report.kind === "bug" ? "Erro" : "Sugestão"}</span>
              <span className="text-xs text-muted-foreground">{when(report.created_at)}{report.user_name ? ` · ${report.user_name}` : ""}</span>
              <button type="button" onClick={() => void toggle(report)} aria-pressed={report.handled} className="ml-auto rounded-full border px-3 py-1 text-xs aria-pressed:bg-[#5BD69A]/20">{report.handled ? "Resolvido ✓" : "Marcar como resolvido"}</button>
            </div>
            <p className="whitespace-pre-wrap">{report.message}</p>
            <p className="text-xs text-muted-foreground">
              {report.email && <a href={`mailto:${report.email}`} className="underline">{report.email}</a>}
              {report.phone && <> · <a href={`https://wa.me/${report.phone.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" className="underline">{report.phone}</a></>}
              {report.page && <> · página {report.page}</>}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
