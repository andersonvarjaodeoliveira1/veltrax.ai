"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ClipboardCopy, ExternalLink, ImagePlus, Loader2, Search, Sparkles, UserRound, X } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/app/page-header";
import { cn } from "@/lib/utils";

type Profile = { name: string; age: string; look: string; setting: string; extra: string };
const EMPTY: Profile = { name: "", age: "", look: "", setting: "", extra: "" };
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
  const [busy, setBusy] = useState<"profile" | "prompt" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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
      if (file) setPhoto(file);
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

  async function writePrompts() {
    setError(null);
    setBusy("prompt");
    try {
      const form = new FormData();
      (Object.keys(profile) as (keyof Profile)[]).forEach((key) => form.append(key, profile[key]));
      if (photo) form.append("image", photo);
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
            <p className="text-xs text-muted-foreground">O Pinterest abre em outra aba. Escolha a foto que você gostou, copie a imagem (ou salve) e volte aqui: cole com Ctrl+V ou toque em “Escolher foto”.</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label="Escolher foto da pessoa"
              onChange={(event) => { const file = event.target.files?.[0]; if (file) setPhoto(file); event.target.value = ""; }} />
            <Button type="button" variant="outline" className="rounded-full" onClick={() => fileRef.current?.click()}><ImagePlus className="size-4" /> Escolher foto</Button>
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
            {busy === "prompt" ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} {busy === "prompt" ? "Escrevendo os prompts…" : photo ? "Gerar prompts com a foto" : "Gerar prompts"}
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
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted-foreground">Cole em qualquer IA de imagem, junto com a foto:</span>
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
