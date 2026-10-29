"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Check, KeyRound, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/app/page-header";
import { useFlowConnection } from "@/hooks/use-flow-connection";
import { ACCOUNT_AI_EVENT, ACCOUNT_SITES, OPEN_ACCOUNT_AI_EVENT, isAccountSite, readChoice, writeChoice, type AccountChoice } from "@/lib/account-ai";

type Integration = { provider: string; label: string; help: string; connected: boolean; hint: string; updated_at: string | null };

const AI_API_PROVIDERS = ["gemini", "openai", "anthropic", "openrouter", "huggingface", "ollama"];
const API_NAME: Record<string, string> = { gemini: "Gemini", openai: "ChatGPT (OpenAI)", anthropic: "Claude", openrouter: "OpenRouter", huggingface: "Hugging Face", ollama: "Ollama" };

/** Diz, sempre, por onde os textos de IA estão saindo: API da pessoa, conta dela (extensão) ou créditos do plano. */
function AiSourceCard({ items }: { items: Integration[] | null }) {
  const [choice, setChoice] = useState<AccountChoice | null>(null);
  const [ready, setReady] = useState<boolean | null>(null);
  useEffect(() => {
    const sync = () => setChoice(readChoice());
    sync();
    window.addEventListener(ACCOUNT_AI_EVENT, sync);
    return () => window.removeEventListener(ACCOUNT_AI_EVENT, sync);
  }, []);
  useEffect(() => {
    if (!choice || !isAccountSite(choice.site)) { setReady(null); return; }
    let cancelled = false;
    const check = () => fetch("/api/multiplier/ai-relay/status", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled) setReady(d ? Boolean(d.ready) : null); })
      .catch(() => undefined);
    void check();
    const timer = window.setInterval(check, 15000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [choice]);

  const apis = (items ?? []).filter((item) => item.connected && AI_API_PROVIDERS.includes(item.provider)).map((item) => API_NAME[item.provider] ?? item.label);
  const account = choice && isAccountSite(choice.site) ? ACCOUNT_SITES[choice.site].label : "";
  let headline: string;
  let detail: string;
  if (apis.length) {
    headline = `Pela sua chave de API (${apis.join(", ")})`;
    detail = account ? `A sua conta do ${account} fica de reserva: só entra se não houver chave funcionando.` : "Os textos saem pela sua chave, sem gastar tokens do ClipGringa.";
  } else if (account) {
    headline = `Pela sua conta do ${account} (extensão)`;
    detail = ready === false ? "Aguardando: deixe o ClipGringa aberto no Chrome, com a extensão 1.16.0 ligada e logado no " + account + ". Enquanto isso uso os créditos do plano." : ready ? "Ligada agora." : "Verificando…";
  } else {
    headline = "Pelos créditos (tokens) do plano ClipGringa";
    detail = "Conecte a sua conta do Gemini, do ChatGPT ou do Claude (pela extensão) ou uma chave de API para não gastar tokens.";
  }
  return (
    <section data-testid="ai-source-card" className="flex flex-wrap items-center gap-3 rounded-[18px] border border-border bg-card p-4 text-sm">
      <span className={`size-2.5 rounded-full ${apis.length || ready ? "bg-[#5BD69A]" : "bg-muted-foreground"}`} />
      <span className="min-w-0 flex-1">
        <b>Como a IA gera os seus textos agora:</b> {headline}
        <span className="block text-xs text-muted-foreground">{detail} A ordem é: sua chave de API, depois a sua conta, depois os créditos do plano. A cada geração eu aviso por onde saiu.</span>
      </span>
      <button type="button" onClick={() => window.dispatchEvent(new Event(OPEN_ACCOUNT_AI_EVENT))} className="rounded-full border border-[#7B3FE4]/60 px-4 py-2 text-xs font-medium text-[#A98BFF]">{account ? "Trocar a conta" : "Conectar minha conta de IA"}</button>
      {account && <button type="button" onClick={() => { writeChoice(null); void fetch("/api/multiplier/ai-relay/off", { method: "POST" }).catch(() => undefined); }} className="rounded-full border border-border px-4 py-2 text-xs font-medium">Desconectar</button>}
    </section>
  );
}

