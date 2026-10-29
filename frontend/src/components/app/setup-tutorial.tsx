"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Circle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useFlowConnection } from "@/hooks/use-flow-connection";
import { OPEN_ACCOUNT_AI_EVENT } from "@/lib/account-ai";

export const OPEN_TUTORIAL_EVENT = "gv-open-tutorial";
export const TUTORIAL_DONE_KEY = "gv-setup-tutorial-done";

export function tutorialDone(): boolean {
  try { return window.localStorage.getItem(TUTORIAL_DONE_KEY) === "1"; } catch { return false; }
}

type Step = { title: string; what: string; why: string };

const STEPS: Step[] = [
  {
    title: "Instale a extensão no Chrome",
    what: "Baixe a extensão ClipGringa · Flow, carregue no Chrome e deixe ligada.",
    why: "O Flow gera os vídeos no seu navegador, com a sua conta Google. Só a extensão consegue operar o Flow por você e avisar o ClipGringa o que está pronto. Ela nunca recebe a sua senha.",
  },
  {
    title: "Entre no Flow com a sua conta Google",
    what: "Abra o Flow (labs.google/fx/tools/flow) e entre. Deixe a aba aberta.",
    why: "Os créditos e os limites de geração são da sua conta. Sem entrar, o Flow trava no meio e nada é criado.",
  },
  {
    title: "Escolha a IA que escreve os textos",
    what: "Diga se você tem Gemini, ChatGPT, Claude ou uma chave de API (OpenAI, Claude, Gemini, OpenRouter ou Ollama). É opcional.",
    why: "Roteiros e prompts precisam de uma IA. Usando a sua, você não gasta os tokens do ClipGringa. A conta Google do Flow também abre o Gemini no navegador, mas os limites dependem do seu plano. A transcrição do vídeo é feita pelo próprio ClipGringa: não precisa conectar nada.",
  },
  {
    title: "Deixe o ClipGringa e o Flow abertos",
    what: "Enquanto gera, mantenha as duas abas abertas no Chrome.",
    why: "A geração roda no seu navegador. Se fechar, ela pausa. Se travar, quando você voltar eu pergunto se quer continuar de onde parou ou começar um projeto novo.",
  },
];

/** Tutorial curto antes de usar as ferramentas: o que fazer em cada passo e por que. Abre sozinho uma vez. */
export function SetupTutorial({ enabled }: { enabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const { state } = useFlowConnection(open, false);

  useEffect(() => {
    if (!enabled) return;
    if (!tutorialDone()) setOpen(true);
    const on = () => { setIndex(0); setOpen(true); };
    window.addEventListener(OPEN_TUTORIAL_EVENT, on);
    return () => window.removeEventListener(OPEN_TUTORIAL_EVENT, on);
  }, [enabled]);

  function finish(chooseAi = false) {
    try { window.localStorage.setItem(TUTORIAL_DONE_KEY, "1"); } catch { /* ignora */ }
    setOpen(false);
    if (chooseAi) window.dispatchEvent(new Event(OPEN_ACCOUNT_AI_EVENT));
  }

  if (!open) return null;
  const step = STEPS[index];
  const last = index === STEPS.length - 1;
  const status = index === 0
    ? state === "unknown" ? null : state === "no-extension" ? { ok: false, text: "Extensão não encontrada neste Chrome" } : { ok: true, text: "Extensão encontrada" }
    : index === 1
      ? state === "connected" ? { ok: true, text: "Conta do Flow conectada" } : state === "logged-out" ? { ok: false, text: "Flow aberto, mas sem login" } : state === "no-extension" ? { ok: false, text: "Instale a extensão primeiro" } : null
      : null;

  return (
    <Dialog open onOpenChange={(value) => { if (!value) finish(); }}>
      <DialogContent data-testid="setup-tutorial" className="max-w-lg border-[#7B3FE4]/40 bg-card">
        <DialogTitle>Antes de começar · passo {index + 1} de {STEPS.length}</DialogTitle>
        <DialogDescription className="sr-only">Tutorial rápido para deixar o ClipGringa pronto.</DialogDescription>
        <div className="flex gap-1" aria-hidden>
          {STEPS.map((_, i) => <span key={i} className={`h-1 flex-1 rounded-full ${i <= index ? "bg-[#7B3FE4]" : "bg-white/10"}`} />)}
        </div>
        <div className="space-y-3 text-sm">
          <p className="text-base font-semibold">{step.title}</p>
          <p><span className="font-medium text-[#C9BBFA]">O que fazer:</span> {step.what}</p>
          <p><span className="font-medium text-[#C9BBFA]">Por que:</span> {step.why}</p>
          {status && (
            <p role="status" className={`flex items-center gap-2 rounded-[12px] border border-border bg-background/40 p-2.5 text-xs ${status.ok ? "text-[#5BD69A]" : "text-[#F5B454]"}`}>
              {status.ok ? <Check className="size-3.5" /> : <Circle className="size-3.5" />}{status.text}
            </p>
          )}
          {index === 0 && <Link href="/conectar-flow" onClick={() => finish()} className="inline-block rounded-full border border-[#7B3FE4]/60 px-4 py-2 text-xs font-medium text-[#C9BBFA]">Abrir o passo a passo da extensão</Link>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {index > 0 && <button type="button" onClick={() => setIndex(index - 1)} className="rounded-full border border-border px-4 py-2 text-xs font-medium">Voltar</button>}
          {!last && <button type="button" onClick={() => setIndex(index + 1)} className="rounded-full bg-gradient-to-br from-[#8B5CF6] to-[#7B3FE4] px-4 py-2 text-xs font-medium text-white">Próximo</button>}
          {index === 2 && <button type="button" onClick={() => finish(true)} className="rounded-full border border-[#7B3FE4]/60 px-4 py-2 text-xs font-medium text-[#C9BBFA]">Escolher minha IA agora</button>}
          {last && <button type="button" onClick={() => finish()} className="rounded-full bg-gradient-to-br from-[#8B5CF6] to-[#7B3FE4] px-4 py-2 text-xs font-medium text-white">Entendi, começar</button>}
          <button type="button" onClick={() => finish()} className="ml-auto text-xs text-muted-foreground underline">Pular</button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
