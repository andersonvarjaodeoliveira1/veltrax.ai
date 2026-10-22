"use client";

import { useCallback, useEffect, useState } from "react";

import type { TokenBalance } from "@/lib/token-balance";

/** Saldo de tokens do membro. Atualiza ao abrir, a cada minuto e quando o app avisa que gastou. */
export function useTokenBalance(enabled: boolean) {
  const [balance, setBalance] = useState<TokenBalance | null>(null);
  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/usage/me", { cache: "no-store" });
      if (response.ok) setBalance((await response.json()) as TokenBalance);
    } catch { /* sem rede: mantém o último saldo */ }
  }, []);
  useEffect(() => {
    if (!enabled) return;
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    const refresh = () => void load();
    window.addEventListener("gv-tokens-changed", refresh);
    return () => { window.clearInterval(timer); window.removeEventListener("gv-tokens-changed", refresh); };
  }, [enabled, load]);
  return balance;
}
