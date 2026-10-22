"use client";

import { useEffect, useState } from "react";
import { Check, Download, ExternalLink, Film } from "lucide-react";
import { useSession } from "@/lib/auth-client";
import { FLOW_MODELS, readFlowCategory, saveFlowCategory } from "@/lib/flow-models";
import { cn } from "@/lib/utils";

const FLOW_URL = "https://flow.google.com";
// Link compartilhado do app "ClipGringa — Gerar Vídeos" dentro do Flow. Só aparece depois de criado e configurado.
const FLOW_TOOL_SHARE_URL = process.env.NEXT_PUBLIC_FLOW_TOOL_SHARE_URL ?? "";
const KEY = "gv-conectar-flow-v1";

type Done = { flow: boolean; extension: boolean };

export default function ConnectFlowPage() {
  const [done, setDone] = useState<Done>({ flow: false, extension: false });
  const { data: session } = useSession();
  const isAdmin = Boolean((session?.user as { is_admin?: boolean } | undefined)?.is_admin);
  const [category, setCategory] = useState<string>(FLOW_MODELS[0].id);
  useEffect(() => { setCategory(readFlowCategory() ?? FLOW_MODELS[0].id); }, []);
  const chooseCategory = (id: string) => { setCategory(id); saveFlowCategory(id); };

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(KEY) ?? "{}");
      setDone({ flow: Boolean(saved.flow), extension: Boolean(saved.extension) });
    } catch { /* storage unavailable */ }
  }, []);

  const mark = (patch: Partial<Done>) => {
    setDone((current) => {
      const next = { ...current, ...patch };
      try { window.localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
      return next;
    });
  };

  const ready = done.flow && done.extension;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-4 sm:p-8">
      <div>
        <h1 className="text-2xl font-semibold">Conectar ao Flow</h1>
        <p className="mt-1 text-sm text-muted-foreground">Os vídeos são gerados na <b>sua</b> conta do Flow. Faça os dois passos abaixo uma vez e deixe a conta conectada neste navegador.</p>
      </div>

      <section className="space-y-3 rounded-[18px] border border-border bg-card p-5" data-testid="step-category">
        <p className="font-medium">Sua categoria no Flow</p>
        {isAdmin ? (
          <p className="text-xs text-muted-foreground" data-testid="category-admin">Conta administradora: gera em <b>Veo 3.1 - Lite [Lower Priority]</b>, sem gastar créditos.</p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">Escolha o modelo que você quer usar. Ele vira o padrão em todos os seus vídeos e cada cena gasta créditos da sua conta do Flow.</p>
            <div className="flex flex-wrap gap-2">
              {FLOW_MODELS.map((m) => (
                <button key={m.id} type="button" aria-pressed={m.id === category} onClick={() => chooseCategory(m.id)}
                  className={cn("rounded-[12px] border px-3 py-2 text-left text-xs", m.id === category ? "border-[#7B3FE4] bg-[#7B3FE4]/20" : "border-border text-muted-foreground")}>
                  <span className="block font-medium text-foreground">{m.name}</span>
                  <span className="block">{m.credits} créditos por cena · {m.note}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </section>

      <section className="space-y-3 rounded-[18px] border border-border bg-card p-5" data-testid="step-flow">
        <p className="flex items-center gap-2 font-medium">
          <span className="grid size-6 place-items-center rounded-full bg-[#7B3FE4]/25 text-xs">{done.flow ? <Check className="size-3.5 text-[#5BD69A]" /> : "1"}</span>
          Entre no Flow com a sua conta Google
        </p>
        <p className="text-xs text-muted-foreground">Vamos abrir o Flow em outra aba. Entre com a conta Google que tem o plano do Flow e deixe a sessão aberta. Depois volte aqui.</p>
        <div className="flex flex-wrap items-center gap-2">
          <a href={FLOW_URL} target="_blank" rel="noopener noreferrer" onClick={() => mark({ flow: true })}
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[#8B5CF6] to-[#7B3FE4] px-4 py-2 text-sm font-medium text-white">
            <ExternalLink className="size-4" /> Abrir o Flow e entrar
          </a>
          {done.flow && <span className="text-xs text-[#5BD69A]">Aberto. Se já entrou na sua conta, está certo.</span>}
        </div>
      </section>

      <section className="space-y-3 rounded-[18px] border border-border bg-card p-5" data-testid="step-extension">
        <p className="flex items-center gap-2 font-medium">
          <span className="grid size-6 place-items-center rounded-full bg-[#7B3FE4]/25 text-xs">{done.extension ? <Check className="size-3.5 text-[#5BD69A]" /> : "2"}</span>
          Instale a extensão do ClipGringa
        </p>
        <p className="text-xs text-muted-foreground">É ela que gera as imagens e os vídeos sozinha dentro do seu Flow.</p>
        <a href="/extensao/clipgringa-flow.zip" download onClick={() => mark({ extension: true })}
          className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm hover:text-foreground">
          <Download className="size-4" /> Baixar a extensão
        </a>
        <ol className="list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
          <li>Descompacte o arquivo baixado.</li>
          <li>No Chrome, abra <span className="font-mono">chrome://extensions</span> e ligue o “Modo do desenvolvedor”.</li>
          <li>Clique em “Carregar sem compactação” e escolha a pasta <span className="font-mono">flow</span>.</li>
        </ol>
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

      <p role="status" className={ready ? "rounded-[14px] border border-[#5BD69A]/40 bg-[#5BD69A]/10 p-3 text-sm text-[#5BD69A]" : "text-xs text-muted-foreground"}>
        {ready ? "Tudo certo! Agora é só criar os vídeos na Automação. Quando chegar o momento de gerar, o app leva você ao Flow." : "Faça os dois passos para liberar a geração no seu Flow."}
      </p>
    </div>
  );
}
