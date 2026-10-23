"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ClipboardCopy, ExternalLink, ImagePlus, Loader2, Search, Sparkles, UserRound, X } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useSession } from "@/lib/auth-client";
import { FLOW_CHOICES, defaultFlowCategory, saveFlowCategory } from "@/lib/flow-models";
import { TypedText } from "@/components/app/typed-text";
import { LastFrame } from "@/components/app/last-frame";
import { PageHeader } from "@/components/app/page-header";
import { InfluencerChat, type Brief } from "@/components/app/influencer-chat";
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

const STEPS = ["Anúncio", "Pessoa e foto", "Prompt", "Vídeo"];
const MISSIONS = [
  "Cole o anúncio e toque em “Descobrir a pessoa”",
  "Toque na foto que mais parece com a sua influencer",
  "Gere o prompt e copie a opção que você mais gostou",
  "Monte o storyboard e mande para o Flow",
];
const XP_STEP = 10;
const XP_FINAL = 30;
const CONFETTI = ["#8B5CF6", "#A98BFF", "#5BD69A", "#F5B454", "#F0466B", "#3A9BBB"];

function Confetti() {
  return (
    <div className="gt-confetti" aria-hidden="true">
      {Array.from({ length: 24 }, (_, i) => (
        <i key={i} style={{ left: `${(i * 4.2 + 2) % 100}%`, background: CONFETTI[i % CONFETTI.length], animationDelay: `${(i % 8) * 0.07}s` }} />
      ))}
    </div>
  );
}

function Stepper({ step, maxStep, onGo, finished, xp }: { step: number; maxStep: number; onGo: (n: number) => void; finished: boolean; xp: number }) {
  const percent = finished ? 100 : Math.round(((step - 1) / STEPS.length) * 100);
  const left = STEPS.length - (step - 1);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-foreground">{finished ? "Tudo pronto! 🎉" : `Etapa ${step} de ${STEPS.length} · ${STEPS[step - 1]}`}</span>
        <span className="flex items-center gap-3 text-muted-foreground">
          <b data-testid="xp" className="rounded-full bg-[#F5B454]/15 px-2.5 py-0.5 text-[#F5B454]">⭐ {xp} XP</b>
          {finished ? "100%" : left === 1 ? "Falta só a última" : `Faltam ${left} etapas`}
        </span>
      </div>
      <div role="progressbar" aria-label="Progresso" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} className="h-3 w-full overflow-hidden rounded-full bg-[#7B3FE4]/15">
        <div className="progress-sheen relative h-full overflow-hidden rounded-full bg-gradient-to-r from-[#8B5CF6] to-[#A98BFF] transition-[width] duration-700 ease-out" style={{ width: `${Math.max(percent, 6)}%` }} />
      </div>
    <nav aria-label="Etapas" className="flex flex-wrap items-center gap-2">
      {STEPS.map((label, index) => {
        const n = index + 1;
        const done = n < maxStep || (n < step);
        return (
          <button key={label} type="button" disabled={n > maxStep} aria-current={n === step ? "step" : undefined} onClick={() => onGo(n)}
            className={cn("inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-40",
              n === step ? "border-[#A98BFF] bg-[#7B3FE4]/20 text-foreground" : "border-border text-muted-foreground")}>
            <span className="grid size-5 place-items-center rounded-full bg-[#7B3FE4]/30 text-[11px]">{done ? <Check className="size-3 text-[#5BD69A]" /> : n}</span>
            {label}
          </button>
        );
      })}
    </nav>
    </div>
  );
}

