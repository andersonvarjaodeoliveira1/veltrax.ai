"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ClipboardCopy, Download, Loader2, Sparkles, Trash2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { FlowLibrary } from "@/components/app/flow-library";
import { CloneWizard } from "@/components/app/clone-wizard";

type Status = "copy" | "awaiting" | "ready";
type Creative = {
  id: string;
  niche: string;
  hook: string;
  body: string;
  cta: string;
  button: string;
  status: Status;
  prompt: string;
};
type TabKey = "criar" | "copys" | "flow" | "prontos" | "clonagem" | "ajustes" | "videos" | "imagens";

const STORAGE_KEY = "gv-automacao-v1";
const TONES = ["Direto e amigável", "Emocional", "Urgente", "Divertido"];
// Clonagem é o caminho principal; as demais abas ficam como apoio (modo manual).
const MAIN_TAB = { key: "clonagem" as const, label: "Clonar um vídeo", hint: "suba o vídeo e o resto é automático" };
const RESULT_TABS: { key: TabKey; label: string }[] = [
  { key: "videos", label: "Vídeos criados" },
  { key: "imagens", label: "Banco de imagens" },
];
const TABS: { key: TabKey; label: string; hint: string }[] = [
  { key: "criar", label: "Criar", hint: "pedir criativos novos" },
  { key: "copys", label: "Copys", hint: "revisar e aprovar" },
  { key: "flow", label: "Flow", hint: "gerar os vídeos" },
  { key: "prontos", label: "Prontos", hint: "para baixar" },
  { key: "ajustes", label: "Ajustes", hint: "nichos e padrões" },
];

type Saved = { creatives: Creative[]; niches: string[]; tone: string };

function load(): Saved {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw) as Partial<Saved>;
      return {
        creatives: Array.isArray(data.creatives) ? data.creatives : [],
        niches: Array.isArray(data.niches) && data.niches.length ? data.niches : ["Geral"],
        tone: typeof data.tone === "string" ? data.tone : TONES[0],
      };
    }
  } catch { /* storage unavailable */ }
  return { creatives: [], niches: ["Geral"], tone: TONES[0] };
}

function ptError(detail: unknown) {
  if (typeof detail !== "string") return "Não foi possível gerar os textos. Tente de novo.";
  if (/Describe the product/i.test(detail)) return "Descreva o produto em pelo menos uma frase.";
  if (/Too many AI requests/i.test(detail)) return "Muitos pedidos à IA em pouco tempo. Tente de novo daqui a pouco.";
  if (/AI is not configured/i.test(detail)) return "A IA não está disponível agora.";
  return "Não foi possível gerar os textos. Tente de novo.";
}

function captionOf(item: Creative) {
  return [item.hook, item.body, item.cta].filter(Boolean).join("\n\n");
}

