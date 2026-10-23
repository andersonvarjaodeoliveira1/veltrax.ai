"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

export type FlowAccount = { plan: string | null; credits: number | null; seenAt: number | null };
/** unknown = ainda checando · no-extension = extensão não encontrada · logged-out = Flow aberto sem login · connected = conta conectada */
export type FlowState = "unknown" | "no-extension" | "logged-out" | "connected";

const SEEN_KEY = "gv-flow-seen-connected";
const SENT_EVERY_MS = 5 * 60 * 1000;
const FRESH_MS = 12 * 60 * 60 * 1000;

/** Pergunta à extensão se a conta do Flow está conectada, avisa o membro quando muda e informa o servidor (Admin). */
export function useFlowConnection(enabled: boolean, report = true) {
  const [state, setState] = useState<FlowState>("unknown");
  const [account, setAccount] = useState<FlowAccount>({ plan: null, credits: null, seenAt: null });
  const last = useRef<{ state: FlowState; sentAt: number }>({ state: "unknown", sentAt: 0 });

  useEffect(() => {
    if (!enabled) return;
    let answered = false;

    const apply = (next: FlowState, info: FlowAccount) => {
      setState(next);
      setAccount(info);
      if (!report) return;
      const previous = last.current.state;
      const connected = next === "connected";
      if (connected && previous !== "connected") {
        let seen = false;
        try { seen = window.localStorage.getItem(SEEN_KEY) === "1"; window.localStorage.setItem(SEEN_KEY, "1"); } catch { /* storage unavailable */ }
        if (previous !== "unknown" || !seen) toast.success("Conta do Flow conectada ✓");
      } else if (!connected && previous === "connected") {
        toast.error(next === "logged-out" ? "A conta do Flow foi desconectada. Entre de novo no Flow." : "Não encontrei a extensão do Flow. Confira se ela está ligada no Chrome.");
      }
      // Avisa o servidor (Admin) quando conecta, quando desconecta e, enquanto conectada, de tempos em tempos.
      const disconnected = previous === "connected" && !connected;
      const due = connected && Date.now() - last.current.sentAt > SENT_EVERY_MS;
      if ((connected && previous !== "connected") || disconnected || due) {
        void fetch("/api/flow/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ connected, plan: info.plan, credits: info.credits }),
        }).catch(() => undefined);
        last.current.sentAt = Date.now();
      }
      last.current.state = next;
    };

    const onMessage = (event: MessageEvent) => {
      if ((event.origin && event.origin !== window.location.origin) || !event.data || event.data.source !== "clipgringa-flow" || event.data.type !== "status") return;
      answered = true;
      const d = event.data;
      const info: FlowAccount = { plan: d.plan ?? null, credits: typeof d.credits === "number" ? d.credits : null, seenAt: d.seenAt ?? null };
      const fresh = typeof d.seenAt === "number" && Date.now() - d.seenAt < FRESH_MS;
      apply(d.loggedIn === true && fresh ? "connected" : "logged-out", info);
    };

    const ask = () => {
      answered = false;
      window.postMessage({ source: "clipgringa-page", type: "flow-status?" }, window.location.origin);
      window.setTimeout(() => { if (!answered) apply("no-extension", { plan: null, credits: null, seenAt: null }); }, 2500);
    };

    window.addEventListener("message", onMessage);
    ask();
    const timer = window.setInterval(ask, 30_000);
    return () => { window.removeEventListener("message", onMessage); window.clearInterval(timer); };
  }, [enabled, report]);

  return { state, account };
}
