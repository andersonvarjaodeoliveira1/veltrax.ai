"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, ExternalLink, Loader2, Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { accountReasonText } from "@/lib/ai-errors";
import {
  ACCOUNT_SITES, OPEN_ACCOUNT_AI_EVENT, askAccount, dismissSetup, dismissedRecently, extensionHasAi, probeSite, readChoice, writeChoice,
  type AccountSite, type SiteState,
} from "@/lib/account-ai";

type Pick = AccountSite | "api" | "none";
type Step = "quiz" | "connect" | "testing" | "done" | "fail" | "noext";

const OPTIONS: { id: Pick; title: string; sub: string }[] = [
  { id: "gemini", title: "Gemini", sub: "Conta do Google" },
  { id: "chatgpt", title: "ChatGPT", sub: "Conta da OpenAI" },
  { id: "claude", title: "Claude", sub: "Conta da Anthropic" },
  { id: "api", title: "Tenho chave de API", sub: "OpenAI, Claude ou Gemini" },
  { id: "none", title: "Nenhuma", sub: "Usar os créditos do plano" },
];

const STATE_TEXT: Partial<Record<SiteState, string>> = {
  notab: "Esperando você abrir e entrar na sua conta…",
  login: "Achei o site, mas você ainda não entrou na conta…",
  loading: "A página ainda está carregando…",
  guest: "Você está usando sem login. Entre na sua conta para não bater no limite de visitantes.",
  blocked: "O site pediu uma verificação (captcha). Resolva na aba dele.",
  nopage: "Não consegui falar com o site. Confira se a extensão está ligada.",
};

