"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ClipboardCopy, ExternalLink, ImagePlus, Loader2, Search, Sparkles, UserRound, X } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { PageHeader } from "@/components/app/page-header";
import { cn } from "@/lib/utils";

type Pin = { id: string; thumb: string; full: string; link: string };
type Profile = { name: string; age: string; look: string; setting: string; extra: string };
const EMPTY: Profile = { name: "", age: "", look: "", setting: "", extra: "" };
const FLOW_URL = "https://flow.google.com";
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
  const [busy, setBusy] = useState<"profile" | "prompt" | "pins" | null>(null);
  const [pins, setPins] = useState<Pin[]>([]);
  const [pickedPin, setPickedPin] = useState<Pin | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [flowConnected, setFlowConnected] = useState(false);
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
      setSearches(Array.isArray(data.searches) ? data.searches : []);
    } catch {
      setError("Sem conexão. Tente de novo.");
    } finally { setBusy(null); }
  }

  async function findPins() {
    setError(null);
    setBusy("pins");
    try {
      const response = await fetch("/api/multiplier/clone/influencer-pins", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ queries: searches }),
      });
      if (!response.ok) { setError(await errorOf(response, "Não consegui buscar no Pinterest agora. Use os botões abaixo para buscar à mão.")); return; }
      const data = await response.json();
      setPins(Array.isArray(data.pins) ? data.pins : []);
      if (!Array.isArray(data.pins) || data.pins.length === 0) setError("O Pinterest não devolveu fotos. Tente os botões de busca abaixo.");
    } catch {
      setError("Sem conexão. Tente de novo.");
    } finally { setBusy(null); }
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
    </main>
  );
}
