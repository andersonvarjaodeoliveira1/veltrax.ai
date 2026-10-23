"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ClipboardCopy, ExternalLink, ImagePlus, Loader2, Search, Sparkles, UserRound, X } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useSession } from "@/lib/auth-client";
import { FLOW_MODELS, readFlowCategory, saveFlowCategory } from "@/lib/flow-models";
import { LastFrame } from "@/components/app/last-frame";
import { PageHeader } from "@/components/app/page-header";
import { cn } from "@/lib/utils";

type Pin = { id: string; thumb: string; full: string; link: string };
type Board = { scenes: { line: string; what: string }[]; imagePrompts: string[]; videoPrompts: string[] };
type Profile = { name: string; age: string; look: string; setting: string; extra: string };
const EMPTY: Profile = { name: "", age: "", look: "", setting: "", extra: "" };
const FLOW_URL = "https://labs.google/fx/pt/tools/flow";
const FLOW_TOOL_SHARE_URL = process.env.NEXT_PUBLIC_FLOW_TOOL_SHARE_URL ?? "";
const inputClass = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm";
const pinterestUrl = (query: string) => `https://br.pinterest.com/search/pins/?q=${encodeURIComponent(query)}`;
const AIS = [
  { name: "ChatGPT", href: "https://chatgpt.com/" },
  { name: "Gemini", href: "https://gemini.google.com/app" },
  { name: "Claude", href: "https://claude.ai/new" },
];

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-[18px] border border-border bg-card p-5">
      <h2 className="flex items-center gap-3 font-display text-lg font-semibold">
        <span className="grid size-7 place-items-center rounded-full bg-gradient-to-br from-[#8B5CF6] to-[#7B3FE4] text-sm text-white">{n}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

async function errorOf(response: Response, fallback: string) {
  try {
    const data = await response.json();
    if (data?.detail === "TOKENS_EXHAUSTED") return "Seus tokens acabaram. Fale com o administrador para liberar mais.";
    return fallback;
  } catch { return fallback; }
}

