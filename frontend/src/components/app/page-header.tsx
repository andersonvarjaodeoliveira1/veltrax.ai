import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Cabeçalho padrão das telas do app: ícone em destaque, título, explicação curta e um ponto de ação opcional. */
export function PageHeader({ icon: Icon, title, description, action, className }: {
  icon: LucideIcon;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-wrap items-start gap-4", className)}>
      <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-[16px] bg-gradient-to-br from-[#8B5CF6] to-[#7B3FE4] text-white shadow-[0_10px_28px_-10px_#7B3FE4]">
        <Icon className="size-6" />
      </span>
      <div className="min-w-0 flex-1">
        <h1 className="font-display text-2xl font-bold tracking-tight">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}
