"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Mail, MailPlus } from "lucide-react";

const fmt = new Intl.NumberFormat("pt-BR");

/** E-mail de envio + convite de membro novo. Fica no painel Admin e na tela de uso. */
export function MemberAccess({ onDone }: { onDone: () => void }) {
  return (
    <div className="space-y-4">
      <EmailSetupCard />
      <InviteCard onDone={onDone} />
    </div>
  );
}

/** Versão para a página Admin (servidor): atualiza a lista de usuários depois do convite. */
export function MemberAccessPanel() {
  const router = useRouter();
  return <MemberAccess onDone={() => router.refresh()} />;
}

function InviteCard({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [tokens, setTokens] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  async function invite(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setResult(null);
    try {
      const response = await fetch("/api/admin/invite", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, tokens: Number(tokens) || undefined }) });
      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        setResult({ ok: true, text: `${data.created ? "Usuário criado" : "Usuário já existia"} e e-mail enviado para ${email.trim().toLowerCase()}. Ele escolhe a senha pelo link.${data.tokensGranted ? ` Tokens liberados: ${fmt.format(data.tokensGranted)}.` : ""}` });
        setEmail(""); setTokens(""); onDone();
      } else if (response.status === 403) {
        setResult({ ok: false, text: "Destrave o Admin (senha da conta) e tente de novo." });
      } else if (data.error === "invalid_email") {
        setResult({ ok: false, text: "Esse e-mail não parece válido. Confira e tente de novo." });
      } else {
        const notConfigured = typeof data.detail === "string" && /não configurado|not configured/i.test(data.detail);
        setResult({ ok: false, text: notConfigured
          ? `${data.created ? "O usuário foi criado, mas o" : "O"} e-mail de envio ainda não está configurado. No Admin, em Configurações, preencha “E-mail de envio” (contato@gringatools.com) e a senha dele. Depois clique aqui de novo para reenviar.`
          : `${data.created ? "O usuário foi criado, mas o" : "O"} e-mail não saiu agora. Clique em liberar de novo para reenviar.` });
        if (data.created) onDone();
      }
    } catch {
      setResult({ ok: false, text: "Não foi possível liberar agora. Tente de novo." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3 rounded-[18px] border border-border bg-card p-5" data-testid="invite-card">
      <p className="flex items-center gap-2 font-medium"><MailPlus className="size-4 text-[#A98BFF]" /> Liberar acesso para um membro novo</p>
      <p className="text-xs text-muted-foreground">Digite o e-mail. O ClipGringa cria o usuário e manda um e-mail com o link para a própria pessoa escolher a senha e entrar. Pode reenviar quando quiser.</p>
      <form onSubmit={invite} className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-[16rem] flex-1 flex-col gap-1 text-xs text-muted-foreground">E-mail do membro
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nome@gmail.com" className="h-10 rounded-full border bg-background px-4 text-sm text-foreground" />
        </label>
        <label className="flex w-44 flex-col gap-1 text-xs text-muted-foreground">Tokens iniciais (opcional)
          <input type="number" min={0} step={10000} value={tokens} onChange={(e) => setTokens(e.target.value)} placeholder="ex.: 500000" className="h-10 rounded-full border bg-background px-4 text-sm text-foreground" />
        </label>
        <button type="submit" disabled={busy || !email.trim()} className="inline-flex h-10 items-center gap-2 rounded-full bg-gradient-to-br from-[#8B5CF6] to-[#7B3FE4] px-5 text-sm font-medium text-white disabled:opacity-50">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <MailPlus className="size-4" />} Liberar e enviar e-mail
        </button>
      </form>
      {result && <p role="status" className={result.ok ? "text-sm text-[#5BD69A]" : "text-sm text-[#F0466B]"}>{result.text}</p>}
    </section>
  );
}

function EmailSetupCard() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [user, setUser] = useState("contato@gringatools.com");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/admin/runtime-settings", { cache: "no-store" });
        if (!response.ok) return;
        const settings = ((await response.json()).settings ?? []) as { key: string; configured: boolean }[];
        const done = (key: string) => settings.some((item) => item.key === key && item.configured);
        setConfigured(done("SMTP_USER") && done("SMTP_PASSWORD"));
      } catch { /* o card continua disponível */ }
    })();
  }, []);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setResult(null);
    try {
      const response = await fetch("/api/admin/runtime-settings", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates: { SMTP_USER: user.trim(), SMTP_PASSWORD: password }, delete_keys: [], prefer_admin_values: { SMTP_USER: true, SMTP_PASSWORD: true } }),
      });
      if (!response.ok) throw new Error();
      setConfigured(true); setPassword("");
      setResult({ ok: true, text: "Salvo. Agora os e-mails (convite e nova senha) saem por esse endereço." });
    } catch {
      setResult({ ok: false, text: "Não foi possível salvar agora. Destrave o Admin (senha da conta) e tente de novo." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3 rounded-[18px] border border-border bg-card p-5" data-testid="email-setup-card">
      <p className="flex items-center gap-2 font-medium"><Mail className="size-4 text-[#A98BFF]" /> E-mail de envio do app
        {configured !== null && <span className={configured ? "rounded-full bg-[#5BD69A]/15 px-2 py-0.5 text-[11px] text-[#5BD69A]" : "rounded-full bg-[#F5B454]/15 px-2 py-0.5 text-[11px] text-[#F5B454]"}>{configured ? "configurado" : "falta configurar"}</span>}
      </p>
      <p className="text-xs text-muted-foreground">É a caixa que envia o convite e o link de nova senha. Use o e-mail da Hostinger e a senha dele. A senha fica criptografada e nunca volta para a tela.</p>
      <form onSubmit={save} className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-[16rem] flex-1 flex-col gap-1 text-xs text-muted-foreground">E-mail de envio
          <input type="email" required value={user} onChange={(e) => setUser(e.target.value)} className="h-10 rounded-full border bg-background px-4 text-sm text-foreground" />
        </label>
        <label className="flex min-w-[14rem] flex-1 flex-col gap-1 text-xs text-muted-foreground">Senha desse e-mail
          <input type="password" required autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className="h-10 rounded-full border bg-background px-4 text-sm text-foreground" />
        </label>
        <button type="submit" disabled={busy || !password || !user.trim()} className="inline-flex h-10 items-center gap-2 rounded-full bg-gradient-to-br from-[#8B5CF6] to-[#7B3FE4] px-5 text-sm font-medium text-white disabled:opacity-50">
          {busy && <Loader2 className="size-4 animate-spin" />} Salvar
        </button>
      </form>
      {result && <p role="status" className={result.ok ? "text-sm text-[#5BD69A]" : "text-sm text-[#F0466B]"}>{result.text}</p>}
    </section>
  );
}