function Nav({ back, next, nextLabel = "Avançar", nextDisabled }: { back?: () => void; next?: () => void; nextLabel?: string; nextDisabled?: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
      {back ? <Button type="button" variant="outline" className="rounded-full" onClick={back}>Voltar</Button> : <span />}
      {next && <Button type="button" className="gt-btn3d rounded-full px-6 font-semibold" onClick={next} disabled={nextDisabled}>{nextLabel}</Button>}
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="gt-pop space-y-4 rounded-[18px] border border-border bg-card p-5">
      <p data-testid="mission" className="inline-flex items-center gap-2 rounded-full bg-[#7B3FE4]/15 px-3 py-1 text-xs font-medium text-[#C9BBFA]">🎯 Missão: {MISSIONS[n - 1]}</p>
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
  const [step, setStep] = useState(1);
  const [maxStep, setMaxStep] = useState(1);
  const [xp, setXp] = useState(0);
  const [cheer, setCheer] = useState<string | null>(null);
  const [doneSteps, setDoneSteps] = useState<number[]>([]);
  const cheerTimer = useRef<number | undefined>(undefined);
  const celebrate = (text: string) => {
    setCheer(text);
    window.clearTimeout(cheerTimer.current);
    cheerTimer.current = window.setTimeout(() => setCheer(null), 3200);
  };
  const award = (n: number, points: number, text: string) => {
    if (doneSteps.includes(n)) return;
    setDoneSteps((current) => [...current, n]);
    setXp((current) => current + points);
    celebrate(text);
  };
  const go = (n: number) => {
    if (n > step) award(step, XP_STEP, `Etapa ${step} concluída! +${XP_STEP} XP 🎉`);
    setStep(n);
    setMaxStep((current) => Math.max(current, n));
    document.getElementById("influencer-topo")?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  };
  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem("gv-influencer-v1") ?? "{}");
      if (typeof saved.ad === "string") setAd(saved.ad);
      if (saved.profile && typeof saved.profile === "object") {
        setProfile({ ...EMPTY, ...saved.profile });
        if (saved.profile.look || saved.profile.age) { setStep(2); setMaxStep(2); }
      }
      if (Array.isArray(saved.searches)) setSearches(saved.searches);
      if (typeof saved.copy4 === "string") setCopy4(saved.copy4);
    } catch { /* storage unavailable */ }
    setRestored(true);
  }, []);
  const { data: session } = useSession();
  const isAdmin = Boolean((session?.user as { is_admin?: boolean } | undefined)?.is_admin);
  const [copy4, setCopy4] = useState("");
  const [model, setModel] = useState<string>(FLOW_CHOICES[1].id);
  const [sceneCount, setSceneCount] = useState(4);
  const [boards, setBoards] = useState<Board[]>([]);
  const [activeVideo, setActiveVideo] = useState(0);
  const [videoCount, setVideoCount] = useState(1);
  const board: Board | null = boards[activeVideo] ?? null;
  const [sent, setSent] = useState<string | null>(null);
  const [frames, setFrames] = useState(true);
  const [author, setAuthor] = useState("");
  const [angle, setAngle] = useState("");
  const [language, setLanguage] = useState("pt-BR");
  const [productName, setProductName] = useState("");
  const [productLook, setProductLook] = useState("");
  const [productBusy, setProductBusy] = useState(false);
  const productRef = useRef<HTMLInputElement>(null);
  const [cadence, setCadence] = useState<"natural" | "fast" | "faster">("natural");
  const [energy, setEnergy] = useState<"calm" | "lively">("calm");
  const wordsPerSecond = cadence === "natural" ? 2.5 : cadence === "fast" ? 2.75 : 3.1;
  useEffect(() => { setModel(defaultFlowCategory(isAdmin)); }, [isAdmin]);
  useEffect(() => {
    setCopy4((current) => current || ad);
  }, [ad]);
  useEffect(() => {
    if (!restored) return;
    try { window.localStorage.setItem("gv-influencer-v1", JSON.stringify({ ad, profile, searches, copy4 })); } catch { /* storage unavailable */ }
  }, [restored, ad, profile, searches, copy4]);
  const words = copy4.split(/\s+/).filter(Boolean).length;
  useEffect(() => { if (words) setSceneCount(Math.max(1, Math.min(6, Math.round(words / (wordsPerSecond * 7))))); }, [words, wordsPerSecond]);
  const chosen = FLOW_CHOICES.find((item) => item.id === model) ?? FLOW_CHOICES[1];
  const lower = chosen.id === "lower";
  const perScene = chosen.credits;
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

  useEffect(() => {
    if ((photo || pickedPin) && step === 2) go(3);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photo, pickedPin]);

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
      go(2);
      if (found.length) await findPins(found);
      return;
    } catch {
      setError("Sem conexão. Tente de novo.");
    } finally { setBusy(null); }
  }

  async function fromChat(brief: Brief) {
    setProfile({ ...EMPTY, ...brief.persona });
    setSearches(brief.searches);
    if (brief.copy) { setAd(brief.copy); setCopy4(brief.copy); }
    setPins([]);
    setPickedPin(null);
    go(2);
    if (brief.searches.length) await findPins(brief.searches);
  }

  async function findPins(list: string[] = searches) {
    setError(null);
    setPinsFailed(false);
    setBusy("pins");
    try {
      const response = await fetch("/api/multiplier/clone/influencer-pins", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ queries: list, author: author.trim() }),
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

  async function readProduct(files: FileList) {
    setError(null);
    setProductBusy(true);
    try {
      const form = new FormData();
      Array.from(files).slice(0, 3).forEach((file) => form.append("images", file));
      const response = await fetch("/api/multiplier/clone/product-look", { method: "POST", body: form });
      if (!response.ok) { setError(await errorOf(response, "Não consegui ler a foto do produto. Use PNG, JPG ou WebP de até 5 MB.")); return; }
      const data = await response.json();
      setProductLook(typeof data.look === "string" ? data.look : "");
    } catch {
      setError("Sem conexão. Tente de novo.");
    } finally { setProductBusy(false); }
  }

  async function buildBoard() {
    setError(null);
    setBusy("board");
    try {
      const angles = ["curiosity", "problem", "proof", "question", "curiosity"];
      const result: Board[] = [];
      for (let i = 0; i < videoCount; i += 1) {
        const response = await fetch("/api/multiplier/clone/influencer-storyboard", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ copy: copy4, scene_count: sceneCount, persona: profile, language, cadence, energy, angle: angle || (videoCount > 1 ? angles[i] : ""), product: productName.trim(), product_look: productLook.trim(), show_product: Boolean(productLook.trim() || productName.trim()) }),
        });
        if (!response.ok) { setError(await errorOf(response, "Não consegui montar o storyboard. Confira a fala e tente de novo.")); return; }
        result.push(await response.json());
      }
      setBoards(result);
      setActiveVideo(0);
      award(4, XP_FINAL, `Tudo pronto! +${XP_FINAL} XP 🏆`);
    } catch {
      setError("Sem conexão. Tente de novo.");
    } finally { setBusy(null); }
  }

  const flowPackage = () => JSON.stringify({
    app: "clipgringa-flow", version: 1, sceneCount: board?.scenes.length ?? 0,
    model: chosen.name,
    flowModel: chosen.needle,
    lowerPriority: lower,
    mode: frames ? "frames" : "scenes",
    videos: boards.map((item, v) => ({
      title: `${profile.name || "Influencer"} ${v + 1}`,
      scenes: item.scenes.map((_, index) => ({
        imagePrompt: item.imagePrompts[index] ?? "", videoPrompt: item.videoPrompts[index] ?? "",
        file: `Video${String(v + 1).padStart(2, "0")}_Cena${String(index + 1).padStart(2, "0")}.mp4`,
      })),
    })),
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

      <div id="influencer-topo" />
      <Stepper step={step} maxStep={maxStep} onGo={go} finished={boards.length > 0} xp={xp} />
      {cheer && (
        <div role="status" aria-live="polite" data-testid="cheer" className="gt-pop rounded-[14px] border border-[#5BD69A]/40 bg-[#5BD69A]/10 px-4 py-3 text-sm font-semibold text-[#5BD69A]">
          {cheer}
          <Confetti />
        </div>
      )}

      {busy && (
        <div role="status" className="flex items-center gap-3 rounded-[14px] border border-[#A98BFF]/40 bg-[#7B3FE4]/10 px-4 py-3 text-sm">
          <Loader2 className="size-4 animate-spin text-[#A98BFF]" />
          {busy === "profile" ? "Lendo o anúncio e descobrindo a pessoa…" : busy === "pins" ? "Buscando fotos no Pinterest…" : busy === "prompt" ? "Escrevendo os prompts realistas…" : "Montando o storyboard e os prompts de cada cena…"}
        </div>
      )}
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

      {step === 1 && <InfluencerChat onReady={(brief) => void fromChat(brief)} busy={busy !== null} />}

      {step === 1 && <Step n={1} title="Ou cole um anúncio pronto (opcional)">
        <textarea value={ad} onChange={(event) => setAd(event.target.value)} rows={6} maxLength={4000} aria-label="Anúncio ou descrição da pessoa" className={inputClass}
          placeholder={"Ex.: Avatar: Mulher branca, loira, de +50 anos, gravando na cozinha da sua casa usando a câmera do celular.\nH1: ..."} />
        <Button type="button" onClick={() => void analyse()} disabled={busy !== null || ad.trim().length < 10} className="rounded-full">
          {busy === "profile" ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} {busy === "profile" ? "Lendo o anúncio…" : "Descobrir a pessoa"}
        </Button>
        {hasProfile && <Nav next={() => go(2)} nextLabel="Já tenho a pessoa: avançar" />}
      </Step>}

      {step === 2 && (
        <Step n={2} title="Confira a pessoa e escolha a foto">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm">Nome<input value={profile.name} onChange={(e) => setField("name", e.target.value)} className={inputClass} maxLength={40} /></label>
            <label className="space-y-1 text-sm">Idade<input value={profile.age} onChange={(e) => setField("age", e.target.value)} className={inputClass} maxLength={40} /></label>
            <label className="space-y-1 text-sm sm:col-span-2">Aparência<input value={profile.look} onChange={(e) => setField("look", e.target.value)} className={inputClass} maxLength={300} /></label>
            <label className="space-y-1 text-sm sm:col-span-2">Onde ela grava<input value={profile.setting} onChange={(e) => setField("setting", e.target.value)} className={inputClass} maxLength={200} /></label>
          </div>

          <div className="space-y-2">
            <Button type="button" onClick={() => void findPins()} disabled={busy !== null || (searches.length === 0 && !author.trim())} className="rounded-full">
              {busy === "pins" ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />} {busy === "pins" ? "Buscando fotos…" : pins.length ? "Buscar de novo" : "Buscar fotos automaticamente"}
            </Button>
            <details className="rounded-[12px] border border-border p-3" data-testid="author-search">
              <summary className="cursor-pointer text-sm text-muted-foreground">Quer fotos de um autor específico? (opcional)</summary>
              <label className="mt-2 block space-y-1 text-sm">Perfil do autor no Pinterest (link ou @)
                <input value={author} onChange={(event) => setAuthor(event.target.value)} maxLength={120} className={inputClass} placeholder="https://br.pinterest.com/nome-do-perfil/ ou @nome" aria-label="Perfil do autor no Pinterest" />
              </label>
            </details>
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
          <Nav back={() => go(1)} next={() => go(3)} nextLabel={photo || pickedPin ? "Avançar" : "Avançar sem foto"} />
        </Step>
      )}

      {step === 3 && (
        <Step n={3} title="Gerar o prompt realista">
          {(photoUrl || pickedPin) && (
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photoUrl ?? pickedPin?.thumb} alt="Foto escolhida" referrerPolicy="no-referrer" className="h-20 w-16 rounded-[12px] border border-border object-cover" />
              <div>Foto escolhida ✓ <button type="button" className="underline underline-offset-4" onClick={() => { setPhoto(null); setPickedPin(null); go(2); }}>Trocar foto</button></div>
            </div>
          )}
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
                  <TypedText text={prompt} className="whitespace-pre-line font-mono text-xs leading-relaxed" />
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
          <Nav back={() => go(2)} next={() => go(4)} nextLabel={prompts.length ? "Avançar para o vídeo" : "Pular para o vídeo"} />
        </Step>
      )}

      {step === 4 && (
        <Step n={4} title="Fazer o vídeo barato no seu Flow">
          <p className="text-sm text-muted-foreground">O app divide a fala em cenas de uns 8 segundos e escreve os prompts de imagem e de movimento, sempre com a mesma pessoa. Você só confere e manda para o Flow.</p>
          <label className="block space-y-1 text-sm">Fala do vídeo (a copy)
            <textarea value={copy4} onChange={(event) => setCopy4(event.target.value)} rows={5} maxLength={4000} className={inputClass} aria-label="Fala do vídeo" />
          </label>
          <div className="space-y-2">
            <p className="text-sm">Qual modelo do Flow?</p>
            <div role="radiogroup" aria-label="Modelo do Flow" className="flex flex-wrap gap-2">
              {FLOW_CHOICES.map((item) => (
                <button key={item.id} type="button" role="radio" aria-checked={model === item.id} onClick={() => { setModel(item.id); saveFlowCategory(item.id); }}
                  className={cn("rounded-full border px-4 py-1.5 text-sm", model === item.id ? "border-transparent bg-primary text-primary-foreground" : "border-border text-muted-foreground")}>
                  {item.id === "lower" ? "Lower Priority" : item.name} · {item.credits === 0 ? "0 créditos" : `${item.credits} créd./cena`} <span className="opacity-70">({item.note})</span>
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2 rounded-[14px] border border-border p-3" data-testid="product-block">
            <p className="text-sm font-medium">Produto na mão (opcional)</p>
            <p className="text-xs text-muted-foreground">Envie 1 a 3 fotos do produto. A pessoa aparece segurando e usando o mesmo produto em todas as cenas, sem texto inventado no rótulo.</p>
            <div className="flex flex-wrap items-center gap-2">
              <input ref={productRef} type="file" multiple accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label="Fotos do produto"
                onChange={(event) => { if (event.target.files?.length) void readProduct(event.target.files); event.target.value = ""; }} />
              <Button type="button" variant="outline" className="rounded-full" onClick={() => productRef.current?.click()} disabled={productBusy}>
                {productBusy ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />} {productBusy ? "Lendo o produto…" : "Enviar fotos do produto"}
              </Button>
              <input value={productName} onChange={(event) => setProductName(event.target.value)} maxLength={120} placeholder="Nome do produto (opcional)" aria-label="Nome do produto" className={cn(inputClass, "max-w-xs")} />
            </div>
            {productLook && (
              <label className="block space-y-1 text-xs text-muted-foreground">Como o produto aparece (pode ajustar)
                <textarea value={productLook} onChange={(event) => setProductLook(event.target.value)} rows={2} maxLength={500} className={inputClass} aria-label="Aparência do produto" />
              </label>
            )}
          </div>
          <details className="rounded-[14px] border border-border p-3" data-testid="more-options">
            <summary className="cursor-pointer text-sm font-medium">Mais ajustes (opcional) <span className="font-normal text-muted-foreground">· já vem tudo no padrão recomendado</span></summary>
            <div className="mt-3 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <p className="text-sm">Abertura (opcional)</p>
              <div role="radiogroup" aria-label="Ângulo da abertura" className="flex flex-wrap gap-2">
                {([["", "Como está"], ["curiosity", "Curiosidade"], ["problem", "Problema"], ["proof", "Prova"], ["question", "Pergunta"]] as const).map(([value, label]) => (
                  <button key={value || "none"} type="button" role="radio" aria-checked={angle === value} onClick={() => setAngle(value)}
                    className={cn("rounded-full border px-3 py-1.5 text-sm", angle === value ? "border-transparent bg-primary text-primary-foreground" : "border-border text-muted-foreground")}>{label}</button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-sm">Idioma da fala</p>
              <div role="radiogroup" aria-label="Idioma da fala" className="flex flex-wrap gap-2">
                {([["pt-BR", "Português"], ["en", "Inglês"], ["es", "Espanhol"]] as const).map(([value, label]) => (
                  <button key={value} type="button" role="radio" aria-checked={language === value} onClick={() => setLanguage(value)}
                    className={cn("rounded-full border px-3 py-1.5 text-sm", language === value ? "border-transparent bg-primary text-primary-foreground" : "border-border text-muted-foreground")}>{label}</button>
                ))}
              </div>
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
            </div>
          </details>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span>Cenas:</span>
            <button type="button" aria-label="Menos uma cena" className="size-8 rounded-full border border-border" onClick={() => setSceneCount((n) => Math.max(1, n - 1))}>−</button>
            <b className="tabular-nums">{sceneCount}</b>
            <button type="button" aria-label="Mais uma cena" className="size-8 rounded-full border border-border" onClick={() => setSceneCount((n) => Math.min(6, n + 1))}>+</button>
            <span className="text-muted-foreground">≈ {sceneCount * 8}s · gasto estimado: <b className="text-foreground">{perScene * sceneCount} créditos</b> do seu Flow</span>
          </div>
          <div className="space-y-2" data-testid="video-count">
            <p className="text-sm">Quantos vídeos você quer gerar?</p>
            <div role="radiogroup" aria-label="Quantidade de vídeos" className="flex flex-wrap gap-2">
              {[1, 2, 3, 5].map((n) => (
                <button key={n} type="button" role="radio" aria-checked={videoCount === n} onClick={() => setVideoCount(n)}
                  className={cn("rounded-full border px-4 py-1.5 text-sm", videoCount === n ? "border-transparent bg-primary text-primary-foreground" : "border-border text-muted-foreground")}>{n} {n === 1 ? "vídeo" : "vídeos"}</button>
              ))}
            </div>
            {videoCount > 1 && <p className="text-xs text-muted-foreground">Cada vídeo usa uma abertura diferente (curiosidade, problema, prova, pergunta). Gasto estimado: <b className="text-foreground">{perScene * sceneCount * videoCount} créditos</b> do seu Flow.</p>}
          </div>
          <Button type="button" onClick={() => void buildBoard()} disabled={busy !== null || copy4.trim().length < 20} className="rounded-full">
            {busy === "board" ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} {busy === "board" ? "Montando o storyboard…" : videoCount > 1 ? `Montar ${videoCount} storyboards` : "Montar o storyboard"}
          </Button>

          {board && (
            <div className="space-y-3" data-testid="storyboard">
              {boards.length > 1 && (
                <div role="tablist" aria-label="Vídeos" className="flex flex-wrap gap-2">
                  {boards.map((_, v) => (
                    <button key={v} type="button" role="tab" aria-selected={activeVideo === v} onClick={() => setActiveVideo(v)}
                      className={cn("rounded-full border px-3 py-1 text-xs", activeVideo === v ? "border-transparent bg-primary text-primary-foreground" : "border-border text-muted-foreground")}>Vídeo {v + 1}</button>
                  ))}
                </div>
              )}
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
              <div className="space-y-1" data-testid="next-steps">
                <p className="text-sm text-muted-foreground">Sugestões de próximos passos</p>
                {([
                  ["Fazer mais vídeos com outra abertura", () => { setVideoCount(3); setBoards([]); document.getElementById("influencer-topo")?.scrollIntoView?.({ behavior: "smooth" }); }],
                  ["Trocar a pessoa ou o nicho", () => { setBoards([]); setProfile(EMPTY); setPrompts([]); setStep(1); setMaxStep(1); }],
                  ["Montar com legenda na Automação", () => { window.location.href = "/automacao"; }],
                ] as [string, () => void][]).map(([label, action]) => (
                  <button key={label} type="button" onClick={action} className="block w-full rounded-[12px] px-2 py-2 text-left text-sm hover:bg-muted">↳ {label}</button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">Com a extensão ClipGringa · Flow, cole o pacote nela e ela gera e baixa as cenas sozinha. Sem a extensão, use “Copiar só os prompts” e cole no Flow cena por cena. Depois suba os vídeos na Automação para montar com legenda. A extensão ainda não encadeia os frames sozinha: no modo por frames, use o botão “Subir o vídeo da cena” em cada cena para pegar o último frame.</p>
            </div>
          )}
          <Nav back={() => go(3)} />
        </Step>
      )}
    </main>
  );
}
