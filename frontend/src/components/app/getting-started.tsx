"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Check, ChevronDown, Loader2 } from "lucide-react";

import { isNewerVersion } from "@/components/app/extension-update-notice";
import { useFlowConnection } from "@/hooks/use-flow-connection";
import { useTokenBalance } from "@/hooks/use-token-balance";
import { ACCOUNT_AI_EVENT, ACCOUNT_SITES, OPEN_ACCOUNT_AI_EVENT, isAccountSite, readChoice } from "@/lib/account-ai";
import { ADMIN_WHATSAPP_URL } from "@/lib/token-balance";
import { cn } from "@/lib/utils";

const FLOW_URL = "https://labs.google/fx/pt/tools/flow";
const COLLAPSED_KEY = "gv-getting-started-collapsed";
const AI_API_PROVIDERS = ["gemini", "openai", "anthropic", "openrouter", "huggingface", "ollama"];
const API_NAME: Record<string, string> = { gemini: "Gemini", openai: "OpenAI", anthropic: "Claude", openrouter: "OpenRouter", huggingface: "Hugging Face", ollama: "Ollama" };
const fmt = new Intl.NumberFormat("pt-BR");

type Tone = "ok" | "todo" | "warn" | "wait";
type Action = { label: string; href?: string; external?: boolean; onClick?: () => void; primary?: boolean };
type Step = { id: string; title: string; tone: Tone; status: string; how: string[]; actions: Action[] };

const TOOLS = [
  { href: "/", name: "Novos cortes", text: "Envie um vídeo longo ou um link do YouTube e receba cortes verticais com legenda e nota de potencial viral." },
  { href: "/automacao", name: "Vídeo orgânico", text: "Modele um vídeo que já vende: o ClipGringa escreve as cenas e a extensão gera cada uma no Flow." },
  { href: "/influencer", name: "Avatar influencer", text: "Crie uma influencer com IA e gere vídeos dela apresentando o seu produto." },
  { href: "/juntar-videos", name: "Juntar vídeos", text: "Junte as cenas na ordem que quiser, com legenda e título, num vídeo final." },
];

/**
 * Primeiros passos: o que a pessoa precisa conectar para o ClipGringa funcionar,
 * com a situação real de cada etapa (extensão, Flow, IA dos textos e tokens) e como cada uma funciona.
 */
