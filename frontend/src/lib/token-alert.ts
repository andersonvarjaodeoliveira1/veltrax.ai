import { toast } from "sonner";

import { ADMIN_WHATSAPP_URL, type TokenBalance } from "@/lib/token-balance";

const fmt = new Intl.NumberFormat("pt-BR");

export async function readTokenBalance(): Promise<TokenBalance | null> {
  try {
    const response = await fetch("/api/usage/me", { cache: "no-store" });
    if (!response.ok) return null;
    const data = (await response.json()) as TokenBalance;
    return typeof data?.used === "number" ? data : null;
  } catch {
    return null;
  }
}

/** Ao terminar um processo: avisa quanto foi gasto e quanto ainda resta. */
export async function announceTokens(label: string, before: TokenBalance | null) {
  const after = await readTokenBalance();
  if (!after) return;
  try { window.dispatchEvent(new Event("gv-tokens-changed")); } catch { /* sem janela */ }
  const spent = before ? Math.max(0, after.used - before.used) : 0;
  const used = before ? `usou ${fmt.format(spent)} tokens` : "";
  if (after.unlimited) {
    if (used) toast.success(`${label} concluída · ${used}`);
    return;
  }
  const left = `restam ${fmt.format(after.remaining ?? 0)} tokens`;
  const text = `${label} concluída · ${used ? `${used} · ` : ""}${left}`;
  if (after.exhausted) {
    toast.error(`${text}. Seus tokens acabaram.`, { action: { label: "Chamar o administrador", onClick: () => window.open(ADMIN_WHATSAPP_URL, "_blank", "noopener") }, duration: 12000 });
  } else {
    toast.success(text);
  }
}
