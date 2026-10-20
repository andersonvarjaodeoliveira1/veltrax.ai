"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ClipboardCopy, Download, ImageIcon, Loader2, Sparkles, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

type Status = "copy" | "production" | "ready";
type Creative = {
  id: string;
  niche: string;
  hook: string;
  body: string;
  cta: string;
  button: string;
  status: Status;
  progress: number;
  stage: string;
};
type TabKey = "criar" | "copys" | "imagens" | "esteira" | "prontos" | "ajustes";

const STORAGE_KEY = "gv-automacao-v1";
const TONES = ["Direto e amigável", "Emocional", "Urgente", "Divertido"];
const STAGES = ["Imagem", "Roteiro em vídeo", "Legenda", "Finalizando"];
const TABS: { key: TabKey; label: string; hint: string }[] = [
  { key: "criar", label: "Criar", hint: "pedir criativos novos" },
  { key: "copys", label: "Copys", hint: "revisar e aprovar" },
  { key: "imagens", label: "Imagens", hint: "imagens dos criativos" },
  { key: "esteira", label: "Esteira", hint: "em produção" },
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
  const [tab, setTab] = useState<TabKey>("criar");
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

  // Prototype only: advances items in the conveyor. Replace with the real generators later.
  useEffect(() => {
    if (!creatives.some((item) => item.status === "production")) return;
    const id = setInterval(() => {
      setCreatives((current) =>
        current.map((item) => {
          if (item.status !== "production") return item;
          const progress = Math.min(100, item.progress + 4 + Math.random() * 8);
          if (progress >= 100) return { ...item, progress: 100, status: "ready", stage: "Pronto" };
          return { ...item, progress, stage: STAGES[Math.min(STAGES.length - 1, Math.floor(progress / 25))] };
        }),
      );
    }, 700);
    return () => clearInterval(id);
  }, [creatives]);

  const counts = useMemo(() => ({
    copys: creatives.filter((item) => item.status === "copy").length,
    imagens: creatives.filter((item) => item.status !== "copy").length,
    esteira: creatives.filter((item) => item.status === "production").length,
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
          body: bodies[Math.floor(index / hooks.length) % bodies.length],
          cta: cta.text,
          button: cta.button,
          status: "copy" as Status,
          progress: 0,
          stage: "Aguardando aprovação",
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
  const approve = (id: string) => update(id, { status: "production", progress: 2, stage: STAGES[0] });

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
          Peça criativos novos, aprove os textos e acompanhe cada um até ficar pronto. Este é o molde para testar o fluxo.
        </p>
      </div>

      <Alert>
        <AlertDescription>
          Protótipo: os textos (gancho, corpo e CTA) são gerados de verdade pela IA. A produção de imagem e vídeo na esteira ainda é uma simulação, para você testar o caminho. Nada aqui altera o resto do app.
        </AlertDescription>
      </Alert>

      <nav aria-label="Etapas" className="flex flex-wrap gap-2">
        {TABS.map((item) => {
          const count = item.key === "criar" || item.key === "ajustes" ? 0 : counts[item.key];
          return (
            <button key={item.key} type="button" onClick={() => setTab(item.key)} aria-current={tab === item.key}
              className={cn("rounded-[14px] border px-4 py-2 text-left text-sm transition-colors",
                tab === item.key ? "border-transparent bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:text-foreground")}>
              <span className="flex items-center gap-2 font-medium">
                {item.label}
                {count > 0 && <span className="rounded-full bg-background/20 px-1.5 text-[11px] tabular-nums">{count}</span>}
              </span>
              <span className="block text-[11px] opacity-80">{item.hint}</span>
            </button>
          );
        })}
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

      {tab === "imagens" && (
        <section>
          {list((item) => item.status !== "copy").length === 0 ? empty("As imagens aparecem aqui depois que você aprovar um texto.") : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {list((item) => item.status !== "copy").map((item) => (
                <div key={item.id} className="space-y-1.5">
                  <div className="flex aspect-[9/16] flex-col items-center justify-center gap-2 rounded-[14px] border border-dashed border-border bg-muted/40 p-3 text-center text-xs text-muted-foreground">
                    <ImageIcon className="size-6" />
                    <span className="line-clamp-4 text-foreground">{item.hook}</span>
                    <span>Espaço da imagem</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {tab === "esteira" && (
        <section className="space-y-3">
          {list((item) => item.status === "production").length === 0 && empty("Nada em produção agora. Aprove um texto na aba Copys.")}
          {list((item) => item.status === "production").map((item) => (
            <div key={item.id} className="rounded-[18px] border border-border bg-card p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="truncate text-sm font-medium">{item.hook}</p>
                <span className="text-xs tabular-nums text-muted-foreground">{Math.round(item.progress)}%</span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={Math.round(item.progress)} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full rounded-full bg-gradient-to-r from-[#8b5cf6] to-[#7b3fe4] transition-[width] duration-500" style={{ width: `${Math.max(item.progress, 3)}%` }} />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">Etapa: {item.stage} (simulação)</p>
            </div>
          ))}
        </section>
      )}

      {tab === "prontos" && (
        <section>
          {list((item) => item.status === "ready").length === 0 ? empty("Os criativos prontos aparecem aqui.") : (
            <div className="grid gap-3 md:grid-cols-2">
              {list((item) => item.status === "ready").map((item) => (
                <div key={item.id} className="space-y-3 rounded-[18px] border border-border bg-card p-4">
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
                    <Button size="sm" variant="outline" disabled title="Em breve">Agendar (em breve)</Button>
                    <Button size="sm" variant="ghost" aria-label="Excluir" onClick={() => remove(item.id)}><Trash2 className="size-4" /></Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

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
