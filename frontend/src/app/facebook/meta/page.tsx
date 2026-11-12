"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { card, primary, secondary } from "@/components/facebook/ui";
import { goToFacebookLogin } from "@/components/facebook/meta-connect";
import { fb } from "@/lib/facebook";
import { cn } from "@/lib/utils";

type Result = { name: string; conectadas: string[]; outras: Array<{ id: string; name: string; done?: boolean }> };

// Volta do login do Facebook: troca o código pelo acesso e mostra o que foi conectado.
export default function FacebookMetaReturn() {
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const q = new URLSearchParams(window.location.search);
    const code = q.get("code") ?? "";
    const state = q.get("state") ?? "";
    window.history.replaceState(null, "", window.location.pathname);
    if (q.get("error")) { setError("Você cancelou o login do Facebook. Nada foi mudado."); return; }
    if (!code) { setError("Não chegou nada do Facebook. Clique em Entrar com o Facebook de novo."); return; }
    fb.metaFinish(code, state).then(setResult).catch((problem) => setError((problem as Error).message));
  }, []);

  const bring = async (id: string) => {
    setBusy(id);
    try {
      const r = await fb.metaLink(id);
      setResult((cur) => cur && { ...cur, outras: cur.outras.map((o) => (o.id === id ? { ...o, done: true } : o)) });
      toast.success(`${r.name} conectada`);
    } catch (problem) { toast.error((problem as Error).message); } finally { setBusy(null); }
  };

  return (
    <div className="mx-auto w-full max-w-xl space-y-4 p-4 sm:p-8">
      <h1 className="text-2xl font-medium text-white">Facebook</h1>
      {error ? (
        <div className={cn(card, "space-y-3")}>
          <p className="text-sm text-white">{error}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={primary} onClick={() => void goToFacebookLogin()}>Entrar com o Facebook</button>
            <Link className={secondary} href="/facebook">Voltar</Link>
          </div>
        </div>
      ) : !result ? (
        <p className={cn(card, "text-sm text-white/70")}>Conectando suas páginas…</p>
      ) : (
        <div className={cn(card, "space-y-4")}>
          <p className="text-sm text-white">Entrou como {result.name}.</p>
          {result.conectadas.length ? (
            <div className="space-y-1">
              <p className="text-xs font-medium text-white/80">Já conectadas, postam sozinhas</p>
              <ul className="space-y-1">{result.conectadas.map((n) => <li key={n} className="text-sm text-white">{n}</li>)}</ul>
            </div>
          ) : null}
          {result.outras.length ? (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-white/80">Outras páginas suas. Traga as que o ClipGringa vai cuidar</p>
              <ul className="space-y-1.5">
                {result.outras.map((o) => (
                  <li key={o.id} className="flex items-center gap-3 rounded-[12px] border border-white/10 px-3 py-2">
                    <span className="min-w-0 flex-1 truncate text-sm text-white">{o.name}</span>
                    {o.done ? <span className="text-xs text-white/50">Conectada</span>
                      : <button type="button" className={secondary} disabled={busy === o.id} onClick={() => void bring(o.id)}>{busy === o.id ? "Conectando…" : "Trazer"}</button>}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {!result.conectadas.length && !result.outras.length ? <p className="text-sm text-white/70">Nenhuma página veio. Entre de novo e marque as páginas na tela do Facebook.</p> : null}
          <Link className={primary} href="/facebook">Ir para as páginas</Link>
        </div>
      )}
    </div>
  );
}
