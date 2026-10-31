"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Film, Link2 } from "lucide-react";
import { useSession } from "@/lib/auth-client";
import { useFlowConnection } from "@/hooks/use-flow-connection";
import { FLOW_CHOICES, defaultFlowCategory, saveFlowCategory, visibleFlowChoices } from "@/lib/flow-models";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/app/page-header";
import { ConnectAll } from "@/components/app/connect-all";

// Link compartilhado do app "ClipGringa — Gerar Vídeos" dentro do Flow. Só aparece depois de criado e configurado.
const FLOW_TOOL_SHARE_URL = process.env.NEXT_PUBLIC_FLOW_TOOL_SHARE_URL ?? "";

export default function ConnectFlowPage() {
  const { data: session } = useSession();
  const isAdmin = Boolean((session?.user as { is_admin?: boolean } | undefined)?.is_admin);
  const { account } = useFlowConnection(true, false);
  const [category, setCategory] = useState<string>(FLOW_CHOICES[1].id);
  useEffect(() => { setCategory(defaultFlowCategory(isAdmin)); }, [isAdmin]);
  const chooseCategory = (id: string) => { setCategory(id); saveFlowCategory(id); };


  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-4 sm:p-8">
      <PageHeader icon={Link2} title="Conectar ao Flow" description={<>Os vídeos são gerados na <b>sua</b> conta do Flow. Faça os passos abaixo uma vez e deixe a conta conectada neste navegador.</>} />

      <ConnectAll />



      <section className="space-y-3 rounded-[18px] border border-border bg-card p-5" data-testid="step-category">
        <p className="font-medium">Sua categoria no Flow</p>
        <p className="text-xs text-muted-foreground">Escolha o modelo que você quer usar. Ele vira o padrão em todos os seus vídeos. O <b>Lower Priority</b> (0 créditos) só aparece para o plano <b>Ultra</b>, lido da sua conta quando você entra no Flow; nas demais, cada cena gasta créditos da sua conta do Flow.</p>
        <div className="flex flex-wrap gap-2">
          {visibleFlowChoices(account.plan).map((m) => (
            <button key={m.id} type="button" aria-pressed={m.id === category} onClick={() => chooseCategory(m.id)}
              className={cn("rounded-[12px] border px-3 py-2 text-left text-xs", m.id === category ? "border-[#7B3FE4] bg-[#7B3FE4]/20" : "border-border text-muted-foreground")}>
              <span className="block font-medium text-foreground">{m.name}</span>
              <span className="block">{m.credits === 0 ? "0 créditos" : `${m.credits} créditos por cena`} · {m.note}</span>
            </button>
          ))}
        </div>
      </section>



      {FLOW_TOOL_SHARE_URL && (
        <section className="space-y-3 rounded-[18px] border border-border bg-card p-5" data-testid="step-tool">
          <p className="flex items-center gap-2 font-medium"><Film className="size-4 text-[#A98BFF]" /> App ClipGringa dentro do Flow</p>
          <p className="text-xs text-muted-foreground">Esse app já fica disponível na sua conta do Flow. Ele usa os créditos da sua conta.</p>
          <a href={FLOW_TOOL_SHARE_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm hover:text-foreground">
            <ExternalLink className="size-4" /> Abrir o app no Flow
          </a>
        </section>
      )}


    </div>
  );
}
