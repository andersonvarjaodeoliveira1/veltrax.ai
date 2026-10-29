"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { useFlowConnection } from "@/hooks/use-flow-connection";

/** true se `latest` é mais nova que `installed` (compara 1.16.1 com 1.15.0, número a número). */
export function isNewerVersion(latest: string, installed: string): boolean {
  const a = latest.split(".").map((n) => Number.parseInt(n, 10) || 0);
  const b = installed.split(".").map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  }
  return false;
}

/** Avisa o membro, em qualquer tela, quando a extensão instalada é mais antiga que a versão publicada (public/extensao/version.json). */
export function ExtensionUpdateNotice() {
  const { state, account } = useFlowConnection(true, false);
  useEffect(() => {
    if (state !== "connected" && state !== "logged-out") return; // extensão não instalada: quem avisa é a página Conectar ao Flow
    let cancelled = false;
    void fetch("/extensao/version.json", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { version?: string } | null) => {
        const latest = data?.version;
        if (cancelled || !latest || !isNewerVersion(latest, account.version || "0")) return;
        try {
          const key = `gv-ext-update-${latest}`;
          if (window.sessionStorage.getItem(key)) return; // uma vez por visita; volta a avisar na próxima até atualizar
          window.sessionStorage.setItem(key, "1");
        } catch { /* sem armazenamento: avisa mesmo assim */ }
        toast.info(`Atualização da extensão: ${account.version ? `${account.version} → ` : ""}${latest}`, {
          id: "extension-update",
          duration: Infinity,
          description: "Tem versão nova da extensão ClipGringa · Flow. Baixe, remova a antiga em chrome://extensions e carregue a nova.",
          action: { label: "Atualizar", onClick: () => window.location.assign("/conectar-flow") },
        });
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [state, account.version]);
  return null;
}