export default function MyApisPage() {
  const { state: flowState, account: flowAccount } = useFlowConnection(true, false);
  const [items, setItems] = useState<Integration[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [ollama, setOllama] = useState({ url: "", model: "" });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<{ provider: string; text: string } | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/integrations", { cache: "no-store" });
      if (!response.ok) throw new Error();
      setItems((await response.json()).integrations ?? []);
    } catch {
      setItems([]);
      setError({ provider: "", text: "Não foi possível carregar suas conexões. Atualize a página." });
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function connect(provider: string) {
    const key = (drafts[provider] ?? "").trim();
    // O Ollama pode não ter chave quando o servidor é do próprio membro (endereço próprio).
    if (!key && !(provider === "ollama" && ollama.url.trim())) return;
    setBusy(provider); setError(null); setDone(null);
    try {
      const response = await fetch(`/api/integrations/${provider}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(provider === "ollama" ? { key, url: ollama.url.trim(), model: ollama.model.trim() } : { key }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) { setError({ provider, text: String(data.detail || "Não foi possível conectar. Confira a chave e tente de novo.") }); return; }
      setItems(data.integrations ?? []);
      setDrafts((current) => ({ ...current, [provider]: "" }));
      if (provider === "ollama") setOllama({ url: "", model: "" });
      setDone(provider);
      window.dispatchEvent(new Event("gv-tokens-changed"));
      toast.success("Chave conectada! Já pode usar o ClipGringa com a sua chave.");
    } catch {
      setError({ provider, text: "Sem conexão agora. Tente de novo em instantes." });
    } finally {
      setBusy(null);
    }
  }

  async function disconnect(provider: string) {
    setBusy(provider); setError(null); setDone(null);
    try {
      const response = await fetch(`/api/integrations/${provider}`, { method: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (response.ok) { setItems(data.integrations ?? []); window.dispatchEvent(new Event("gv-tokens-changed")); }
      else setError({ provider, text: "Não foi possível remover agora. Tente de novo." });
    } catch {
      setError({ provider, text: "Sem conexão agora. Tente de novo em instantes." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-4 sm:p-8">
      <PageHeader icon={KeyRound} title="Minhas APIs" description="Conecte as suas próprias chaves. Quando você conecta uma, o ClipGringa passa a usar a sua e não depende de ninguém. Elas ficam guardadas com criptografia e só você usa." />

      {done && (
        <div role="status" data-testid="key-connected" className="flex flex-wrap items-center gap-3 rounded-[18px] border border-[#5BD69A]/40 bg-[#5BD69A]/10 p-4 text-sm">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#5BD69A]/20 text-[#5BD69A]"><Check className="size-4" /></span>
          <span className="min-w-0 flex-1"><b>Chave conectada com sucesso.</b> Você já pode usar o ClipGringa: tudo o que você gerar agora usa a sua chave, sem gastar tokens.</span>
          <Link href="/" className="rounded-full bg-gradient-to-br from-[#8B5CF6] to-[#7B3FE4] px-4 py-2 text-xs font-medium text-white">Começar a criar</Link>
        </div>
      )}

      <AiSourceCard items={items} />

      <section data-testid="flow-account-card" className="flex flex-wrap items-center gap-3 rounded-[18px] border border-border bg-card p-4 text-sm">
        <span className={`size-2.5 rounded-full ${flowState === "connected" ? "bg-[#5BD69A]" : "bg-muted-foreground"}`} />
        <span className="min-w-0 flex-1">
          <b>Conta do Flow:</b> {flowState === "connected" ? `conectada${flowAccount.plan ? ` · plano ${flowAccount.plan}` : ""}` : flowState === "logged-out" ? "Flow aberto, mas sem login" : flowState === "no-extension" ? "extensão não encontrada" : "verificando…"}
          <span className="block text-xs text-muted-foreground">A conta do Flow conecta pela extensão, não por chave. Veja o passo a passo em Conectar ao Flow.</span>
        </span>
        <Link href="/conectar-flow" className="rounded-full border border-[#7B3FE4]/60 px-4 py-2 text-xs font-medium text-[#A98BFF]">Conectar ao Flow</Link>
      </section>

      {error && !error.provider && <p role="alert" className="rounded-[14px] border border-[#F0466B]/40 bg-[#F0466B]/10 p-3 text-sm text-[#F0466B]">{error.text}</p>}

      {items === null ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Carregando suas conexões…</p>
      ) : (
        <ul className="space-y-4">
          {items.map((item) => (
            <li key={item.provider} className="space-y-3 rounded-[18px] border border-border bg-card p-5" data-testid={`api-${item.provider}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-2 font-medium"><KeyRound className="size-4 text-[#A98BFF]" /> {item.label}</p>
                {item.connected
                  ? <span className="inline-flex items-center gap-1 rounded-full bg-[#5BD69A]/15 px-3 py-1 text-xs text-[#5BD69A]"><Check className="size-3" /> Conectado{item.hint ? (item.provider === "ollama" ? ` · ${item.hint}` : ` · …${item.hint}`) : ""}</span>
                  : <span className="rounded-full bg-border px-3 py-1 text-xs text-muted-foreground">Não conectado</span>}
              </div>
              <p className="text-xs text-muted-foreground">{item.help}</p>
              {item.provider === "ollama" && (
                <div className="grid gap-2 sm:grid-cols-2">
                  <input type="url" autoComplete="off" value={ollama.url} onChange={(event) => setOllama((cur) => ({ ...cur, url: event.target.value }))} aria-label="Endereço do Ollama"
                    placeholder="Endereço (vazio = https://ollama.com)" className="min-w-0 rounded-full border border-border bg-background px-4 py-2 text-sm" />
                  <input type="text" autoComplete="off" value={ollama.model} onChange={(event) => setOllama((cur) => ({ ...cur, model: event.target.value }))} aria-label="Modelo do Ollama"
                    placeholder="Modelo (opcional, ex.: gpt-oss:120b)" className="min-w-0 rounded-full border border-border bg-background px-4 py-2 text-sm" />
                </div>
              )}
              <form className="flex flex-wrap items-center gap-2" onSubmit={(event) => { event.preventDefault(); void connect(item.provider); }}>
                <input
                  type="password"
                  autoComplete="off"
                  value={drafts[item.provider] ?? ""}
                  onChange={(event) => setDrafts((current) => ({ ...current, [item.provider]: event.target.value }))}
                  aria-label={`Chave de ${item.label}`}
                  placeholder={item.provider === "ollama" ? (item.connected ? "Chave nova para trocar (opcional em servidor próprio)" : "Chave do Ollama (opcional em servidor próprio)") : item.connected ? "Colar uma chave nova para trocar" : "Cole a chave aqui"}
                  className="min-w-0 flex-1 rounded-full border border-border bg-background px-4 py-2 text-sm"
                />
                <Button type="submit" size="sm" className="rounded-full bg-gradient-to-br from-[#8B5CF6] to-[#7B3FE4] text-white" disabled={busy === item.provider || (!(drafts[item.provider] ?? "").trim() && !(item.provider === "ollama" && ollama.url.trim()))}>
                  {busy === item.provider ? <Loader2 className="size-4 animate-spin" /> : null}
                  {busy === item.provider ? "Testando a chave…" : item.connected ? "Trocar chave" : "Conectar"}
                </Button>
                {item.connected && (
                  <Button type="button" size="sm" variant="outline" className="rounded-full" disabled={busy === item.provider} onClick={() => void disconnect(item.provider)}>
                    <Trash2 className="size-3.5" /> Remover
                  </Button>
                )}
              </form>
              {error?.provider === item.provider && <p role="alert" className="text-xs text-[#F0466B]">{error.text}</p>}
              {done === item.provider && <p role="status" className="text-xs text-[#5BD69A]">Pronto! Chave testada e conectada.</p>}
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-muted-foreground">Não tem uma chave? Use o item “API e Flow” no menu para falar com a gente.</p>
    </div>
  );
}
