import { ShieldCheck } from "lucide-react";

import { cn } from "@/lib/utils";

/** Aviso do dono, fixo em todas as telas: o sistema tem proteção contra robôs. O bloqueio em si é do SecurityWatch e do servidor. */
export const ROBOT_NOTICE =
  "Este sistema tem proteção contra robôs. Bots, automações e agentes de IA que entram para executar funções na ferramenta são detectados e a conta é bloqueada.";

/** Fica sempre na tela e não tem botão de fechar. */
export function RobotNotice({ className }: { className?: string }) {
  return (
    <p role="note" data-testid="robot-notice" className={cn("flex items-start gap-2 text-xs leading-5 text-muted-foreground", className)}>
      <ShieldCheck aria-hidden className="mt-[3px] size-3.5 shrink-0" />
      <span>{ROBOT_NOTICE}</span>
    </p>
  );
}