export default function InfluencerPage() {
  const [ad, setAd] = useState("");
  const [profile, setProfile] = useState<Profile>(EMPTY);
  const [searches, setSearches] = useState<string[]>([]);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [prompts, setPrompts] = useState<string[]>([]);
  const [busy, setBusy] = useState<"profile" | "prompt" | "pins" | "board" | null>(null);
  const [pins, setPins] = useState<Pin[]>([]);
  const [pinsFailed, setPinsFailed] = useState(false);
  const [pickedPin, setPickedPin] = useState<Pin | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [flowConnected, setFlowConnected] = useState(false);
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem("gv-influencer-v1") ?? "{}");
      if (typeof saved.ad === "string") setAd(saved.ad);
      if (saved.profile && typeof saved.profile === "object") setProfile({ ...EMPTY, ...saved.profile });
      if (Array.isArray(saved.searches)) setSearches(saved.searches);
      if (typeof saved.copy4 === "string") setCopy4(saved.copy4);
    } catch { /* storage unavailable */ }
    setRestored(true);
  }, []);
  const { data: session } = useSession();
  const isAdmin = Boolean((session?.user as { is_admin?: boolean } | undefined)?.is_admin);
  const [copy4, setCopy4] = useState("");
  const [model, setModel] = useState<string>(FLOW_MODELS[0].id);
  const [sceneCount, setSceneCount] = useState(4);
  const [board, setBoard] = useState<Board | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [frames, setFrames] = useState(true);
  const [cadence, setCadence] = useState<"natural" | "fast" | "faster">("natural");
  const [energy, setEnergy] = useState<"calm" | "lively">("calm");
  const wordsPerSecond = cadence === "natural" ? 2.5 : cadence === "fast" ? 2.75 : 3.1;
  useEffect(() => { setModel(readFlowCategory() ?? FLOW_MODELS[0].id); }, []);
  useEffect(() => {
    setCopy4((current) => current || ad);
  }, [ad]);
  useEffect(() => {
    if (!restored) return;
    try { window.localStorage.setItem("gv-influencer-v1", JSON.stringify({ ad, profile, searches, copy4 })); } catch { /* storage unavailable */ }
  }, [restored, ad, profile, searches, copy4]);
  const words = copy4.split(/\s+/).filter(Boolean).length;
  useEffect(() => { if (words) setSceneCount(Math.max(1, Math.min(6, Math.round(words / (wordsPerSecond * 7))))); }, [words, wordsPerSecond]);
  const chosen = FLOW_MODELS.find((item) => item.id === model) ?? FLOW_MODELS[0];
  const perScene = isAdmin ? 0 : chosen.credits;
  useEffect(() => {
    try { setFlowConnected(Boolean(JSON.parse(window.localStorage.getItem("gv-conectar-flow-v1") ?? "{}").flow)); } catch { /* storage unavailable */ }
  }, []);

  useEffect(() => {
    if (!photo) { setPhotoUrl(null); return; }
    const url = URL.createObjectURL(photo);
    setPhotoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  // Colar a imagem direto (Ctrl+V) depois de copiá-la no Pinterest.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const file = Array.from(event.clipboardData?.files ?? []).find((item) => item.type.startsWith("image/"));
      if (file) { setPhoto(file); setPickedPin(null); }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  const setField = (key: keyof Profile, value: string) => setProfile((current) => ({ ...current, [key]: value }));

  async function analyse() {
    setError(null);
    setBusy("profile");
    try {
      const response = await fetch("/api/multiplier/clone/influencer-profile", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ad }),
      });
      if (!response.ok) { setError(await errorOf(response, "Não consegui ler o anúncio. Confira o texto e tente de novo.")); return; }
      const data = await response.json();
      setProfile({ name: data.name ?? "", age: data.age ?? "", look: data.look ?? "", setting: data.setting ?? "", extra: "" });
      const found: string[] = Array.isArray(data.searches) ? data.searches : [];
      setSearches(found);
      setPins([]);
      setPickedPin(null);
      setBusy(null);
      if (found.length) await findPins(found);
      return;
    } catch {
      setError("Sem conexão. Tente de novo.");
    } finally { setBusy(null); }
  }

  async function findPins(list: string[] = searches) {
    setError(null);
    setPinsFailed(false);
    setBusy("pins");
    try {
      const response = await fetch("/api/multiplier/clone/influencer-pins", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ queries: list }),
      });
      if (!response.ok) { setPinsFailed(true); return; }
      const data = await response.json();
      const found = Array.isArray(data.pins) ? data.pins : [];
      setPins(found);
      if (found.length === 0) setPinsFailed(true);
    } catch {
      setPinsFailed(true);
    } finally { setBusy(null); }
  }

  async function buildBoard() {
    setError(null);
    setBusy("board");
    try {
      const response = await fetch("/api/multiplier/clone/influencer-storyboard", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ copy: copy4, scene_count: sceneCount, persona: profile, language: "pt-BR", cadence, energy }),
      });
      if (!response.ok) { setError(await errorOf(response, "Não consegui montar o storyboard. Confira a fala e tente de novo.")); return; }
      setBoard(await response.json());
    } catch {
      setError("Sem conexão. Tente de novo.");
    } finally { setBusy(null); }
  }

  const flowPackage = () => JSON.stringify({
    app: "clipgringa-flow", version: 1, sceneCount: board?.scenes.length ?? 0,
    model: isAdmin ? "Veo 3.1 - Lite [Lower Priority]" : chosen.name,
    flowModel: isAdmin ? "[Lower Priority]" : chosen.needle,
    lowerPriority: isAdmin,
    mode: frames ? "frames" : "scenes",
    videos: [{
      title: profile.name || "Influencer",
      scenes: (board?.scenes ?? []).map((_, index) => ({
        imagePrompt: board?.imagePrompts[index] ?? "", videoPrompt: board?.videoPrompts[index] ?? "",
        file: `Video01_Cena${String(index + 1).padStart(2, "0")}.mp4`,
      })),
    }],
  }, null, 2);

  async function copyText(key: string, text: string) {
    try { await navigator.clipboard.writeText(text); setSent(key); window.setTimeout(() => setSent(null), 2000); } catch { /* texto continua na tela */ }
  }

  async function writePrompts() {
    setError(null);
    setBusy("prompt");
    try {
      const form = new FormData();
      (Object.keys(profile) as (keyof Profile)[]).forEach((key) => form.append(key, profile[key]));
      if (photo) form.append("image", photo);
      else if (pickedPin) form.append("image_url", pickedPin.full);
      const response = await fetch("/api/multiplier/clone/influencer-prompt", { method: "POST", body: form });
      if (!response.ok) { setError(await errorOf(response, "Não consegui escrever os prompts. Tente de novo.")); return; }
      const data = await response.json();
      setPrompts(Array.isArray(data.prompts) ? data.prompts : []);
    } catch {
      setError("Sem conexão. Tente de novo.");
    } finally { setBusy(null); }
  }

  async function copy(index: number) {
    try {
      await navigator.clipboard.writeText(prompts[index]);
      setCopied(index);
      window.setTimeout(() => setCopied(null), 1600);
    } catch { /* o texto continua na tela */ }
  }

  const hasProfile = Boolean(profile.look.trim() || profile.age.trim());

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8 sm:px-8">
      <PageHeader icon={UserRound} title="Criar influencer" description="Do anúncio até a pessoa: achamos o rosto no Pinterest e escrevemos o prompt realista para gerar a imagem em qualquer IA." />
      <span className="inline-block rounded-full border border-[#A98BFF]/40 px-2.5 py-0.5 text-[11px] font-semibold tracking-wider text-[#A98BFF]">BETA</span>

      {busy && (
        <div role="status" className="flex items-center gap-3 rounded-[14px] border border-[#A98BFF]/40 bg-[#7B3FE4]/10 px-4 py-3 text-sm">
          <Loader2 className="size-4 animate-spin text-[#A98BFF]" />
          {busy === "profile" ? "Lendo o anúncio e descobrindo a pessoa…" : busy === "pins" ? "Buscando fotos no Pinterest…" : busy === "prompt" ? "Escrevendo os prompts realistas…" : "Montando o storyboard e os prompts de cada cena…"}
        </div>
      )}
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

      <Step n={1} title="Cole o anúncio (ou descreva a pessoa)">
        <textarea value={ad} onChange={(event) => setAd(event.target.value)} rows={6} maxLength={4000} aria-label="Anúncio ou descrição da pessoa" className={inputClass}
          placeholder={"Ex.: Avatar: Mulher branca, loira, de +50 anos, gravando na cozinha da sua casa usando a câmera do celular.\nH1: ..."} />
        <Button type="button" onClick={() => void analyse()} disabled={busy !== null || ad.trim().length < 10} className="rounded-full">
          {busy === "profile" ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} {busy === "profile" ? "Lendo o anúncio…" : "Descobrir a pessoa"}
        </Button>
      </Step>

      {hasProfile && (
        <Step n={2} title="Confira a pessoa e escolha a foto no Pinterest">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm">Nome<input value={profile.name} onChange={(e) => setField("name", e.target.value)} className={inputClass} maxLength={40} /></label>
            <label className="space-y-1 text-sm">Idade<input value={profile.age} onChange={(e) => setField("age", e.target.value)} className={inputClass} maxLength={40} /></label>
            <label className="space-y-1 text-sm sm:col-span-2">Aparência<input value={profile.look} onChange={(e) => setField("look", e.target.value)} className={inputClass} maxLength={300} /></label>
            <label className="space-y-1 text-sm sm:col-span-2">Onde ela grava<input value={profile.setting} onChange={(e) => setField("setting", e.target.value)} className={inputClass} maxLength={200} /></label>
          </div>

          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Buscas prontas no Pinterest</p>
            <div className="flex flex-wrap gap-2">
              {searches.map((query) => (
                <a key={query} href={pinterestUrl(query)} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm hover:text-foreground">
                  <Search className="size-3.5" /> {query} <ExternalLink className="size-3 opacity-60" />
                </a>
              ))}
            </div>
            <Button type="button" onClick={() => void findPins()} disabled={busy !== null || searches.length === 0} className="rounded-full">
              {busy === "pins" ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />} {busy === "pins" ? "Buscando no Pinterest…" : "Buscar fotos automaticamente"}
            </Button>
            {pinsFailed && (
              <div role="status" className="space-y-3 rounded-[14px] border border-[#F5B454]/50 bg-[#F5B454]/10 p-4" data-testid="pins-fallback">
                <p className="font-medium">Não consegui buscar as fotos sozinho agora. Vamos pelo Pinterest:</p>
                <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
                  <li>Toque em “Abrir o Pinterest com a busca”. Ele abre já com a descrição da pessoa.</li>
                  <li>Escolha a foto que você quer, copie a imagem (ou salve).</li>
                  <li>Volte aqui e cole com Ctrl+V, ou solte a foto na caixa abaixo.</li>
                </ol>
                <div className="flex flex-wrap gap-2">
                  {searches[0] && (
                    <a href={pinterestUrl(searches[0])} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-[#8B5CF6] to-[#7B3FE4] px-4 py-2 text-sm font-medium text-white">
                      Abrir o Pinterest com a busca <ExternalLink className="size-3.5" />
                    </a>
                  )}
                  <Button type="button" variant="outline" className="rounded-full" onClick={() => void findPins()} disabled={busy !== null}>Tentar de novo</Button>
                </div>
                <div onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => { event.preventDefault(); const file = Array.from(event.dataTransfer.files).find((item) => item.type.startsWith("image/")); if (file) { setPhoto(file); setPickedPin(null); } }}
                  className="grid min-h-20 place-items-center rounded-[12px] border border-dashed border-border px-4 text-center text-sm text-muted-foreground" data-testid="photo-drop">
                  Solte a foto aqui ou cole com Ctrl+V
                </div>
              </div>
            )}
            {pins.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm">Toque na foto que você quer usar:</p>
                <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                  {pins.map((pin) => (
                    <li key={pin.id}>
                      <button type="button" aria-label="Usar esta foto" aria-pressed={pickedPin?.id === pin.id} onClick={() => { setPickedPin(pin); setPhoto(null); }}
                        className={cn("block w-full overflow-hidden rounded-[12px] border-2", pickedPin?.id === pin.id ? "border-[#A98BFF]" : "border-transparent")}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={pin.thumb} alt="Foto do Pinterest" loading="lazy" referrerPolicy="no-referrer" className="aspect-[3/4] w-full object-cover" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p className="text-xs text-muted-foreground">Ou busque à mão: o Pinterest abre em outra aba. Escolha a foto que você gostou, copie a imagem (ou salve) e volte aqui: cole com Ctrl+V ou toque em “Escolher foto”.</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label="Escolher foto da pessoa"
              onChange={(event) => { const file = event.target.files?.[0]; if (file) { setPhoto(file); setPickedPin(null); } event.target.value = ""; }} />
            <Button type="button" variant="outline" className="rounded-full" onClick={() => { setPickedPin(null); fileRef.current?.click(); }}><ImagePlus className="size-4" /> Escolher foto</Button>
            {pickedPin && !photoUrl && (
              <span className="relative inline-block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={pickedPin.thumb} alt="Foto escolhida" referrerPolicy="no-referrer" className="h-24 w-20 rounded-[12px] border border-border object-cover" />
                <button type="button" aria-label="Remover foto" onClick={() => setPickedPin(null)} className="absolute -right-2 -top-2 grid size-5 place-items-center rounded-full bg-black text-white"><X className="size-3" /></button>
              </span>
            )}
            {photoUrl && (
              <span className="relative inline-block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photoUrl} alt="Foto escolhida" className="h-24 w-20 rounded-[12px] border border-border object-cover" />
                <button type="button" aria-label="Remover foto" onClick={() => setPhoto(null)} className="absolute -right-2 -top-2 grid size-5 place-items-center rounded-full bg-black text-white"><X className="size-3" /></button>
              </span>
            )}
          </div>
        </Step>
      )}

      {hasProfile && (
        <Step n={3} title="Gerar o prompt realista">
          <label className="block space-y-1 text-sm">Algo a mais (opcional)<input value={profile.extra} onChange={(e) => setField("extra", e.target.value)} className={inputClass} maxLength={300} placeholder="Ex.: luz do fim de tarde, cozinha pequena" /></label>
          <Button type="button" onClick={() => void writePrompts()} disabled={busy !== null} className="rounded-full">
            {busy === "prompt" ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} {busy === "prompt" ? "Escrevendo os prompts…" : photo || pickedPin ? "Gerar prompts com a foto" : "Gerar prompts"}
          </Button>

          {prompts.length > 0 && (
            <div className="space-y-3">
              {prompts.map((prompt, index) => (
                <div key={prompt} className="space-y-2 rounded-[14px] border border-border bg-background p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Opção {index + 1}</p>
                    <button type="button" onClick={() => void copy(index)} className={cn("inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs hover:text-foreground")}>
                      {copied === index ? <Check className="size-3.5 text-[#5BD69A]" /> : <ClipboardCopy className="size-3.5" />} {copied === index ? "Copiado" : "Copiar"}
                    </button>
                  </div>
                  <p className="whitespace-pre-line font-mono text-xs leading-relaxed">{prompt}</p>
                </div>
              ))}
              <div className="space-y-3 rounded-[14px] border border-[#A98BFF]/40 bg-[#7B3FE4]/10 p-4" data-testid="flow-generate">
                <p className="font-medium">Gerar a imagem no Flow (usa os créditos da sua conta, não gasta os da plataforma)</p>
                {flowConnected ? (
                  <p className="text-sm text-muted-foreground">Seu Flow está conectado. Copie a opção que você gostou, abra o Flow, cole no campo “O que você quer criar?” e, se quiser manter o rosto da foto, toque em “+” e envie a foto como referência.</p>
                ) : (
                  <p className="text-sm text-muted-foreground">Você ainda não conectou o seu Flow. <Link href="/conectar-flow" className="underline underline-offset-4">Conecte aqui</Link> (leva 1 minuto) e volte para gerar a imagem na sua conta.</p>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <a href={FLOW_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-[#8B5CF6] to-[#7B3FE4] px-4 py-2 text-sm font-medium text-white">Abrir o meu Flow <ExternalLink className="size-3.5" /></a>
                  {FLOW_TOOL_SHARE_URL && (
                    <a href={FLOW_TOOL_SHARE_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-sm hover:text-foreground">Abrir a ferramenta da Gringatools no Flow <ExternalLink className="size-3.5" /></a>
                  )}
                  {pickedPin && (
                    <a href={pickedPin.full} target="_blank" rel="noopener noreferrer" download className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-sm hover:text-foreground">Baixar a foto escolhida <ExternalLink className="size-3.5" /></a>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">Dica: gere com o modelo de imagem do Flow (ex.: Nano Banana Pro), escolha a melhor e use essa imagem como a pessoa das cenas do vídeo.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted-foreground">Ou cole em outra IA de imagem, junto com a foto:</span>
                {AIS.map((ai) => (
                  <a key={ai.name} href={ai.href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 hover:text-foreground">{ai.name} <ExternalLink className="size-3 opacity-60" /></a>
                ))}
              </div>
            </div>
          )}
        </Step>
      )}

      {hasProfile && (
        <Step n={4} title="Fazer o vídeo barato no seu Flow">
          <p className="text-sm text-muted-foreground">O app divide a fala em cenas de uns 8 segundos e escreve os prompts de imagem e de movimento, sempre com a mesma pessoa. Você só confere e manda para o Flow.</p>
          <label className="block space-y-1 text-sm">Fala do vídeo (a copy)
            <textarea value={copy4} onChange={(event) => setCopy4(event.target.value)} rows={5} maxLength={4000} className={inputClass} aria-label="Fala do vídeo" />
          </label>
          <div className="space-y-2">
            <p className="text-sm">Qual modelo do Flow?</p>
            <div role="radiogroup" aria-label="Modelo do Flow" className="flex flex-wrap gap-2">
              {isAdmin ? (
                <span className="rounded-full border border-transparent bg-primary px-4 py-1.5 text-sm text-primary-foreground">Lower Priority · 0 créditos</span>
              ) : FLOW_MODELS.map((item) => (
                <button key={item.id} type="button" role="radio" aria-checked={model === item.id} onClick={() => { setModel(item.id); saveFlowCategory(item.id); }}
                  className={cn("rounded-full border px-4 py-1.5 text-sm", model === item.id ? "border-transparent bg-primary text-primary-foreground" : "border-border text-muted-foreground")}>
                  {item.name} · {item.credits} créd./cena <span className="opacity-70">({item.note})</span>
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <p className="text-sm">Velocidade da fala</p>
              <div role="radiogroup" aria-label="Velocidade da fala" className="flex flex-wrap gap-2">
                {([["natural", "Natural"], ["fast", "Um pouco mais rápida"], ["faster", "Rápida"]] as const).map(([value, label]) => (
                  <button key={value} type="button" role="radio" aria-checked={cadence === value} onClick={() => setCadence(value)}
                    className={cn("rounded-full border px-3 py-1.5 text-sm", cadence === value ? "border-transparent bg-primary text-primary-foreground" : "border-border text-muted-foreground")}>{label}</button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-sm">Jeito de falar</p>
              <div role="radiogroup" aria-label="Jeito de falar" className="flex flex-wrap gap-2">
                {([["calm", "Calmo, boca contida"], ["lively", "Animado, mais expressivo"]] as const).map(([value, label]) => (
                  <button key={value} type="button" role="radio" aria-checked={energy === value} onClick={() => setEnergy(value)}
                    className={cn("rounded-full border px-3 py-1.5 text-sm", energy === value ? "border-transparent bg-primary text-primary-foreground" : "border-border text-muted-foreground")}>{label}</button>
                ))}
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-sm">Como o Flow gera cada cena?</p>
            <div role="radiogroup" aria-label="Modo de geração" className="flex flex-wrap gap-2">
              {([[true, "Por frames (recomendado)"], [false, "Cena solta"]] as const).map(([value, label]) => (
                <button key={label} type="button" role="radio" aria-checked={frames === value} onClick={() => setFrames(value)}
                  className={cn("rounded-full border px-4 py-1.5 text-sm", frames === value ? "border-transparent bg-primary text-primary-foreground" : "border-border text-muted-foreground")}>{label}</button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">{frames
              ? "No Flow, escolha Vídeo > Frames. A cena 1 começa na imagem da pessoa; cada cena seguinte começa no último quadro da anterior. A pessoa e o cenário não mudam, e custa o mesmo por cena."
              : "Cada cena começa do zero a partir do prompt. É mais rápido, mas o rosto pode variar entre as cenas."}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span>Cenas:</span>
            <button type="button" aria-label="Menos uma cena" className="size-8 rounded-full border border-border" onClick={() => setSceneCount((n) => Math.max(1, n - 1))}>−</button>
            <b className="tabular-nums">{sceneCount}</b>
            <button type="button" aria-label="Mais uma cena" className="size-8 rounded-full border border-border" onClick={() => setSceneCount((n) => Math.min(6, n + 1))}>+</button>
            <span className="text-muted-foreground">≈ {sceneCount * 8}s · gasto estimado: <b className="text-foreground">{perScene * sceneCount} créditos</b> do seu Flow</span>
          </div>
          <Button type="button" onClick={() => void buildBoard()} disabled={busy !== null || copy4.trim().length < 20} className="rounded-full">
            {busy === "board" ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} {busy === "board" ? "Montando o storyboard…" : "Montar o storyboard"}
          </Button>

          {board && (
            <div className="space-y-3" data-testid="storyboard">
              <ol className="space-y-2">
                {board.scenes.map((scene, index) => (
                  <li key={`${index}-${scene.line}`} className="rounded-[14px] border border-border bg-background p-3 text-sm">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Cena {index + 1}</p>
                    <p>“{scene.line}”</p>
                    <p className="text-xs text-muted-foreground">{scene.what}</p>
                    {frames && (index === 0 ? <p className="mt-1 text-xs text-[#A98BFF]">Frame inicial: a imagem da pessoa (passo 3).</p> : <p className="mt-1 text-xs text-[#A98BFF]">Frame inicial: o último frame da cena {index}.</p>)}
                    {frames && <LastFrame sceneNumber={index + 1} nextScene={index < board.scenes.length - 1} />}
                  </li>
                ))}
              </ol>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => { void copyText("pack", flowPackage()); window.open(FLOW_URL, "_blank", "noopener"); }}
                  className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-[#8B5CF6] to-[#7B3FE4] px-4 py-2 text-sm font-medium text-white">
                  {sent === "pack" ? <Check className="size-4" /> : <ClipboardCopy className="size-4" />} Copiar pacote e abrir o Flow
                </button>
                <button type="button" onClick={() => void copyText("all", board.scenes.map((scene, index) => `CENA ${index + 1}\nFala: ${scene.line}\nImagem: ${board.imagePrompts[index] ?? ""}\nMovimento: ${board.videoPrompts[index] ?? ""}`).join("\n\n"))}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-sm hover:text-foreground">
                  {sent === "all" ? <Check className="size-4 text-[#5BD69A]" /> : <ClipboardCopy className="size-4" />} Copiar só os prompts
                </button>
              </div>
              <p className="text-xs text-muted-foreground">Com a extensão ClipGringa · Flow, cole o pacote nela e ela gera e baixa as cenas sozinha. Sem a extensão, use “Copiar só os prompts” e cole no Flow cena por cena. Depois suba os vídeos na Automação para montar com legenda. A extensão ainda não encadeia os frames sozinha: no modo por frames, use o botão “Subir o vídeo da cena” em cada cena para pegar o último frame.</p>
            </div>
          )}
        </Step>
      )}
    </main>
  );
}
