"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { accountReasonText, ACCOUNT_SITE_NAME, aiBillingUrl, type AiProblem } from "@/lib/ai-errors";
import { ADMIN_WHATSAPP_URL } from "@/lib/token-balance";

const NAMES: Record<string, string> = {
  openai: "OpenAI (ChatGPT)", anthropic: "Anthropic (Claude)", gemini: "Google (Gemini)", openrouter: "OpenRouter", huggingface: "Hugging Face", ollama: "Ollama",
};

type Action = { label: string; href: string; external?: boolean };
type Choice = { title: string; text: string; action: Action[] };
type Copy = { title: string; text: string; choices: Choice[] };

const GEMINI_KEY: Action = { label: "Pegar chave do Gemini", href: "https://aistudio.google.com/apikey", external: true };
const MY_APIS: Action = { label: "Abrir Minhas APIs", href: "/minhas-apis" };
const ADMIN: Action = { label: "Chamar o administrador", href: ADMIN_WHATSAPP_URL, external: true };

/** Textos simples: o que aconteceu, e cada saída com o botão dela logo embaixo (a pessoa clica no botão da opção que escolher). */
function copy(problem: AiProblem): Copy {
  if (problem.kind === "account") {
    const name = ACCOUNT_SITE_NAME[problem.provider] ?? "da IA";
    return {
      title: `Não consegui gerar pela sua conta do ${name}`,
      text: accountReasonText(problem.provider, problem.reason ?? "failed"),
      choices: [
        { title: "Conferir a sua conta", text: `Abra o ${name} neste Chrome, entre na conta e deixe o ClipGringa aberto. Depois é só gerar de novo.`, action: [] },
        { title: "Usar uma chave de API", text: "Conecte uma chave em Minhas APIs e a geração não depende da conta aberta no navegador.", action: [MY_APIS] },
        { title: "Pedir ajuda", text: "Se continuar, fale com a gente.", action: [ADMIN] },
      ],
    };
  }
  const name = NAMES[problem.provider];
  const who = name ?? "da IA";
  if (problem.kind === "no_credits") {
    const billing = aiBillingUrl(problem.provider);
    return {
      title: name ? `O saldo da sua chave da ${name} acabou` : "O saldo da sua chave de IA acabou",
      text: "A chave está certa, mas não tem mais saldo para gerar. Escolha uma das opções abaixo e clique no botão dela.",
      choices: [
        ...(billing && problem.provider !== "gemini" ? [{
          title: `Colocar saldo na ${name ?? "plataforma da IA"}`,
          text: `Abre o site de cobrança. Lá você adiciona crédito e depois volta aqui para gerar de novo.${problem.provider === "openai" ? " Atenção: a assinatura do ChatGPT (Plus/Pro) não vale para isso; a API é cobrada à parte." : ""}`,
          action: [{ label: `Colocar saldo na ${name ?? "plataforma"}`, href: billing, external: true }],
        }] : []),
        ...(problem.provider !== "gemini" ? [{
          title: "Usar o Gemini, do Google",
          text: "Tem uma cota grátis limitada. Crie uma chave (clique em “Create API key”) e cole em Minhas APIs.",
          action: [GEMINI_KEY, MY_APIS],
        }] : [{ title: "Tentar outra chave", text: "A cota do Gemini acabou por hoje. Cole outra chave em Minhas APIs ou espere ela voltar.", action: [MY_APIS] }]),
        { title: "Pedir ajuda", text: "O administrador pode liberar tokens para você gerar sem chave.", action: [ADMIN] },
      ],
    };
  }
  if (problem.kind === "key_invalid") return {
    title: `A IA ${who} recusou a sua chave`,
    text: "A chave que você colou não foi aceita: pode estar errada, apagada ou com a cobrança pendente.",
    choices: [
      { title: "Colar a chave de novo", text: "Copie a chave inteira no site da IA e cole outra vez em Minhas APIs.", action: [MY_APIS] },
      { title: "Conferir a cobrança", text: "No site da IA, veja se a conta está ativa e com o pagamento em dia.", action: aiBillingUrl(problem.provider) ? [{ label: "Abrir o site da IA", href: aiBillingUrl(problem.provider), external: true }] : [] },
      { title: "Pedir ajuda", text: "Se não resolver, fale com a gente.", action: [ADMIN] },
    ],
  };
  if (problem.kind === "quota") return {
    title: "A IA está no limite de uso agora",
    text: "Não é erro seu. O limite costuma voltar em poucos minutos.",
    choices: [
      { title: "Esperar e tentar de novo", text: "Aguarde uns minutos e gere outra vez.", action: [] },
      { title: "Usar a sua própria chave", text: "Com a sua chave você não depende desse limite.", action: [MY_APIS] },
    ],
  };
  return {
    title: "Seus tokens acabaram",
    text: "Os tokens da sua conta chegaram a zero, por isso a IA não pôde responder. Escolha uma das opções abaixo.",
    choices: [
      { title: "Usar a sua conta de IA", text: "Gemini, ChatGPT ou Claude: conecte pela extensão ou com uma chave, sem gastar tokens.", action: [MY_APIS] },
      { title: "Pedir mais tokens", text: "O administrador pode liberar.", action: [ADMIN] },
    ],
  };
}

function ActionButton({ action, onDone }: { action: Action; onDone: () => void }) {
  const cls = "inline-block rounded-full bg-gradient-to-br from-[#8B5CF6] to-[#7B3FE4] px-4 py-2 text-xs font-medium text-white";
  return action.external
    ? <a href={action.href} target="_blank" rel="noopener noreferrer" className={cls}>{action.label}</a>
    : <Link href={action.href} onClick={onDone} className={cls}>{action.label}</Link>;
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
  return (
    <Dialog open onOpenChange={(open) => { if (!open) setProblem(null); }}>
      <DialogContent data-testid="ai-problem" className="max-h-[90vh] max-w-md overflow-y-auto border-[#F5B454]/40 bg-card">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#F5B454]/15 text-[#F5B454]"><AlertTriangle className="size-5" /></span>
          <div className="space-y-1">
            <DialogTitle>{c.title}</DialogTitle>
            <DialogDescription>{c.text}</DialogDescription>
          </div>
        </div>
        <ul className="space-y-2.5">
          {c.choices.map((choice, i) => (
            <li key={choice.title} className="space-y-2 rounded-[14px] border border-border bg-background/40 p-3">
              <p className="text-sm font-semibold"><span className="mr-1.5 text-[#A98BFF]">Opção {i + 1}</span>{choice.title}</p>
              <p className="text-xs text-muted-foreground">{choice.text}</p>
              {choice.action.length > 0 && (
                <div className="flex flex-wrap gap-2">{choice.action.map((a) => <ActionButton key={a.label} action={a} onDone={() => setProblem(null)} />)}</div>
              )}
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
