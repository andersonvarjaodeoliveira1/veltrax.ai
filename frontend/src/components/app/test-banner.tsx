"use client";

import { useEffect, useState } from "react";
import { FlaskConical } from "lucide-react";

const WHATSAPP = "5511913142143";

/** Aviso fixo nas contas de teste: mostra até quando a conta fica ativa e pede feedback pelo WhatsApp. */
export function TestBanner({ enabled }: { enabled: boolean }) {
  const [until, setUntil] = useState<Date | null>(() => {
    // Guarda a data na sessão: nas próximas telas o aviso já nasce no lugar e não empurra o conteúdo.
    try { const saved = window.sessionStorage.getItem("gv-test-until"); return saved ? new Date(saved) : null; } catch { return null; }
  });

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    fetch("/api/usage/test-status", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { test_expires_at?: string | null } | null) => {
        if (alive && data && !data.test_expires_at) { setUntil(null); try { window.sessionStorage.removeItem("gv-test-until"); } catch { /* sem storage */ } }
        if (alive && data?.test_expires_at) { setUntil(new Date(data.test_expires_at)); try { window.sessionStorage.setItem("gv-test-until", data.test_expires_at); } catch { /* sem storage */ } }
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [enabled]);

  if (!until || Number.isNaN(until.getTime())) return null;
  const date = until.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" });
  const message = encodeURIComponent("Olá! Estou testando o ClipGringa e quero deixar meu feedback: ");

  return (
    <div role="status" data-no-translate className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[#7b3fe4]/30 bg-[#7b3fe4]/10 px-4 py-2 text-xs text-foreground/90">
      <FlaskConical aria-hidden className="size-4 shrink-0 text-[#a98bff]" />
      <span>
        <strong>Período de teste</strong> — sua conta fica ativa até <strong>{date}</strong>. Depois dessa data o acesso é desativado.
      </span>
      <a href={`https://wa.me/${WHATSAPP}?text=${message}`} target="_blank" rel="noopener noreferrer" className="font-semibold text-[#a98bff] underline underline-offset-2">
        Envie seu feedback no WhatsApp (11) 91314-2143
      </a>
    </div>
  );
}
