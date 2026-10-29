"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { aiBillingUrl, type AiProblem } from "@/lib/ai-errors";
import { ADMIN_WHATSAPP_URL } from "@/lib/token-balance";

const NAMES: Record<string, string> = { openai: "OpenAI (ChatGPT)", anthropic: "Anthropic (Claude)", gemini: "Google (Gemini)" };

function copy(problem: AiProblem) {
  const who = NAMES[problem.provider] ?? "da IA";
  if (problem.kind === "no_credits") return {
    title: `Sua conta ${NAMES[problem.provider] ? `da ${who}` : "da IA"} está sem créditos`,
    text: `A chave que você conectou está certa, mas o saldo dela na ${NAMES[problem.provider] ?? "plataforma da IA"} acabou, e quem cobra é a própria plataforma, não o ClipGringa.${problem.provider === "openai" ? " A assinatura do ChatGPT (Plus/Pro) não inclui créditos da API: a API é cobrada à parte." : ""}`,
    steps: ["Adicione créditos na sua conta do provedor (botão abaixo).", "Ou use uma chave do Google Gemini, que tem uma cota grátis limitada: entre em aistudio.google.com/apikey, clique em “Create API key” e cole em Minhas APIs.", "Ou fale com o administrador para liberar tokens."],
  };
  if (problem.kind === "key_invalid") return {
    title: "A IA recusou a sua chave",
    text: "A chave conectada foi recusada pelo provedor: pode estar errada, revogada, sem permissão ou com a cobrança pendente.",
    steps: ["Confira ou cole a chave de novo em Minhas APIs.", "Veja no painel do provedor se a conta está ativa e com a cobrança em dia."],
  };
  if (problem.kind === "quota") return {
    title: "A IA atingiu o limite de uso",
    text: "O limite de uso da API da IA foi atingido agora. Não é um erro seu, e costuma voltar em alguns minutos.",
    steps: ["Espere alguns minutos e tente de novo.", "Para não depender desse limite, conecte a sua própria chave em Minhas APIs."],
  };
  return {
    title: "Seus tokens acabaram",
    text: "Os tokens da sua conta chegaram a zero, por isso a IA não pôde responder.",
    steps: ["Conecte a sua própria chave em Minhas APIs e use sem gastar tokens.", "Ou fale com o administrador para liberar mais tokens."],
  };
}

/** Janela de aviso para falhas da IA que dependem da conta da pessoa: sem créditos, chave recusada, limite ou tokens. */
export function AiProblemDialog() {
  const [problem, setProblem] = useState<AiProblem | null>(null);
  useEffect(() => {
    const on = (event: Event) => setProblem((event as CustomEvent<AiProblem>).detail ?? null);
    window.addEventListener("gv-ai-problem", on);
    return () => window.removeEventListener("gv-ai-problem", on);
  }, []);
  if (!problem) return null;
  const c = copy(problem);
  const billing = aiBillingUrl(problem.provider);
  return (
    <Dialog open onOpenChange={(open) => { if (!open) setProblem(null); }}>
      <DialogContent data-testid="ai-problem" className="max-w-md border-[#F5B454]/40 bg-card">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#F5B454]/15 text-[#F5B454]"><AlertTriangle className="size-5" /></span>
          <div className="space-y-1">
            <DialogTitle>{c.title}</DialogTitle>
            <DialogDescription>{c.text}</DialogDescription>
          </div>
        </div>
        <ol className="space-y-1.5 text-sm">
          {c.steps.map((step, i) => <li key={step} className="flex gap-2"><span className="text-[#A98BFF]">{i + 1}.</span>{step}</li>)}
        </ol>
        <div className="flex flex-wrap justify-end gap-2">
          {billing && problem.kind !== "quota" && problem.kind !== "tokens" && (
            <a href={billing} target="_blank" rel="noopener noreferrer" className="rounded-full bg-gradient-to-br from-[#8B5CF6] to-[#7B3FE4] px-4 py-2 text-xs font-medium text-white">Abrir a conta no provedor</a>
          )}
          {(problem.kind === "no_credits" || problem.kind === "key_invalid") && problem.provider !== "gemini" && (
            <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="rounded-full border border-[#5BD69A]/50 px-4 py-2 text-xs font-medium text-[#5BD69A]">Pegar chave do Gemini</a>
          )}
          <Link href="/minhas-apis" onClick={() => setProblem(null)} className="rounded-full border border-[#7B3FE4]/60 px-4 py-2 text-xs font-medium text-[#C9BBFA]">Abrir Minhas APIs</Link>
          <a href={ADMIN_WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="rounded-full border border-border px-4 py-2 text-xs font-medium">Chamar o administrador</a>
        </div>
      </DialogContent>
    </Dialog>
  );
}
