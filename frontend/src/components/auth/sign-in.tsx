"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";

import { signIn } from "../../lib/auth-client";
import { BLOCKED_ACCOUNT_CODE, BLOCKED_ACCOUNT_MESSAGE, FEEDBACK_WHATSAPP_URL, INACTIVE_MEMBER_CODE, LOGIN_LINK_MINUTES } from "@/lib/acesso";
import { postAuthPath } from "@/lib/auth-redirect";
import { PENDING_ACCESS_CODE } from "@/lib/cadastro";
import { track } from "@/lib/datafast";

const input = "h-12 w-full rounded-md border border-transparent bg-[#F4F4F6] px-4 text-[15px] text-[#171717] placeholder:text-[#8A8A93] outline-none focus:border-[#7B3FE4] focus:bg-white disabled:opacity-60";
const primary = "inline-flex h-12 w-full items-center justify-center rounded-md bg-[#7B3FE4] px-6 text-[15px] font-semibold text-white transition-colors hover:bg-[#6A32CC] disabled:opacity-60";
const textLink = "font-medium text-[#7B3FE4] underline-offset-2 hover:underline";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Entrada. O caminho principal é sem senha: a pessoa digita o e-mail e recebe um link.
 * Quem tem senha (administrador, conta convidada, cadastro liberado) pode entrar com ela.
 */
export function SignIn() {
  const router = useRouter();
  const [mode, setMode] = useState<"link" | "password">("link");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [blocked, setBlocked] = useState(false);

  function switchMode(next: "link" | "password") {
    setMode(next);
    setMessage("");
    setBlocked(false);
  }

  async function sendLink(event: React.FormEvent) {
    event.preventDefault();
    const address = email.trim().toLowerCase();
    if (!EMAIL_RE.test(address)) return setMessage("Digite um e-mail válido.");
    setBusy(true);
    setMessage("");
    const response = await signIn.magicLink({ email: address, callbackURL: "/" });
    setBusy(false);
    if (response.error) {
      setMessage(response.error.status === 429
        ? "Muitas tentativas. Espere um minuto e tente de novo."
        : "Não foi possível enviar o link agora. Tente de novo em instantes.");
      return;
    }
    track("signin_link_requested", { auth_method: "email_link" });
    setSentTo(address);
  }

  async function enterWithPassword(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const response = await signIn.email({ email: email.trim(), password });
    if (response.error) {
      const reason = response.error.message || "";
      // Conta criada pela captura e ainda não liberada: vai para a tela de espera, com o contato do suporte.
      if (reason.includes(PENDING_ACCESS_CODE)) return router.push("/aguardando-liberacao");
      if (reason.includes(INACTIVE_MEMBER_CODE)) return router.push("/assinatura-inativa");
      if (reason.includes(BLOCKED_ACCOUNT_CODE)) { setMessage(BLOCKED_ACCOUNT_MESSAGE); setBlocked(true); setBusy(false); return; }
      setMessage(response.error.status === 429
        ? "Muitas tentativas. Espere 5 minutos e tente de novo."
        : response.error.status === 401 ? "E-mail ou senha incorretos." : reason || "Não foi possível entrar. Tente de novo.");
      setBusy(false);
      return;
    }
    track("signin_completed", { auth_method: "email" });
    // Navegação completa: a tela inicial abre já com a sessão nova.
    window.location.assign(postAuthPath(window.location.search));
  }

  if (sentTo) {
    return (
      <div className="w-full">
        <h1 className="text-[40px] font-bold leading-tight tracking-tight text-[#0F172A]">Confira o seu e-mail</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-[#525252]">
          Se <span className="font-medium text-[#171717]">{sentTo}</span> for de um assinante ativo da Gringatools ou de uma conta já liberada,
          o link para entrar chega em instantes. Ele vale por {LOGIN_LINK_MINUTES} minutos.
        </p>
        <div className="mt-8 rounded-lg bg-[#F4F4F6] p-5 text-sm leading-relaxed text-[#525252]">
          <p className="font-medium text-[#171717]">Não chegou?</p>
          <p className="mt-1">Olhe a caixa de spam e confira se o e-mail é o mesmo da sua assinatura. Você pode pedir de novo depois de 1 minuto.</p>
          <p className="mt-3">
            Não é assinante? <Link href="/criar-acesso" className={textLink}>Criar acesso</Link>
            <span className="mx-2 text-[#A1A1AA]">|</span>
            <a href={FEEDBACK_WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className={textLink}>Falar com o suporte</a>
          </p>
        </div>
        <button type="button" onClick={() => setSentTo("")} className="mt-8 text-sm font-medium text-[#7B3FE4] underline-offset-2 hover:underline">Usar outro e-mail ou pedir de novo</button>
      </div>
    );
  }

  return (
    <div className="w-full">
      <h1 className="text-[40px] font-bold leading-tight tracking-tight text-[#0F172A]">Entrar</h1>
      <p className="mt-3 text-[15px] text-[#8A8A93]">
        {mode === "link" ? "Digite o seu e-mail e receba o link para entrar, sem senha" : "Entre com o e-mail e a senha da sua conta"}
      </p>
      <form onSubmit={mode === "link" ? sendLink : enterWithPassword} noValidate className="mt-8 space-y-4">
        <div>
          <label htmlFor="entrar-email" className="mb-1.5 block text-sm font-medium text-[#3F3F46]">E-mail</label>
          <input id="entrar-email" type="email" autoComplete="email" inputMode="email" placeholder="E-mail" value={email}
            onChange={(e) => setEmail(e.target.value)} required disabled={busy} className={input} />
        </div>
        {mode === "password" ? (
          <div>
            <label htmlFor="entrar-senha" className="mb-1.5 block text-sm font-medium text-[#3F3F46]">Senha</label>
            <div className="relative">
              <input id="entrar-senha" type={show ? "text" : "password"} autoComplete="current-password" placeholder="Senha" value={password}
                onChange={(e) => setPassword(e.target.value)} required disabled={busy} className={`${input} pr-12`} />
              <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? "Esconder a senha" : "Mostrar a senha"}
                className="absolute right-1 top-1 flex size-10 items-center justify-center rounded-md text-[#737373] hover:text-[#171717]">
                {show ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
              </button>
            </div>
            <div className="mt-2 flex justify-end">
              <Link href="/forgot-password" className="text-sm text-[#525252] underline-offset-2 hover:underline">Esqueceu a senha?</Link>
            </div>
          </div>
        ) : null}
        {message ? (
          <p role="alert" className="text-sm text-[#DC2626]">
            {message}
            {blocked ? <> <a href={FEEDBACK_WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="font-medium underline underline-offset-2">Chamar o suporte</a></> : null}
          </p>
        ) : null}
        <button type="submit" disabled={busy} className={primary}>
          {mode === "link" ? (busy ? "Enviando…" : "Receber link de acesso") : busy ? "Entrando…" : "Entrar"}
        </button>
      </form>
      <button type="button" onClick={() => switchMode(mode === "link" ? "password" : "link")} disabled={busy}
        className="mt-5 text-sm font-medium text-[#7B3FE4] underline-offset-2 hover:underline">
        {mode === "link" ? "Entrar com senha" : "Entrar sem senha, com link por e-mail"}
      </button>
      {mode === "link" ? (
        <p className="mt-6 text-sm leading-relaxed text-[#525252]">
          Assinante ativo da Gringatools entra direto com o e-mail da assinatura. O ClipGringa é um bônus da assinatura.
        </p>
      ) : null}
    </div>
  );
}