export default function AutomationPage() {
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<TabKey>("clonagem");
  const [manualOpen, setManualOpen] = useState(false);
  const manualTab = TABS.some((item) => item.key === tab);
  useEffect(() => {
    const aba = new URLSearchParams(window.location.search).get("aba");
    if (aba === "videos" || aba === "imagens") setTab(aba);
  }, []);
  const [creatives, setCreatives] = useState<Creative[]>([]);
  const [niches, setNiches] = useState<string[]>(["Geral"]);
  const [tone, setTone] = useState(TONES[0]);
  const [niche, setNiche] = useState("Geral");
  const [product, setProduct] = useState("");
  const [quantity, setQuantity] = useState(3);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newNiche, setNewNiche] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [videos, setVideos] = useState<Record<string, { url: string; name: string }>>({});
  const [promptBusy, setPromptBusy] = useState(false);

  useEffect(() => {
    const saved = load();
    setCreatives(saved.creatives);
    setNiches(saved.niches);
    setTone(saved.tone);
    setNiche(saved.niches[0]);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ creatives, niches, tone } satisfies Saved));
    } catch { /* storage unavailable */ }
  }, [ready, creatives, niches, tone]);

  const counts = useMemo(() => ({
    copys: creatives.filter((item) => item.status === "copy").length,
    flow: creatives.filter((item) => item.status === "awaiting").length,
    prontos: creatives.filter((item) => item.status === "ready").length,
  }), [creatives]);

  const generate = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const response = await fetch("/api/multiplier/script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product: `${niche !== "Geral" ? `Nicho: ${niche}. ` : ""}${product}`, tone }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(ptError(data?.detail));
      const hooks: string[] = data.hooks || [];
      const bodies: string[] = data.bodies || [];
      const ctas: { text: string; button: string }[] = data.ctas || [];
      if (!hooks.length || !bodies.length || !ctas.length) throw new Error("Não foi possível gerar os textos. Tente de novo.");
      const made: Creative[] = Array.from({ length: quantity }, (_, index) => {
        const cta = ctas[index % ctas.length];
        return {
          id: `${Date.now()}-${index}`,
          niche,
          hook: hooks[index % hooks.length],
          body: bodies[index % bodies.length],
          cta: cta.text,
          button: cta.button,
          status: "copy" as Status,
          prompt: "",
        };
      });
      setCreatives((current) => [...made, ...current]);
      setTab("copys");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível gerar os textos. Tente de novo.");
    } finally {
      setBusy(false);
    }
  }, [niche, product, quantity, tone]);

  const update = (id: string, patch: Partial<Creative>) =>
    setCreatives((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  const remove = (id: string) => setCreatives((current) => current.filter((item) => item.id !== id));
  const approve = (id: string) => update(id, { status: "awaiting" });

  async function copyCaption(item: Creative) {
    try {
      await navigator.clipboard.writeText(captionOf(item));
      setCopied(item.id);
      setTimeout(() => setCopied((current) => (current === item.id ? null : current)), 1800);
    } catch {
      setError("Não foi possível copiar. Selecione o texto e copie manualmente.");
    }
  }

  function downloadText(item: Creative) {
    const blob = new Blob([captionOf(item)], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `criativo-${item.id}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function generatePrompts() {
    const targets = creatives.filter((item) => item.status === "awaiting" && !item.prompt.trim()).slice(0, 6);
    if (!targets.length) return;
    setError(null);
    setPromptBusy(true);
    try {
      const response = await fetch("/api/multiplier/video-prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: targets.map((item) => ({ niche: item.niche, hook: item.hook, body: item.body, cta: item.cta })) }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(data?.prompts)) throw new Error(ptError(data?.detail));
      const prompts: string[] = data.prompts;
      setCreatives((current) =>
        current.map((item) => {
          const position = targets.findIndex((target) => target.id === item.id);
          return position >= 0 && prompts[position] ? { ...item, prompt: prompts[position] } : item;
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível gerar os prompts. Tente de novo.");
    } finally {
      setPromptBusy(false);
    }
  }

  async function copyText(key: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      setTimeout(() => setCopied((current) => (current === key ? null : current)), 1800);
    } catch {
      setError("Não foi possível copiar. Selecione o texto e copie manualmente.");
    }
  }

  function attachVideo(id: string, file: File) {
    if (!file.type.startsWith("video/")) { setError("Envie um arquivo de vídeo (mp4, mov ou webm)."); return; }
    setError(null);
    setVideos((current) => {
      if (current[id]) URL.revokeObjectURL(current[id].url);
      return { ...current, [id]: { url: URL.createObjectURL(file), name: file.name } };
    });
    update(id, { status: "ready" });
  }

  const list = (status: (item: Creative) => boolean) => creatives.filter(status);
  const empty = (text: string) => <p className="rounded-[18px] border border-dashed border-border p-6 text-sm text-muted-foreground">{text}</p>;

  return (
    <div data-no-translate className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8">
      <div>
        <div className="flex items-center gap-2">
          <Sparkles className="size-6" />
          <h1 className="text-2xl font-semibold">Automação de Criativos</h1>
          <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">BETA</span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Peça criativos novos, aprove os textos, gere os vídeos no Flow e organize tudo até ficar pronto.
        </p>
      </div>

      {tab !== "clonagem" && tab !== "videos" && tab !== "imagens" && (
      <Alert>
        <AlertDescription>
          Os textos e os prompts de vídeo são gerados pela IA. O vídeo é gerado por você no Flow, em lower priority, e enviado aqui. Para criar variações, baixe o vídeo e envie na aba Variações do Multiplicador. Os vídeos ficam só nesta página: se você atualizar, envie de novo.
        </AlertDescription>
      </Alert>
      )}

      <nav aria-label="Etapas" className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex flex-wrap items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] p-1 backdrop-blur">
            <button type="button" onClick={() => setTab(MAIN_TAB.key)} aria-current={tab === MAIN_TAB.key}
              className={cn("rounded-full px-4 py-1.5 text-xs font-medium transition-colors",
                tab === MAIN_TAB.key ? "bg-gradient-to-br from-[#8B5CF6] to-[#7B3FE4] text-white shadow-[0_6px_20px_-8px_#7B3FE4]" : "text-muted-foreground hover:text-foreground")}>
              {MAIN_TAB.label} <span className="ml-1 rounded-full bg-white/20 px-1.5 py-0.5 text-[9px] font-semibold">BETA</span>
            </button>
            {RESULT_TABS.map((item) => (
              <button key={item.key} type="button" onClick={() => setTab(item.key)} aria-current={tab === item.key}
                className={cn("rounded-full px-4 py-1.5 text-xs font-medium transition-colors",
                  tab === item.key ? "bg-white/10 text-foreground" : "text-muted-foreground hover:text-foreground")}>
                {item.label}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setManualOpen((open) => !open)} aria-expanded={manualOpen || manualTab}
            className="rounded-full px-3 py-1.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground">
            Modo manual {manualOpen || manualTab ? "▴" : "▾"}
          </button>
        </div>
        {(manualOpen || manualTab) && (
          <div className="flex flex-wrap items-center gap-1 rounded-[14px] border border-white/10 bg-white/[0.02] p-1.5">
            {TABS.map((item) => {
              const count = item.key === "criar" || item.key === "ajustes" ? 0 : counts[item.key as "copys" | "flow" | "prontos"];
              return (
                <button key={item.key} type="button" onClick={() => setTab(item.key)} aria-current={tab === item.key} title={item.hint}
                  className={cn("rounded-[10px] px-3 py-1.5 text-xs transition-colors",
                    tab === item.key ? "bg-white/10 text-foreground" : "text-muted-foreground hover:text-foreground")}>
                  <span className="flex items-center gap-1.5 font-medium">
                    {item.label}
                    {count > 0 && <span className="rounded-full bg-[#7B3FE4]/40 px-1.5 text-[10px] tabular-nums">{count}</span>}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </nav>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {tab === "criar" && (
        <section className="space-y-4 rounded-[18px] border border-border bg-card p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Nicho</span>
              <select value={niche} onChange={(event) => setNiche(event.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2">
                {niches.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Tom</span>
              <select value={tone} onChange={(event) => setTone(event.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2">
                {TONES.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
          </div>
          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">Sobre o que são os criativos?</span>
            <textarea value={product} maxLength={1500} rows={4} onChange={(event) => setProduct(event.target.value)}
              placeholder="Ex.: escova alisadora elétrica que seca e alisa em 10 minutos, leve e fácil de usar"
              className="w-full rounded-lg border border-border bg-background px-3 py-2" />
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-muted-foreground">Quantidade</span>
            {[1, 2, 3, 4, 5, 6].map((value) => (
              <button key={value} type="button" onClick={() => setQuantity(value)}
                className={cn("rounded-full border px-3 py-1 text-sm", quantity === value ? "border-transparent bg-primary text-primary-foreground" : "border-border text-muted-foreground")}>
                {value}
              </button>
            ))}
            <Button className="ml-auto" disabled={busy || product.trim().length < 10} onClick={generate}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              {busy ? "Escrevendo os textos…" : "Gerar textos"}
            </Button>
          </div>
        </section>
      )}

      {tab === "copys" && (
        <section className="space-y-3">
          {list((item) => item.status === "copy").length === 0 && empty("Nenhum texto para revisar. Peça criativos novos na aba Criar.")}
          {list((item) => item.status === "copy").map((item) => (
            <div key={item.id} className="space-y-3 rounded-[18px] border border-border bg-card p-4">
              <div className="text-xs text-muted-foreground">Nicho: {item.niche}</div>
              {([["hook", "Gancho"], ["body", "Corpo"], ["cta", "CTA"]] as const).map(([field, label]) => (
                <label key={field} className="block space-y-1 text-sm">
                  <span className="text-muted-foreground">{label}</span>
                  <textarea value={item[field]} rows={field === "body" ? 3 : 2} maxLength={300}
                    onChange={(event) => update(item.id, { [field]: event.target.value })}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2" />
                </label>
              ))}
              <div className="flex gap-2">
                <Button size="sm" onClick={() => approve(item.id)}><Check className="size-4" /> Aprovar</Button>
                <Button size="sm" variant="outline" onClick={() => remove(item.id)}><X className="size-4" /> Descartar</Button>
              </div>
            </div>
          ))}
        </section>
      )}

      {tab === "flow" && (
        <section className="space-y-4">
          <div className="rounded-[18px] border border-border bg-card p-4 text-sm">
            <p className="font-medium">Como usar</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground">
              <li>Clique em <strong className="text-foreground">Gerar prompts</strong>. Cada criativo aprovado ganha um prompt de vídeo.</li>
              <li>No Flow, escolha o modo de <strong className="text-foreground">menor prioridade (lower priority)</strong> e cole o prompt.</li>
              <li>Gere, baixe o vídeo e envie aqui no criativo correspondente.</li>
            </ol>
          </div>
          {list((item) => item.status === "awaiting").length === 0 ? empty("Nada esperando vídeo. Aprove um texto na aba Copys.") : (
            <>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" disabled={promptBusy || !list((item) => item.status === "awaiting" && !item.prompt.trim()).length} onClick={generatePrompts}>
                  {promptBusy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                  {promptBusy ? "Escrevendo os prompts…" : "Gerar prompts"}
                </Button>
                <Button size="sm" variant="outline" disabled={!list((item) => item.status === "awaiting" && !!item.prompt.trim()).length}
                  onClick={() => copyText("all", list((item) => item.status === "awaiting" && !!item.prompt.trim()).map((item, index) => `${index + 1}. ${item.prompt}`).join("\n\n"))}>
                  {copied === "all" ? <Check className="size-4" /> : <ClipboardCopy className="size-4" />}
                  {copied === "all" ? "Copiado" : "Copiar todos os prompts"}
                </Button>
              </div>
              {list((item) => item.status === "awaiting").map((item) => (
                <div key={item.id} className="space-y-3 rounded-[18px] border border-border bg-card p-4">
                  <p className="text-sm font-medium">{item.hook}</p>
                  <label className="block space-y-1 text-sm">
                    <span className="text-muted-foreground">Prompt para o Flow</span>
                    <textarea value={item.prompt} rows={5} maxLength={1200} placeholder="Clique em Gerar prompts, ou escreva o seu."
                      onChange={(event) => update(item.id, { prompt: event.target.value })}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2" />
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" variant="outline" disabled={!item.prompt.trim()} onClick={() => copyText(item.id, item.prompt)}>
                      {copied === item.id ? <Check className="size-4" /> : <ClipboardCopy className="size-4" />}
                      {copied === item.id ? "Copiado" : "Copiar prompt"}
                    </Button>
                    <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted">
                      <Upload className="size-4" /> Enviar vídeo gerado
                      <input type="file" accept="video/*" hidden onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.target.value = "";
                        if (file) attachVideo(item.id, file);
                      }} />
                    </label>
                    <Button size="sm" variant="ghost" aria-label="Excluir" onClick={() => remove(item.id)}><Trash2 className="size-4" /></Button>
                  </div>
                </div>
              ))}
            </>
          )}
        </section>
      )}

      {tab === "prontos" && (
        <section>
          {list((item) => item.status === "ready").length === 0 ? empty("Os criativos prontos aparecem aqui.") : (
            <div className="grid gap-3 md:grid-cols-2">
              {list((item) => item.status === "ready").map((item) => (
                <div key={item.id} className="space-y-3 rounded-[18px] border border-border bg-card p-4">
                  {videos[item.id] ? (
                    <video src={videos[item.id].url} controls preload="metadata" className="aspect-[9/16] max-h-96 w-full rounded-lg bg-black object-contain" />
                  ) : (
                    <label className="flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-4 text-xs text-muted-foreground hover:text-foreground">
                      <Upload className="size-4" /> O vídeo não está mais nesta página. Enviar de novo
                      <input type="file" accept="video/*" hidden onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.target.value = "";
                        if (file) attachVideo(item.id, file);
                      }} />
                    </label>
                  )}
                  <div>
                    <p className="font-medium">{item.hook}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{item.body}</p>
                    <p className="mt-1 text-sm">{item.cta}{item.button ? ` · [${item.button}]` : ""}</p>
                    <p className="mt-2 text-xs text-muted-foreground">Nicho: {item.niche}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => copyCaption(item)}>
                      {copied === item.id ? <Check className="size-4" /> : <ClipboardCopy className="size-4" />}
                      {copied === item.id ? "Copiado" : "Copiar legenda"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => downloadText(item)}><Download className="size-4" /> Baixar texto</Button>
                    {videos[item.id] && (
                      <a href={videos[item.id].url} download={videos[item.id].name}
                        className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted">
                        <Download className="size-4" /> Baixar vídeo
                      </a>
                    )}
                    <Button size="sm" variant="outline" disabled title="Em breve">Agendar (em breve)</Button>
                    <Button size="sm" variant="ghost" aria-label="Excluir" onClick={() => remove(item.id)}><Trash2 className="size-4" /></Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {tab === "clonagem" && (
        <>
          <CloneWizard />
          <FlowLibrary kind="video" compact />
        </>
      )}
      {tab === "videos" && <FlowLibrary kind="video" />}
      {tab === "imagens" && <FlowLibrary kind="image" />}

      {tab === "ajustes" && (
        <section className="space-y-5 rounded-[18px] border border-border bg-card p-5">
          <div className="space-y-2">
            <p className="font-medium">Nichos</p>
            <div className="flex flex-wrap gap-2">
              {niches.map((item) => (
                <span key={item} className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-sm">
                  {item}
                  {niches.length > 1 && (
                    <button type="button" aria-label={`Remover ${item}`} className="text-muted-foreground hover:text-destructive"
                      onClick={() => { setNiches((current) => current.filter((n) => n !== item)); if (niche === item) setNiche(niches.find((n) => n !== item) || "Geral"); }}>
                      <X className="size-3.5" />
                    </button>
                  )}
                </span>
              ))}
            </div>
            <form className="flex gap-2" onSubmit={(event) => {
              event.preventDefault();
              const value = newNiche.trim().slice(0, 40);
              if (value && !niches.includes(value)) setNiches((current) => [...current, value]);
              setNewNiche("");
            }}>
              <input value={newNiche} onChange={(event) => setNewNiche(event.target.value)} placeholder="Novo nicho (ex.: Pet)"
                aria-label="Novo nicho" className="w-full max-w-xs rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              <Button type="submit" size="sm" variant="outline">Adicionar</Button>
            </form>
          </div>
          <div className="space-y-2">
            <p className="font-medium">Tom padrão</p>
            <div className="flex flex-wrap gap-2">
              {TONES.map((item) => (
                <button key={item} type="button" onClick={() => setTone(item)}
                  className={cn("rounded-full border px-3 py-1 text-sm", tone === item ? "border-transparent bg-primary text-primary-foreground" : "border-border text-muted-foreground")}>
                  {item}
                </button>
              ))}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Seus nichos, ajustes e criativos ficam guardados só neste navegador durante o teste.</p>
        </section>
      )}
    </div>
  );
}
