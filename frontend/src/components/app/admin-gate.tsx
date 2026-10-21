"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";

// O Admin fica trancado, mesmo para o administrador. A senha é a mesma da conta.
// A trava de verdade está no servidor: sem o destrave, as rotas do Admin respondem 403.
export function AdminGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<"checking" | "locked" | "open">("checking");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const check = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/unlock", { cache: "no-store" });
      // Quem não é administrador vê a própria mensagem da página; o servidor já bloqueia os dados.
      if (response.status === 401 || response.status === 403) { setState("open"); return; }
      const data = response.ok ? await response.json() : null;
      setState(data?.unlocked === true ? "open" : "locked");
    } catch {
      setState("locked");
    }
  }, []);

  useEffect(() => {
    void check();
    const refresh = () => { if (document.visibilityState === "visible") void check(); };
    document.addEventListener("visibilitychange", refresh);
    const timer = setInterval(() => void check(), 60_000);
    return () => { document.removeEventListener("visibilitychange", refresh); clearInterval(timer); };
  }, [check]);

  async function unlock() {
    if (!password || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/unlock", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
      if (response.ok) {
        setPassword("");
        setState("open");
      } else if (response.status === 429) {
        setError("Muitas tentativas. Espere alguns minutos e tente de novo.");
      } else if (response.status === 401 || response.status === 400) {
        setError("Senha incorreta. Tente de novo.");
      } else {
        setError("Não foi possível confirmar agora. Tente de novo.");
      }
    } catch {
      setError("Não foi possível confirmar agora. Verifique a conexão.");
    } finally {
      setBusy(false);
    }
  }

  if (state === "open") return <>{children}</>;
  if (state === "checking") return <div className="flex justify-center p-12"><Loader2 className="size-5 animate-spin text-muted-foreground" aria-label="Carregando" /></div>;

  return (
    <div className="mx-auto max-w-sm space-y-4 rounded-[18px] border border-border bg-card p-6">
      <div className="flex items-center gap-2">
        <Lock className="size-5 text-primary" />
        <h1 className="text-lg font-semibold">Admin protegido</h1>
      </div>
      <p className="text-sm text-muted-foreground">Por segurança, confirme a senha da sua conta para abrir o Admin. O acesso fica liberado por 30 minutos.</p>
      {/* Sem <form> e com autocomplete novo: o navegador não oferece nem salva a senha aqui. */}
      <div className="space-y-3">
        <label className="block space-y-1 text-sm">
          <span className="text-muted-foreground">Senha da sua conta</span>
          <input type="password" name="admin-confirm" autoComplete="new-password" data-lpignore="true" data-1p-ignore="true" data-form-type="other" value={password} onChange={(event) => setPassword(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void unlock(); }} maxLength={256}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
        </label>
        {error && <p role="alert" className="text-sm text-[#F0466B]">{error}</p>}
        <Button type="button" className="w-full" onClick={() => void unlock()} disabled={busy || !password}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
          Desbloquear o Admin
        </Button>
      </div>
    </div>
  );
}