/** Pergunta qual conta de IA a pessoa tem e deixa tudo conectado e testado. Abre sozinho uma vez, quando a extensão nova é detectada. */
export function AccountAiSetup({ enabled }: { enabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("quiz");
  const [site, setSite] = useState<AccountSite | null>(null);
  const [siteState, setSiteState] = useState<SiteState>("notab");
  const [failure, setFailure] = useState("");
  const busy = useRef(false);

  const begin = useCallback(async () => {
    setStep("quiz"); setSite(null); setFailure("");
    setOpen(true);
    if (!(await extensionHasAi())) setStep("noext");
  }, []);

  // Abre sozinho na primeira vez (extensão nova detectada, sem escolha feita e sem chave de API).
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      if (readChoice() || dismissedRecently()) return;
      if (!(await extensionHasAi()) || cancelled) return;
      try {
        const response = await fetch("/api/integrations", { cache: "no-store" });
        const data = response.ok ? await response.json() : { integrations: [] };
        if ((data.integrations ?? []).some((item: { provider: string; connected: boolean }) => item.connected && ["gemini", "openai", "anthropic"].includes(item.provider))) return;
      } catch { /* segue: pergunta mesmo assim */ }
      if (!cancelled && !readChoice()) { setStep("quiz"); setSite(null); setOpen(true); }
    }, 4000);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [enabled]);

  useEffect(() => {
    const on = () => void begin();
    window.addEventListener(OPEN_ACCOUNT_AI_EVENT, on);
    return () => window.removeEventListener(OPEN_ACCOUNT_AI_EVENT, on);
  }, [begin]);

  const test = useCallback(async (target: AccountSite) => {
    if (busy.current) return;
    busy.current = true;
    setStep("testing"); setFailure("");
    try {
      const result = await askAccount(target, "Responda apenas com a palavra OK.", 70_000);
      if (result.ok && (result.text ?? "").trim()) { writeChoice(target); setStep("done"); return; }
      setFailure(accountReasonText(target, (result.error ?? "failed").split(":")[0]));
      setStep("fail");
    } finally { busy.current = false; }
  }, []);

  // Enquanto espera a pessoa entrar na conta, olha as abas dela a cada 3 s e testa assim que estiver pronta.
  useEffect(() => {
    if (!open || step !== "connect" || !site) return;
    let cancelled = false;
    const tick = async () => {
      const state = await probeSite(site, false);
      if (cancelled) return;
      setSiteState(state);
      if (state === "ready") void test(site);
    };
    void tick();
    const timer = window.setInterval(() => void tick(), 3000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [open, step, site, test]);

  function choose(pick: Pick) {
    if (pick === "api") { writeChoice("api"); setOpen(false); return; }
    if (pick === "none") { writeChoice("none"); setOpen(false); return; }
    setSite(pick); setSiteState("notab"); setStep("connect");
  }

  function close() {
    if (!readChoice()) dismissSetup();
    setOpen(false);
  }

  if (!open) return null;
  const name = site ? ACCOUNT_SITES[site].label : "";
  return (
    <Dialog open onOpenChange={(value) => { if (!value) close(); }}>
      <DialogContent data-testid="account-ai-setup" className="max-w-lg border-[#7B3FE4]/40 bg-card">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#7B3FE4]/15 text-[#A98BFF]"><Sparkles className="size-5" /></span>
          <div className="space-y-1">
            <DialogTitle>Como você quer gerar os textos com IA?</DialogTitle>
            <DialogDescription>
              Os roteiros e os prompts precisam de uma IA. Se você já assina o Gemini, o ChatGPT ou o Claude, dá para usar a sua própria conta pela extensão, sem gastar tokens do ClipGringa.
            </DialogDescription>
          </div>
        </div>

        {step === "quiz" && (
          <div className="space-y-3">
            <p className="text-sm font-medium">Qual conta você tem?</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {OPTIONS.map((option) => (
                <button key={option.id} type="button" onClick={() => choose(option.id)}
                  className="rounded-[14px] border border-border bg-background/40 p-3 text-left transition-colors hover:border-[#7B3FE4]/60 hover:bg-[#7B3FE4]/10">
                  <span className="block text-sm font-semibold">{option.title}</span>
                  <span className="block text-xs text-muted-foreground">{option.sub}</span>
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Quem tem chave de API continua usando a API: ela passa na frente da conta. Eu aviso, a cada geração, por onde o texto saiu.</p>
          </div>
        )}

        {step === "noext" && (
          <div className="space-y-3 text-sm" data-testid="account-ai-noext">
            <p>Para usar a sua conta, preciso da extensão do ClipGringa atualizada (versão 1.16.0 ou mais nova) neste Chrome.</p>
            <Link href="/conectar-flow" onClick={() => setOpen(false)} className="inline-block rounded-full bg-gradient-to-br from-[#8B5CF6] to-[#7B3FE4] px-4 py-2 text-xs font-medium text-white">Baixar ou atualizar a extensão</Link>
            <p className="text-xs text-muted-foreground">Depois de instalar, recarregue esta página e escolha a conta de novo.</p>
          </div>
        )}

        {step === "connect" && site && (
          <div className="space-y-3 text-sm" data-testid="account-ai-connect">
            <ol className="space-y-2">
              <li className="flex gap-2"><span className="text-[#A98BFF]">1.</span>
                <span>Abra o {name} e entre na sua conta (deixe a aba aberta).{" "}
                  <a href={ACCOUNT_SITES[site].url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[#C9BBFA] underline">Abrir o {name}<ExternalLink className="size-3" /></a>
                </span>
              </li>
              <li className="flex gap-2"><span className="text-[#A98BFF]">2.</span><span>Volte aqui: eu detecto sozinho e faço um teste rápido.</span></li>
            </ol>
            <p role="status" className="flex items-center gap-2 rounded-[12px] border border-border bg-background/40 p-2.5 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />{STATE_TEXT[siteState] ?? "Verificando…"}
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void test(site)} className="rounded-full border border-[#7B3FE4]/60 px-4 py-2 text-xs font-medium text-[#C9BBFA]">Já entrei, testar agora</button>
              <button type="button" onClick={() => setStep("quiz")} className="rounded-full border border-border px-4 py-2 text-xs font-medium">Escolher outra</button>
            </div>
          </div>
        )}

        {step === "testing" && site && (
          <p role="status" className="flex items-center gap-2 text-sm"><Loader2 className="size-4 animate-spin" />Testando a sua conta do {name}… uma aba pode abrir e fechar sozinha.</p>
        )}

        {step === "fail" && site && (
          <div className="space-y-3 text-sm" data-testid="account-ai-fail">
            <p>{failure}</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void test(site)} className="rounded-full bg-gradient-to-br from-[#8B5CF6] to-[#7B3FE4] px-4 py-2 text-xs font-medium text-white">Tentar de novo</button>
              <button type="button" onClick={() => { setStep("connect"); setSiteState("notab"); }} className="rounded-full border border-border px-4 py-2 text-xs font-medium">Voltar</button>
            </div>
          </div>
        )}

        {step === "done" && site && (
          <div className="space-y-3 text-sm" data-testid="account-ai-done">
            <p className="flex items-center gap-2 font-medium text-[#5BD69A]"><Check className="size-4" />Pronto! A sua conta do {name} está conectada.</p>
            <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
              <li>Quando você gerar roteiros e prompts, eles saem pela sua conta do {name}.</li>
              <li>Se você conectar uma chave de API em Minhas APIs, a API é usada primeiro.</li>
              <li>Deixe o ClipGringa aberto no Chrome enquanto gera. Se a conta não responder, uso os créditos do plano e aviso você.</li>
            </ul>
            <button type="button" onClick={() => setOpen(false)} className="rounded-full bg-gradient-to-br from-[#8B5CF6] to-[#7B3FE4] px-4 py-2 text-xs font-medium text-white">Fechar</button>
          </div>
        )}

        {(step === "quiz" || step === "noext") && (
          <button type="button" onClick={close} className="self-start text-xs text-muted-foreground underline">Agora não</button>
        )}
      </DialogContent>
    </Dialog>
  );
}

