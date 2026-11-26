"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { FEEDBACK_WHATSAPP_URL, LOGIN_TOKEN_RE } from "@/lib/acesso";

const primary = "inline-flex h-12 w-full items-center justify-center rounded-md bg-[#7B3FE4] px-6 text-[15px] font-semibold text-white transition-colors hover:bg-[#6A32CC] disabled:opacity-60";

/** Tela para onde o link do e-mail leva: um botão que troca o link pela sessão. */
export function ConfirmLogin({ token }: { token: string }) {
  const router = useRouter();
  const valid = LOGIN_TOKEN_RE.test(token);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<"expired" | "failed" | "too_many" | null>(valid ? null : "expired");
  const [detail, setDetail] = useState("");
  const [support, setSupport] = useState(false);

  async function enter() {
    setBusy(true);
    setProblem(null);
    try {
      const response = await fetch("/api/entrar/confirmar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
      const data = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string; message?: string; support?: boolean };
      if (data.ok) {
        // Navegação completa: a tela inicial abre já com a sessão nova.
        window.location.assign("/");
        return;
      }
      if (data.error === "pending") return router.replace("/aguardando-liberacao");
      if (data.error === "inactive") return router.replace("/assinatura-inativa");
      if (data.error === "blocked") { setDetail(data.message || ""); setSupport(Boolean(data.support)); }
      setProblem(data.error === "expired" || data.error === "too_many" ? data.error : "failed");
    } catch {
      setProblem("failed");
    }
    setBusy(false);
  }

  if (problem === "expired") {
    return (
      <div className="w-full">
        <h1 className="text-[40px] font-bold leading-tight tracking-tight text-[#0F172A]">Este link não vale mais</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-[#525252]">O link de entrada vale por 15 minutos e só pode ser usado uma vez. Peça um novo e use o e-mail mais recente.</p>
        <Link href="/sign-in" className={`${primary} mt-8`}>Pedir outro link</Link>
      </div>
    );
  }

  return (
    <div className="w-full">
      <h1 className="text-[40px] font-bold leading-tight tracking-tight text-[#0F172A]">Entrar no ClipGringa</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-[#525252]">Falta só confirmar. Aperte o botão para entrar na sua conta.</p>
      <button type="button" onClick={enter} disabled={busy} className={`${primary} mt-8`}>{busy ? "Entrando…" : "Entrar agora"}</button>
      {problem ? (
        <p role="alert" className="mt-4 text-sm text-[#DC2626]">
          {problem === "too_many" ? "Muitas tentativas. Espere alguns minutos e tente de novo." : detail || "Não foi possível entrar agora. Tente de novo em instantes."}
          {support ? <> <a href={FEEDBACK_WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="font-medium underline underline-offset-2">Chamar o suporte</a></> : null}
        </p>
      ) : null}
      <p className="mt-8 text-sm text-[#525252]">Não pediu este link? É só fechar esta página.</p>
    </div>
  );
}
