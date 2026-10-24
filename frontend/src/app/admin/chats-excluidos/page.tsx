"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArchiveRestore } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";

type DeletedChat = { id: string; user_id: string; title: string; snap: string; user_name: string | null; user_email: string | null; created_at: string | null; deleted_at: string | null };

const when = (value: string | null) => (value ? new Date(value).toLocaleString("pt-BR") : "—");

function summary(raw: string): { persona: string; answers: string[]; copy: string } {
  try {
    const snap = JSON.parse(raw) as { persona?: { name?: string }; answers?: { question: string; answer: string }[]; copyText?: string };
    return { persona: snap.persona?.name ?? "", answers: (snap.answers ?? []).map((a) => `${a.question} → ${a.answer}`), copy: snap.copyText ?? "" };
  } catch {
    return { persona: "", answers: [], copy: "" };
  }
}

export default function DeletedChatsPage() {
  const [chats, setChats] = useState<DeletedChat[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/admin/deleted-chats", { cache: "no-store" });
        if (response.status === 403) { setError("Destrave o Admin (senha da conta) e volte aqui."); setChats([]); return; }
        if (!response.ok) throw new Error();
        setChats((await response.json()).chats ?? []);
      } catch {
        setError("Não foi possível carregar os chats excluídos agora. Atualize a página.");
        setChats([]);
      }
    })();
  }, []);

  async function restore(chat: DeletedChat) {
    const response = await fetch(`/api/admin/deleted-chats/${encodeURIComponent(chat.user_id)}/${encodeURIComponent(chat.id)}/restore`, { method: "POST" });
    if (response.ok) setChats((current) => (current ?? []).filter((c) => !(c.id === chat.id && c.user_id === chat.user_id)));
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5 p-4 sm:p-8">
      <PageHeader icon={ArchiveRestore} title="Chats excluídos" description="Conversas do avatar que os clientes apagaram. Ficam guardadas aqui e você pode devolver para a conta do cliente." />
      <Link href="/admin" className="text-xs underline underline-offset-4">← Voltar ao Admin</Link>
      {error && <p role="alert" className="text-sm text-muted-foreground">{error}</p>}
      {chats === null && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {chats !== null && chats.length === 0 && !error && <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">Nenhum chat excluído.</p>}
      <ul className="space-y-3">
        {(chats ?? []).map((chat) => {
          const info = summary(chat.snap);
          return (
            <li key={`${chat.user_id}-${chat.id}`} data-testid="deleted-chat" className="space-y-2 rounded-2xl border bg-card p-4 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{chat.title || "Sem título"}</span>
                <span className="text-xs text-muted-foreground">{chat.user_name ?? "—"}{chat.user_email ? ` · ${chat.user_email}` : ""} · excluído em {when(chat.deleted_at)}</span>
                <button type="button" onClick={() => void restore(chat)} className="ml-auto rounded-full border px-3 py-1 text-xs hover:bg-[#7B3FE4]/20">Devolver ao cliente</button>
              </div>
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer">Ver o que tinha no chat</summary>
                <div className="mt-2 space-y-1.5">
                  <p>Criado em {when(chat.created_at)}{info.persona ? ` · influencer: ${info.persona}` : ""}</p>
                  {info.answers.map((line) => <p key={line}>{line}</p>)}
                  {info.copy && <p className="whitespace-pre-wrap">{info.copy}</p>}
                </div>
              </details>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
