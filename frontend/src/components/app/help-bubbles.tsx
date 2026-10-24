"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Bot, Bug, Check, Loader2, Send, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Turn = { role: "user" | "assistant"; text: string };
const GREETING = "Oi! Eu ajudo a usar o ClipGringa: conectar o Flow, criar o avatar, fazer os cortes, entender um erro… Me conta a sua dúvida e eu explico o passo a passo.";

/** Dois balões fixos: assistente de dúvidas e relato de erro/sugestão. */
export function HelpBubbles({ email = "" }: { email?: string }) {
  const [open, setOpen] = useState<"" | "ask" | "report">("");
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex flex-col items-end gap-3" data-no-translate>
      {open === "ask" && <AskPanel onClose={() => setOpen("")} />}
      {open === "report" && <ReportPanel email={email} onClose={() => setOpen("")} />}
      <div className="pointer-events-auto flex gap-2">
        <button type="button" aria-label="Relatar erro ou sugestão" onClick={() => setOpen(open === "report" ? "" : "report")} className={cn("grid size-11 place-items-center rounded-full border border-white/15 bg-[#141316] text-white shadow-lg transition hover:border-[#A98BFF]", open === "report" && "border-[#A98BFF]")}><Bug className="size-5" /></button>
        <button type="button" aria-label="Tirar uma dúvida com o assistente" onClick={() => setOpen(open === "ask" ? "" : "ask")} className="grid size-11 place-items-center rounded-full bg-gradient-to-br from-[#8B5CF6] to-[#7B3FE4] text-white shadow-[0_8px_22px_-8px_#7b3fe4] transition hover:brightness-110"><Bot className="size-5" /></button>
      </div>
    </div>
  );
}

function PanelShell({ title, subtitle, onClose, children }: { title: string; subtitle: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div role="dialog" aria-label={title} className="pointer-events-auto flex max-h-[min(560px,80vh)] w-[min(380px,calc(100vw-2rem))] flex-col overflow-hidden rounded-[20px] border border-white/10 bg-[#0F0D14] text-white shadow-[0_30px_80px_rgba(0,0,0,.6)]">
      <div className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div><p className="text-sm font-bold">{title}</p><p className="text-[11px] text-white/55">{subtitle}</p></div>
        <button type="button" aria-label="Fechar" onClick={onClose} className="text-white/60 hover:text-white"><X className="size-5" /></button>
      </div>
      {children}
    </div>
  );
}

function AskPanel({ onClose }: { onClose: () => void }) {
  const pathname = usePathname();
  const [turns, setTurns] = useState<Turn[]>([{ role: "assistant", text: GREETING }]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement | null>(null);
  useEffect(() => { end.current?.scrollIntoView?.({ block: "end" }); }, [turns, busy]);

  async function send() {
    const question = text.trim();
    if (!question || busy) return;
    const history = turns.filter((t, i) => !(i === 0 && t.role === "assistant"));
    setTurns((cur) => [...cur, { role: "user", text: question }]);
    setText("");
    setBusy(true);
    let answer = "Não consegui responder agora. Tente de novo em instantes ou use o balão do inseto para falar com a equipe.";
    try {
      const response = await fetch("/api/multiplier/clone/help-ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question, page: pathname, history }) });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.answer) answer = String(data.answer);
      else if (response.status === 429) answer = "Você fez muitas perguntas seguidas. Espere um pouco e tente de novo.";
    } catch { /* mantém a mensagem padrão */ }
    setTurns((cur) => [...cur, { role: "assistant", text: answer }]);
    setBusy(false);
  }

  return (
    <PanelShell title="Assistente ClipGringa" subtitle="tira dúvidas · não executa nada" onClose={onClose}>
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3 text-sm" aria-live="polite">
        {turns.map((turn, i) => (
          <p key={i} className={cn("whitespace-pre-wrap rounded-2xl px-3 py-2", turn.role === "user" ? "ml-8 bg-[#7B3FE4]/30" : "mr-6 bg-white/[0.06]")}>{turn.text}</p>
        ))}
        {busy && <p className="mr-6 inline-flex items-center gap-2 rounded-2xl bg-white/[0.06] px-3 py-2 text-white/70"><Loader2 className="size-4 animate-spin" /> Pensando…</p>}
        <div ref={end} />
      </div>
      <form className="flex items-end gap-2 border-t border-white/10 p-3" onSubmit={(event) => { event.preventDefault(); void send(); }}>
        <textarea value={text} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }} rows={2} maxLength={600} aria-label="Sua dúvida" placeholder="Sua dúvida (Enter envia)" className="min-h-[52px] flex-1 resize-none rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-sm placeholder:text-white/40 focus:border-[#A98BFF] focus:outline-none" />
        <button type="submit" disabled={busy || !text.trim()} aria-label="Enviar dúvida" className="grid size-11 place-items-center rounded-xl bg-[#7B3FE4] text-white disabled:opacity-40"><Send className="size-4" /></button>
      </form>
    </PanelShell>
  );
}

