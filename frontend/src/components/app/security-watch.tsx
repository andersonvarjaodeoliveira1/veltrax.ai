"use client";

import { useEffect } from "react";
import { isEditable, looksLikeCode, shortcutKind, type WatchKind } from "@/lib/security-watch";

const THROTTLE_MS = 10 * 60 * 1000;

/** Avisa o servidor (que manda o alerta por e-mail) quando alguém tenta abrir o código ou copiar a tela. Não bloqueia nada. */
export function SecurityWatch({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (!enabled) return;
    const last: Partial<Record<WatchKind, number>> = {};
    const report = (kind: WatchKind, detail = "") => {
      const now = Date.now();
      if (now - (last[kind] ?? 0) < THROTTLE_MS) return;
      last[kind] = now;
      void fetch("/api/security/report", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, page: window.location.pathname, detail }), keepalive: true }).catch(() => {});
    };
    const onContext = (event: MouseEvent) => { if (!isEditable(event.target)) report("contextmenu"); };
    const onKey = (event: KeyboardEvent) => { const kind = shortcutKind(event); if (kind) report(kind); };
    const onPaste = (event: ClipboardEvent) => {
      const text = event.clipboardData?.getData("text") ?? "";
      if (looksLikeCode(text)) report("paste_code", `${text.length} caracteres`); // nunca envia o conteúdo colado
    };
    const onCopy = () => {
      const size = window.getSelection()?.toString().length ?? 0;
      if (size > 1500) report("copy_large", `${size} caracteres`);
    };
    document.addEventListener("contextmenu", onContext);
    document.addEventListener("keydown", onKey);
    document.addEventListener("paste", onPaste, true);
    document.addEventListener("copy", onCopy);
    return () => {
      document.removeEventListener("contextmenu", onContext);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("paste", onPaste, true);
      document.removeEventListener("copy", onCopy);
    };
  }, [enabled]);
  return null;
}