export function GettingStarted() {
  const { state, account } = useFlowConnection(true, false);
  const balance = useTokenBalance(true);
  const [latest, setLatest] = useState("");
  const [apis, setApis] = useState<string[] | null>(null);
  // Chaves que servem para a transcrição e os cortes (API própria obrigatória): Gemini ou ChatGPT (OpenAI).
  const [cutKeys, setCutKeys] = useState<string[] | null>(null);
  const [site, setSite] = useState<string | null>(null);
  const [relayReady, setRelayReady] = useState<boolean | null>(null);
  const [collapsed, setCollapsed] = useState<boolean | null>(null);
  const [openStep, setOpenStep] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/extensao/version.json", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null))
      .then((d: { version?: string } | null) => { if (alive && d?.version) setLatest(d.version); }).catch(() => undefined);
    const loadApis = () => fetch("/api/integrations", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null))
      .then((d: { integrations?: { provider: string; connected: boolean }[] } | null) => {
        if (!alive) return;
        const connected = (d?.integrations ?? []).filter((i) => i.connected);
        setApis(connected.filter((i) => AI_API_PROVIDERS.includes(i.provider)).map((i) => API_NAME[i.provider] ?? i.provider));
        setCutKeys(connected.filter((i) => i.provider === "gemini" || i.provider === "openai").map((i) => (i.provider === "openai" ? "ChatGPT" : "Gemini")));
      }).catch(() => { if (alive) { setApis([]); setCutKeys([]); } });
    void loadApis();
    window.addEventListener("gv-tokens-changed", loadApis);
    return () => { alive = false; window.removeEventListener("gv-tokens-changed", loadApis); };
  }, []);

  useEffect(() => {
    const sync = () => { const choice = readChoice(); setSite(choice && isAccountSite(choice.site) ? choice.site : null); };
    sync();
    window.addEventListener(ACCOUNT_AI_EVENT, sync);
    return () => window.removeEventListener(ACCOUNT_AI_EVENT, sync);
  }, []);

  useEffect(() => {
    if (!site) { setRelayReady(null); return; }
    let alive = true;
    fetch("/api/multiplier/ai-relay/status", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null))
      .then((d: { ready?: boolean } | null) => { if (alive) setRelayReady(d ? Boolean(d.ready) : null); }).catch(() => undefined);
    return () => { alive = false; };
  }, [site]);

  useEffect(() => { try { setCollapsed(window.localStorage.getItem(COLLAPSED_KEY) === "1"); } catch { setCollapsed(false); } }, []);
  const toggle = () => setCollapsed((current) => { const next = !current; try { window.localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0"); } catch { /* sem armazenamento */ } return next; });

  const extKnown = state !== "unknown";
  const extOk = extKnown && state !== "no-extension";
  const outdated = extOk && Boolean(latest) && Boolean(account.version) && isNewerVersion(latest, account.version || "0");
  const flowOk = state === "connected";
  const siteLabel = site && isAccountSite(site) ? ACCOUNT_SITES[site].label : "";
  const hasApi = Boolean(apis?.length);
  const aiOk = hasApi || Boolean(siteLabel);
  const ownAi = aiOk || Boolean(balance?.own_key);
  const tokensOk = ownAi || Boolean(balance && (balance.unlimited || (balance.remaining ?? 0) > 0));

  const hasCutKey = Boolean(cutKeys?.length);
  // Administrador e contas com tokens liberados usam a transcrição do ClipGringa; os demais, a própria chave.
  const houseCuts = Boolean(balance && (balance.unlimited || (balance.remaining ?? 0) > 0));

  const steps: Step[] = [
    {
      id: "key", title: "Conectar a sua chave do Gemini ou do ChatGPT (obrigatório)",
      tone: cutKeys === null || !balance ? "wait" : hasCutKey || houseCuts ? "ok" : "todo",
      status: cutKeys === null || !balance ? "Conferindo…"
        : hasCutKey ? `Conectada (${cutKeys.join(", ")})`
        : houseCuts ? "A sua conta usa a transcrição do ClipGringa"
        : "Falta conectar: sem ela os cortes e as legendas automáticas não saem",
      how: [
        "A transcrição dos vídeos e a escolha dos cortes são feitas com a sua própria chave. O ClipGringa é um bônus da assinatura e não cobre esse custo.",
        "Gemini: tem cota grátis. Entre em aistudio.google.com/apikey com a sua conta Google, crie a chave e cole em Minhas APIs.",
        "ChatGPT: é a chave da OpenAI (platform.openai.com/api-keys), cobrada à parte da assinatura do ChatGPT. Com ela a legenda sai sincronizada palavra por palavra.",
        "A chave fica guardada com criptografia e só a sua conta usa.",
      ],
      actions: [{ label: hasCutKey ? "Ver minhas APIs" : "Conectar minha chave", href: "/minhas-apis", primary: cutKeys !== null && Boolean(balance) && !hasCutKey && !houseCuts }],
    },
    {
      id: "ext", title: "Instalar a extensão no Chrome",
      tone: !extKnown ? "wait" : !extOk ? "todo" : outdated ? "warn" : "ok",
      status: !extKnown ? "Conferindo…" : !extOk ? "Não encontrada neste Chrome" : outdated ? `Instalada na versão ${account.version}, mas já existe a ${latest}` : `Instalada${account.version ? `, versão ${account.version}` : ""}`,
      how: [
        "A extensão é a ponte entre o ClipGringa e o Flow. Ela roda no seu Chrome, abre o Flow, envia as cenas e avisa aqui quando cada vídeo fica pronto.",
        "Ela nunca recebe a sua senha. Só funciona no Chrome do computador, com esta página aberta.",
      ],
      actions: [{ label: !extKnown ? "Ver o passo a passo" : !extOk ? "Instalar a extensão" : outdated ? "Atualizar a extensão" : "Ver o passo a passo", href: "/conectar-flow", primary: extKnown && (!extOk || outdated) }],
    },
    {
      id: "flow", title: "Entrar no Flow com a sua conta Google",
      tone: flowOk ? "ok" : !extKnown ? "wait" : "todo",
      status: flowOk
        ? ["Conta conectada", account.plan ? `plano ${account.plan}` : "", account.credits !== null ? `${fmt.format(account.credits)} créditos` : ""].filter(Boolean).join(", ")
        : !extKnown ? "Conferindo…" : !extOk ? "Depende da extensão" : state === "logged-out" ? "Flow aberto, mas sem login" : "Abra o Flow e entre na sua conta",
      how: [
        "O Flow é a ferramenta do Google que gera os vídeos. Os créditos e os limites de geração são da sua conta Google, não do ClipGringa.",
        "Deixe a aba do Flow aberta enquanto gera. Se fechar, a geração pausa e continua de onde parou quando você voltar.",
      ],
      actions: [{ label: "Abrir o Flow", href: FLOW_URL, external: true, primary: extOk && !flowOk }],
    },
    {
      id: "ai", title: "Conectar a IA que escreve os textos",
      tone: apis === null ? "wait" : aiOk ? "ok" : "todo",
      status: apis === null ? "Conferindo…"
        : hasApi ? `Pela sua chave de API (${apis.join(", ")})`
        : siteLabel ? `Pela sua conta do ${siteLabel}${relayReady ? ", ligada agora" : relayReady === false ? ", aguardando a aba dela aberta no Chrome" : ""}`
        : "Nenhuma API ou conta conectada, os textos saem pelos tokens do ClipGringa",
      how: [
        "Roteiros, prompts e legendas são escritos por uma IA. Você pode usar uma chave de API (Gemini, OpenAI, Claude, OpenRouter ou Ollama) ou a sua conta do Gemini, do ChatGPT ou do Claude pela extensão.",
        "Com a sua IA conectada você não gasta os tokens do ClipGringa. A ordem de uso é: sua chave de API, depois a sua conta, depois os tokens.",
        "A chave fica guardada com criptografia e só a sua conta usa.",
      ],
      actions: [
        { label: hasApi ? "Ver minhas APIs" : "Conectar minha API", href: "/minhas-apis", primary: apis !== null && !aiOk },
        { label: siteLabel ? "Trocar a conta de IA" : "Usar minha conta de IA", onClick: () => window.dispatchEvent(new Event(OPEN_ACCOUNT_AI_EVENT)) },
      ],
    },
    {
      id: "tokens", title: "Tokens do ClipGringa",
      tone: !balance ? "wait" : tokensOk ? "ok" : "warn",
      status: !balance ? "Conferindo…"
        : ownAi ? "Você usa a sua própria IA, não gasta tokens"
        : balance.unlimited ? "Sem limite de tokens"
        : (balance.remaining ?? 0) > 0 ? `${fmt.format(balance.remaining ?? 0)} restantes de ${fmt.format(balance.granted ?? 0)}`
        : (balance.granted ?? 0) === 0 ? "Você ainda não tem tokens liberados" : "Os seus tokens acabaram",
      how: [
        "Os tokens só são gastos quando o texto sai pela IA do ClipGringa. Quem conecta a própria API ou conta de IA não gasta.",
        "Sem tokens e sem IA conectada, os roteiros e as legendas não são gerados. Conecte a sua IA no passo 3 ou peça mais tokens ao suporte.",
      ],
      actions: [{ label: "Pedir mais tokens", href: ADMIN_WHATSAPP_URL, external: true, primary: Boolean(balance) && !tokensOk }],
    },
  ];
  const done = steps.filter((step) => step.tone === "ok").length;
  const next = steps.find((step) => step.tone === "todo" || step.tone === "warn");
  const allDone = done === steps.length;

  if (collapsed === null) return null;
  return (
    <section data-no-translate data-testid="getting-started" aria-label="Primeiros passos" className="mb-8 rounded-xl bg-card text-left ring-1 ring-inset ring-border">
      <button type="button" onClick={toggle} aria-expanded={!collapsed} className="flex min-h-12 w-full items-center gap-3 px-4 py-3 text-left">
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{allDone ? "Tudo conectado, você já pode criar" : "Primeiros passos para usar o ClipGringa"}</span>
          <span className="block text-xs text-muted-foreground">{done} de {steps.length} prontos{!allDone && next ? `. Falta: ${next.title.charAt(0).toLowerCase()}${next.title.slice(1)}` : ""}</span>
        </span>
        <span role="progressbar" aria-label="Etapas prontas" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={done} className="hidden h-1.5 w-28 overflow-hidden rounded-full bg-muted sm:block">
          <span className="block h-full rounded-full bg-[#5BD69A] motion-safe:transition-[width]" style={{ width: `${(done / steps.length) * 100}%` }} />
        </span>
        <span className="text-xs text-muted-foreground">{collapsed ? "Ver" : "Esconder"}</span>
        <ChevronDown aria-hidden className={cn("size-4 text-muted-foreground", !collapsed && "rotate-180")} />
      </button>

      {!collapsed && (
        <div className="border-t">
          <ol>
            {steps.map((step, index) => {
              const open = openStep === step.id;
              return (
                <li key={step.id} data-testid={`start-step-${step.id}`} data-state={step.tone} className={cn("px-4 py-3", index > 0 && "border-t")}>
                  <div className="flex items-start gap-3">
                    <span aria-hidden className={cn("mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-xs tabular-nums", step.tone === "ok" ? "bg-[#5BD69A]/20 text-[#5BD69A]" : "bg-muted text-muted-foreground")}>
                      {step.tone === "ok" ? <Check className="size-3.5" /> : step.tone === "wait" ? <Loader2 className="size-3.5 animate-spin" /> : index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{step.title}</p>
                      <p className={cn("text-xs", step.tone === "ok" ? "text-[#5BD69A]" : step.tone === "warn" ? "text-[#F5B454]" : "text-muted-foreground")}>
                        <span className="sr-only">{step.tone === "ok" ? "Pronto: " : step.tone === "wait" ? "" : "Pendente: "}</span>{step.status}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {step.actions.map((action) => {
                          // Só a ação da próxima etapa pendente fica em destaque: um botão principal por vez.
                          const className = cn("inline-flex h-10 items-center rounded-md px-3 text-sm", action.primary && step.id === next?.id ? "bg-[#7B3FE4] font-medium text-white" : "border text-foreground");
                          return action.href
                            ? action.external
                              ? <a key={action.label} href={action.href} target="_blank" rel="noopener noreferrer" className={className}>{action.label}</a>
                              : <Link key={action.label} href={action.href} className={className}>{action.label}</Link>
                            : <button key={action.label} type="button" onClick={action.onClick} className={className}>{action.label}</button>;
                        })}
                        <button type="button" onClick={() => setOpenStep(open ? null : step.id)} aria-expanded={open} aria-controls={`start-how-${step.id}`}
                          className="inline-flex h-10 items-center px-1 text-sm text-muted-foreground underline-offset-4 hover:underline">
                          {open ? "Fechar a explicação" : "Como funciona"}
                        </button>
                      </div>
                      {open && (
                        <div id={`start-how-${step.id}`} className="mt-2 space-y-1.5 rounded-md bg-muted/60 p-3 text-xs leading-relaxed text-muted-foreground">
                          {step.how.map((line) => <p key={line}>{line}</p>)}
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
          <div className="border-t px-4 py-3">
            <p className="text-sm font-medium">Depois de conectar, o que cada ferramenta faz</p>
            <ul className="mt-2 grid gap-2 sm:grid-cols-2">
              {TOOLS.map((tool) => (
                <li key={tool.href}>
                  <Link href={tool.href} className="block h-full rounded-md bg-muted/60 p-3 hover:bg-muted">
                    <span className="block text-sm font-medium">{tool.name}</span>
                    <span className="block text-xs leading-relaxed text-muted-foreground">{tool.text}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}