function ReportPanel({ email: initialEmail, onClose }: { email: string; onClose: () => void }) {
  const pathname = usePathname();
  const [kind, setKind] = useState<"bug" | "suggestion">("bug");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState(initialEmail);
  const [phone, setPhone] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (message.trim().length < 5) { setError("Conte o que aconteceu em pelo menos uma frase."); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) { setError("Coloque um e-mail válido para a equipe poder responder."); return; }
    setState("sending");
    try {
      const response = await fetch("/api/multiplier/clone/help-report", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, message, email: email.trim(), phone, page: pathname }) });
      if (response.ok) { setState("done"); return; }
      const data = await response.json().catch(() => ({}));
      setError(typeof data.detail === "string" ? data.detail : "Não foi possível enviar agora. Tente de novo.");
    } catch { setError("Não foi possível enviar agora. Tente de novo."); }
    setState("idle");
  }

  return (
    <PanelShell title="CONTA PRA GENTE" subtitle="erro, sugestão ou ideia" onClose={onClose}>
      {state === "done" ? (
        <div className="space-y-3 p-5 text-sm">
          <p className="flex items-center gap-2 font-semibold"><Check className="size-4 text-[#5BD69A]" /> Recebemos! Obrigado.</p>
          <p className="text-white/70">A equipe vai ler e, se precisar, fala com você pelo e-mail ou telefone que você deixou.</p>
          <button type="button" onClick={onClose} className="rounded-full border border-white/20 px-4 py-2 text-sm hover:border-[#A98BFF]">Fechar</button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3 overflow-y-auto p-4 text-sm">
          <div role="radiogroup" aria-label="Tipo de relato" className="flex gap-2">
            {([["bug", "Deu erro"], ["suggestion", "Sugestão"]] as const).map(([value, label]) => (
              <button key={value} type="button" role="radio" aria-checked={kind === value} onClick={() => setKind(value)} className={cn("rounded-full border px-3 py-1.5 text-xs font-semibold", kind === value ? "border-transparent bg-white text-black" : "border-white/20 text-white/80")}>{label}</button>
            ))}
          </div>
          <label className="block space-y-1"><span className="text-xs text-white/60">{kind === "bug" ? "O que você fez, o que esperava e o que aconteceu" : "Qual é a sua ideia?"}</span>
            <textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={4} maxLength={2000} className="w-full resize-none rounded-xl border border-white/15 bg-black/40 px-3 py-2 focus:border-[#A98BFF] focus:outline-none" /></label>
          <label className="block space-y-1"><span className="text-xs text-white/60">Seu e-mail</span>
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 focus:border-[#A98BFF] focus:outline-none" /></label>
          <label className="block space-y-1"><span className="text-xs text-white/60">Seu telefone com DDD (WhatsApp)</span>
            <input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="(11) 90000-0000" className="w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 placeholder:text-white/30 focus:border-[#A98BFF] focus:outline-none" /></label>
          {error && <p role="alert" className="text-xs text-[#F0466B]">{error}</p>}
          <button type="submit" disabled={state === "sending"} className="w-full rounded-full bg-white py-2.5 text-sm font-bold text-black disabled:opacity-60">{state === "sending" ? "Enviando…" : "Enviar"}</button>
          <p className="text-[11px] text-white/45">Vai junto, para a gente entender: a página em que você está e o seu pedido atual. Nunca coloque senhas.</p>
        </form>
      )}
    </PanelShell>
  );
}
