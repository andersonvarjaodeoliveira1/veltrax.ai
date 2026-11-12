"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { card, primary, secondary } from "@/components/facebook/ui";
import { goToFacebookLogin } from "@/components/facebook/meta-connect";
import { fb, type MapResult } from "@/lib/facebook";
import { cn } from "@/lib/utils";

// Volta do login do Facebook: guarda o acesso e mapeia o perfil e todas as páginas dele.
export default function FacebookMetaReturn() {
  const [result, setResult] = useState<MapResult | null>(null);
  const [error, setError] = useState<string | null>(null);
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

  const group = (title: string, names: string[]) => names.length ? (
    <div className="space-y-1">
      <p className="text-xs font-medium text-white/80">{title}</p>
      <ul className="space-y-1">{names.map((n) => <li key={n} className="text-sm text-white">{n}</li>)}</ul>
    </div>
  ) : null;

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
        <p className={cn(card, "text-sm text-white/70")}>Mapeando o perfil e as páginas…</p>
      ) : (
        <div className={cn(card, "space-y-4")}>
          <p className="text-sm text-white">Perfil {result.name} mapeado.</p>
          {group("Páginas novas, já conectadas", result.novas.filter((n) => !result.sem_permissao.includes(n)))}
          {group("Páginas que já estavam aqui, agora conectadas", result.conectadas)}
          {group("Mapeadas, mas seu perfil não pode publicar nelas", result.sem_permissao)}
          {!result.novas.length && !result.conectadas.length ? <p className="text-sm text-white/70">Nenhuma página veio. Entre de novo e marque as páginas na tela do Facebook.</p> : null}
          <Link className={primary} href="/facebook">Ver o resumo</Link>
        </div>
      )}
    </div>
  );
}
