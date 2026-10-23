"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, ArrowUp, Check, ClipboardCopy, ImagePlus, Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/auth-client";
import { FLOW_CHOICES, defaultFlowCategory, saveFlowCategory } from "@/lib/flow-models";
import { useI18n } from "@/lib/i18n";
import { EXAMPLES, SKILLS, type Lang3, type SkillId } from "@/lib/influencer-examples";
import { cn } from "@/lib/utils";

type Option = { label: string; detail?: string };
type Question = { question: string; options: Option[] };
type Persona = { name: string; age: string; look: string; setting: string };
type Pin = { id: string; thumb: string; full: string };
type Board = { scenes: { line: string; what: string }[]; imagePrompts: string[]; videoPrompts: string[] };
type Phase = "home" | "ask" | "approve" | "photos" | "prompt" | "count" | "model" | "cost" | "board";

const FLOW_URL = "https://labs.google/fx/pt/tools/flow";
const SCENES = 4;
const ANGLES = ["curiosity", "problem", "proof", "question", "curiosity"];
const LANG_CODE: Record<Lang3, string> = { pt: "pt-BR", en: "en", es: "es" };

// Todo o texto segue o idioma escolhido pelo membro (PT/EN/ES).
const S = {
  home: ["O que vamos criar hoje?", "What are we creating today?", "¿Qué vamos a crear hoy?"],
  ph: ["Ex.: Gere uma influencer de 22 anos, loira, vendendo roupas", "E.g.: Create a 22-year-old blonde influencer selling clothes", "Ej.: Crea una influencer de 22 años, rubia, vendiendo ropa"],
  niche: ["Nicho (opcional)", "Niche (optional)", "Nicho (opcional)"],
  send: ["Criar a influencer", "Create the influencer", "Crear a la influencer"],
  recreate: ["Recriar", "Recreate", "Recrear"],
  all: ["Todos", "All", "Todos"],
  newChat: ["Novo chat", "New chat", "Nuevo chat"],
  think: ["Entendendo o pedido…", "Understanding your request…", "Entendiendo el pedido…"],
  build: ["Montando a influencer…", "Building the influencer…", "Armando a la influencer…"],
  skip: ["Pular", "Skip", "Omitir"],
  next: ["Continuar", "Continue", "Continuar"],
  approveT: ["Aprovar a criação", "Approve creation", "Aprobar la creación"],
  approveCost: ["Usa alguns tokens da plataforma para buscar fotos. Vídeos usam os créditos do seu Flow.", "Uses a few platform tokens to find photos. Videos use your own Flow credits.", "Usa algunos tokens de la plataforma para buscar fotos. Los videos usan tus créditos de Flow."],
  approve: ["Aprovar", "Approve", "Aprobar"],
  stop: ["Parar", "Stop", "Detener"],
  created: ["Criei a influencer. Escolha a foto que mais parece com ela:", "Influencer created. Pick the photo that looks most like her:", "Creé a la influencer. Elige la foto que más se parece a ella:"],
  searching: ["Buscando fotos…", "Finding photos…", "Buscando fotos…"],
  noPhotos: ["Não achei fotos. Envie uma sua ou siga sem foto.", "No photos found. Upload yours or continue without one.", "No encontré fotos. Sube la tuya o sigue sin foto."],
  upload: ["Enviar minha foto", "Upload my photo", "Subir mi foto"],
  noPhoto: ["Seguir sem foto", "Continue without photo", "Seguir sin foto"],
  writing: ["Escrevendo o prompt da imagem…", "Writing the image prompt…", "Escribiendo el prompt de la imagen…"],
  promptReady: ["Prompt da imagem pronto. Cole no gerador de imagem do seu Flow.", "Image prompt ready. Paste it in your Flow image generator.", "Prompt de la imagen listo. Pégalo en el generador de imágenes de tu Flow."],
  copy: ["Copiar", "Copy", "Copiar"],
  copied: ["Copiado", "Copied", "Copiado"],
  toVideos: ["Fazer os vídeos", "Make the videos", "Hacer los videos"],
  howMany: ["Quantos vídeos você quer gerar?", "How many videos do you want?", "¿Cuántos videos quieres generar?"],
  video: ["vídeo", "video", "video"],
  videos: ["vídeos", "videos", "videos"],
  whichModel: ["Qual modelo do Flow?", "Which Flow model?", "¿Qué modelo de Flow?"],
  credits: ["créditos por cena", "credits per scene", "créditos por escena"],
  zero: ["0 créditos", "0 credits", "0 créditos"],
  approveGen: ["Aprovar a geração", "Approve generation", "Aprobar la generación"],
  spend: ["Gasto estimado no seu Flow", "Estimated spend in your Flow", "Gasto estimado en tu Flow"],
  scenesWord: ["cenas", "scenes", "escenas"],
  making: ["Montando as cenas e os prompts…", "Building scenes and prompts…", "Armando las escenas y los prompts…"],
  ready: ["Pronto! Mande para o Flow:", "Done! Send it to Flow:", "¡Listo! Envíalo a Flow:"],
  pack: ["Copiar pacote e abrir o Flow", "Copy package and open Flow", "Copiar paquete y abrir Flow"],
  onlyPrompts: ["Copiar só os prompts", "Copy prompts only", "Copiar solo los prompts"],
  nextSteps: ["Sugestões de próximos passos", "Suggested next steps", "Pasos sugeridos"],
  more: ["Fazer mais vídeos com outra abertura", "Make more videos with another hook", "Hacer más videos con otro gancho"],
  automation: ["Montar com legenda na Automação", "Add captions in Automation", "Añadir subtítulos en Automatización"],
  error: ["Algo deu errado. Tente de novo.", "Something went wrong. Try again.", "Algo salió mal. Inténtalo de nuevo."],
  tokens: ["Seus tokens acabaram. Fale com o administrador para liberar mais.", "Your tokens ran out. Ask the administrator for more.", "Tus tokens se agotaron. Pide más al administrador."],
  fmt: ["Formato", "Format", "Formato"],
  video_n: ["Vídeo", "Video", "Video"],
  scene: ["Cena", "Scene", "Escena"],
} as const;

const Avatar = () => <span aria-hidden className="mt-1 size-6 shrink-0 rounded-full bg-gradient-to-br from-[#8B5CF6] to-[#A98BFF]" />;
const Msg = ({ children, testid }: { children: React.ReactNode; testid?: string }) => (
  <div className="flex gap-3" data-testid={testid}><Avatar /><div className="min-w-0 flex-1 space-y-3 text-sm">{children}</div></div>
);
const Chip = ({ on, onClick, children, role }: { on?: boolean; onClick: () => void; children: React.ReactNode; role?: string }) => (
  <button type="button" role={role} aria-checked={role ? Boolean(on) : undefined} aria-pressed={role ? undefined : on} onClick={onClick}
    className={cn("rounded-full border px-4 py-1.5 text-sm", on ? "border-transparent bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:text-foreground")}>{children}</button>
);
const Working = ({ text }: { text: string }) => (
  <div role="status" className="flex items-center gap-3 text-sm text-muted-foreground"><Avatar /><Loader2 className="size-4 animate-spin text-[#A98BFF]" /> {text}</div>
);

export function InfluencerChat() {
  const { lang: rawLang } = useI18n();
  const lang: Lang3 = rawLang === "en" || rawLang === "es" ? rawLang : "pt";
  const idx = lang === "pt" ? 0 : lang === "en" ? 1 : 2;
  const t = (key: keyof typeof S) => S[key][idx];

  const { data: session } = useSession();
  const isAdmin = Boolean((session?.user as { is_admin?: boolean } | undefined)?.is_admin);

  const [phase, setPhase] = useState<Phase>("home");
  const [prompt, setPrompt] = useState("");
  const [skill, setSkill] = useState<SkillId | "">("");
  const [filter, setFilter] = useState<SkillId | "all">("all");
  const [busy, setBusy] = useState<"" | "think" | "build" | "pins" | "prompt" | "board">("");
  const [error, setError] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [qi, setQi] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [answers, setAnswers] = useState<{ question: string; answer: string }[]>([]);
  const [persona, setPersona] = useState<Persona>({ name: "", age: "", look: "", setting: "" });
  const [searches, setSearches] = useState<string[]>([]);
  const [copyText, setCopyText] = useState("");
  const [pins, setPins] = useState<Pin[]>([]);
  const [pin, setPin] = useState<Pin | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [prompts, setPrompts] = useState<string[]>([]);
  const [summaries, setSummaries] = useState<string[]>([]);
  const [videoCount, setVideoCount] = useState(1);
  const [model, setModel] = useState<string>(FLOW_CHOICES[1].id);
  const [boards, setBoards] = useState<Board[]>([]);
  const [active, setActive] = useState(0);
  const [sent, setSent] = useState("");
  const [demo, setDemo] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setModel(defaultFlowCategory(isAdmin)); }, [isAdmin]);
  useEffect(() => { endRef.current?.scrollIntoView?.({ behavior: "smooth", block: "end" }); }, [phase, qi, pins.length, prompts.length, boards.length]);

  // Prompt de demonstração: digita e apaga exemplos, um após o outro.
  useEffect(() => {
    if (prompt || phase !== "home" || typeof window === "undefined" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const texts = EXAMPLES.map((item) => item.prompt[lang]);
    let ti = 0; let n = 0; let erasing = false; let timer = 0;
    const tick = () => {
      const full = texts[ti % texts.length];
      if (!erasing) { n += 1; setDemo(full.slice(0, n)); if (n >= full.length) { erasing = true; timer = window.setTimeout(tick, 1600); return; } }
      else { n -= 2; setDemo(full.slice(0, Math.max(n, 0))); if (n <= 0) { erasing = false; n = 0; ti += 1; timer = window.setTimeout(tick, 400); return; } }
      timer = window.setTimeout(tick, erasing ? 18 : 38);
    };
    timer = window.setTimeout(tick, 600);
    return () => window.clearTimeout(timer);
  }, [prompt, phase, lang]);

  const chosen = FLOW_CHOICES.find((item) => item.id === model) ?? FLOW_CHOICES[1];
  const lower = chosen.id === "lower";

  async function fail(response: Response) {
    try { const data = await response.json(); setError(data?.detail === "TOKENS_EXHAUSTED" ? t("tokens") : t("error")); } catch { setError(t("error")); }
  }

  function reset() {
    setPhase("home"); setPrompt(""); setSkill(""); setBusy(""); setError(""); setQuestions([]); setQi(0); setPicked(null); setAnswers([]);
    setPersona({ name: "", age: "", look: "", setting: "" }); setSearches([]); setCopyText(""); setPins([]); setPin(null); setPhoto(null);
    setPrompts([]); setSummaries([]); setVideoCount(1); setBoards([]); setActive(0);
  }

  async function brief(withAnswers: { question: string; answer: string }[]) {
    const response = await fetch("/api/multiplier/clone/influencer-brief", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, skill: skill || undefined, language: lang, answers: withAnswers.length ? withAnswers : undefined }),
    });
    if (!response.ok) { await fail(response); return null; }
    return response.json();
  }

  function takeBrief(data: { persona?: Persona; searches?: string[]; copy?: string }) {
    setPersona(data.persona ?? { name: "", age: "", look: "", setting: "" });
    setSearches(Array.isArray(data.searches) ? data.searches : []);
    setCopyText(data.copy || prompt);
    setPhase("approve");
  }

  async function start() {
    setError(""); setAnswers([]); setQi(0); setPicked(null); setQuestions([]);
    setPhase("ask"); setBusy("think");
    try {
      const data = await brief([]);
      if (!data) { setPhase("home"); return; }
      const list: Question[] = Array.isArray(data.questions) ? data.questions.filter((q: Question) => q?.options?.length >= 2).slice(0, 3) : [];
      if (list.length) setQuestions(list); else takeBrief(data);
    } catch { setError(t("error")); setPhase("home"); } finally { setBusy(""); }
  }

  async function answer(skipped: boolean) {
    const current = questions[qi];
    const next = skipped || !picked ? answers : [...answers, { question: current.question, answer: picked }];
    setAnswers(next); setPicked(null);
    if (qi + 1 < questions.length) { setQi(qi + 1); return; }
    setQuestions([]); setBusy("build");
    try { const data = await brief(next); if (data) takeBrief(data); } catch { setError(t("error")); } finally { setBusy(""); }
  }

  async function approve() {
    setPhase("photos"); setBusy("pins"); setError("");
    try {
      const response = await fetch("/api/multiplier/clone/influencer-pins", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ queries: searches, author: "" }),
      });
      if (response.ok) { const data = await response.json(); setPins(Array.isArray(data.pins) ? data.pins : []); }
    } catch { /* sem fotos: o membro envia a sua ou segue sem foto */ } finally { setBusy(""); }
  }

  async function writePrompt(file: File | null, chosenPin: Pin | null) {
    setPhoto(file); setPin(chosenPin);
    setPhase("prompt"); setBusy("prompt"); setError("");
    try {
      const form = new FormData();
      Object.entries({ ...persona, extra: "" }).forEach(([key, value]) => form.append(key, value));
      if (file) form.append("image", file); else if (chosenPin) form.append("image_url", chosenPin.full);
      const response = await fetch("/api/multiplier/clone/influencer-prompt", { method: "POST", body: form });
      if (!response.ok) { await fail(response); return; }
      const data = await response.json();
      setPrompts(Array.isArray(data.prompts) ? data.prompts : []);
      setSummaries(Array.isArray(data.summaries) ? data.summaries : []);
    } catch { setError(t("error")); } finally { setBusy(""); }
  }

  async function buildBoards() {
    setBusy("board"); setError(""); setPhase("board");
    try {
      const result: Board[] = [];
      for (let i = 0; i < videoCount; i += 1) {
        const response = await fetch("/api/multiplier/clone/influencer-storyboard", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ copy: copyText, scene_count: SCENES, persona: { ...persona, extra: "" }, language: LANG_CODE[lang], cadence: "natural", energy: "calm", angle: videoCount > 1 ? ANGLES[i] : "", product: "", product_look: "", show_product: false }),
        });
        if (!response.ok) { await fail(response); setPhase("cost"); return; }
        result.push(await response.json());
      }
      setBoards(result); setActive(0);
    } catch { setError(t("error")); setPhase("cost"); } finally { setBusy(""); }
  }

  const board = boards[active] ?? null;
  const flowPackage = () => JSON.stringify({
    app: "clipgringa-flow", version: 1, sceneCount: board?.scenes.length ?? 0, model: chosen.name, flowModel: chosen.needle, lowerPriority: lower, mode: "frames",
    videos: boards.map((item, v) => ({
      title: `${persona.name || "Influencer"} ${v + 1}`,
      scenes: item.scenes.map((_, index) => ({ imagePrompt: item.imagePrompts[index] ?? "", videoPrompt: item.videoPrompts[index] ?? "", file: `Video${String(v + 1).padStart(2, "0")}_Cena${String(index + 1).padStart(2, "0")}.mp4` })),
    })),
  }, null, 2);

  async function copyOut(key: string, text: string) {
    try { await navigator.clipboard.writeText(text); setSent(key); window.setTimeout(() => setSent(""), 1800); } catch { /* o texto continua na tela */ }
  }

  const shown = EXAMPLES.filter((item) => filter === "all" || item.skill === filter);
  const q = questions[qi];
  const totalCredits = chosen.credits * SCENES * videoCount;
  const started = phase !== "home";

  return (
    <section className="mx-auto w-full max-w-3xl space-y-6" data-testid="influencer-chat">
      {started && (
        <div className="flex items-center justify-between gap-2">
          <p className="max-w-[80%] rounded-full border border-border bg-card px-5 py-2 text-xs font-semibold uppercase tracking-wide" data-testid="chat-user-bubble">{prompt}</p>
          <button type="button" onClick={reset} className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"><Plus className="size-3.5" /> {t("newChat")}</button>
        </div>
      )}

      {phase === "home" && (
        <>
          <h1 className="pt-4 text-center text-3xl font-semibold tracking-tight">{t("home")}</h1>
          <div className="space-y-4" data-testid="influencer-examples">
            <div role="group" aria-label={t("all")} className="flex flex-wrap justify-center gap-2">
              {([["all", t("all")], ...SKILLS.map((s) => [s.id, `${s.emoji} ${s.name[lang]}`])] as [SkillId | "all", string][]).map(([id, label]) => (
                <Chip key={id} on={filter === id} onClick={() => setFilter(id)}>{label}</Chip>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {shown.map((item) => (
                <button key={item.id} type="button" onClick={() => { setPrompt(item.prompt[lang]); setSkill(item.skill); }}
                  className="overflow-hidden rounded-[18px] border border-border bg-card text-left transition hover:border-[#A98BFF]">
                  <div className="relative flex h-28 items-center justify-center text-5xl" style={{ background: `linear-gradient(135deg, ${item.from}, ${item.to})` }} aria-hidden>
                    {item.emoji}
                    <span className="absolute left-3 top-3 rounded-full bg-black/40 px-2 py-0.5 text-[10px] font-medium text-white">{SKILLS.find((s) => s.id === item.skill)?.name[lang]}</span>
                  </div>
                  <div className="space-y-2 p-3.5">
                    <p className="text-sm font-medium leading-snug">{item.title[lang]}</p>
                    <p className="text-xs text-muted-foreground"><b>{t("fmt")}:</b> {item.format[lang]}</p>
                    <span className="inline-block rounded-full bg-[#7B3FE4] px-3.5 py-1 text-xs font-medium text-white">{t("recreate")}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {busy === "think" && <Working text={t("think")} />}
      {error && <p role="alert" className="rounded-[14px] border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">{error}</p>}

      {answers.length > 0 && <div className="flex flex-wrap justify-center gap-2">{answers.map((a) => <span key={a.question} className="rounded-full bg-muted/50 px-3 py-1 text-xs text-muted-foreground">✓ {a.answer}</span>)}</div>}

      {q && (
        <Msg testid="chat-question">
          <p className="font-medium">{q.question}</p>
          <div role="radiogroup" aria-label={q.question} className="grid gap-2">
            {q.options.slice(0, 3).map((option, n) => (
              <button key={option.label} type="button" role="radio" aria-checked={picked === option.label} onClick={() => setPicked(option.label)}
                className={cn("flex items-start gap-3 rounded-[16px] border px-4 py-3 text-left transition", picked === option.label ? "border-[#A98BFF] bg-[#7B3FE4]/15" : "border-border bg-card hover:border-[#A98BFF]/60")}>
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border border-border text-[11px]" aria-hidden>{n + 1}</span>
                <span><span className="font-medium">{option.label}</span>{option.detail && <span className="block text-xs text-muted-foreground">{option.detail}</span>}</span>
              </button>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" className="rounded-full" onClick={() => void answer(true)}>{t("skip")}</Button>
            <Button type="button" className="rounded-full" disabled={!picked} onClick={() => void answer(false)}>{t("next")} <ArrowRight className="size-4" /></Button>
          </div>
        </Msg>
      )}
      {busy === "build" && <Working text={t("build")} />}

      {phase === "approve" && (
        <div className="space-y-3 rounded-[20px] border border-[#A98BFF]/40 bg-card p-4" data-testid="chat-approval">
          <p className="font-semibold">{t("approveT")}</p>
          <ul className="space-y-1 text-sm">
            {[persona.name, [persona.age, persona.look].filter(Boolean).join(", "), persona.setting].filter(Boolean).map((line) => (
              <li key={line} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-[#5BD69A]" /> {line}</li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">{t("approveCost")}</p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" className="rounded-full" onClick={reset}><X className="size-4" /> {t("stop")}</Button>
            <Button type="button" className="rounded-full" onClick={() => void approve()}>{t("approve")} <ArrowRight className="size-4" /></Button>
          </div>
        </div>
      )}

      {phase !== "home" && phase !== "ask" && phase !== "approve" && (
        <Msg testid="chat-photos">
          <p>{t("created")}</p>
          {busy === "pins" && <p className="flex items-center gap-2 text-muted-foreground"><Loader2 className="size-4 animate-spin" /> {t("searching")}</p>}
          {phase === "photos" && busy !== "pins" && pins.length === 0 && <p className="text-muted-foreground">{t("noPhotos")}</p>}
          {phase === "photos" && pins.length > 0 && (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {pins.slice(0, 12).map((item) => (
                <button key={item.id} type="button" aria-label={`${t("approve")} ${item.id}`} onClick={() => void writePrompt(null, item)} className="overflow-hidden rounded-[14px] border border-border hover:border-[#A98BFF]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.thumb} alt="" referrerPolicy="no-referrer" className="aspect-[3/4] w-full object-cover" />
                </button>
              ))}
            </div>
          )}
          {phase === "photos" && busy !== "pins" && (
            <div className="flex flex-wrap gap-2">
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label={t("upload")} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void writePrompt(file, null); }} />
              <Button type="button" variant="outline" className="rounded-full" onClick={() => fileRef.current?.click()}><ImagePlus className="size-4" /> {t("upload")}</Button>
              <Button type="button" variant="ghost" className="rounded-full" onClick={() => void writePrompt(null, null)}>{t("noPhoto")}</Button>
            </div>
          )}
          {phase !== "photos" && pin && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={pin.thumb} alt="" referrerPolicy="no-referrer" className="h-16 rounded-md" />
          )}
          {phase !== "photos" && photo && <p className="text-xs text-muted-foreground">✓ {photo.name}</p>}
        </Msg>
      )}

      {busy === "prompt" && <Working text={t("writing")} />}
      {["prompt", "count", "model", "cost", "board"].includes(phase) && prompts.length > 0 && (
        <Msg testid="chat-prompt">
          <p>{t("promptReady")}</p>
          {prompts.slice(0, 2).map((text, i) => (
            <div key={text} className="space-y-2 rounded-[16px] border border-border bg-card p-3">
              {summaries[i] && <p className="text-sm">{summaries[i]}</p>}
              <p className="whitespace-pre-line font-mono text-xs leading-relaxed text-muted-foreground">{text}</p>
              <button type="button" onClick={() => void copyOut(`p${i}`, text)} className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs hover:text-foreground">
                {sent === `p${i}` ? <Check className="size-3.5 text-[#5BD69A]" /> : <ClipboardCopy className="size-3.5" />} {sent === `p${i}` ? t("copied") : t("copy")}
              </button>
            </div>
          ))}
          {phase === "prompt" && <Button type="button" className="rounded-full" onClick={() => setPhase("count")}>{t("toVideos")} <ArrowRight className="size-4" /></Button>}
        </Msg>
      )}

      {["count", "model", "cost", "board"].includes(phase) && (
        <Msg testid="video-count">
          <p>{t("howMany")}</p>
          <div role="radiogroup" aria-label={t("howMany")} className="flex flex-wrap gap-2">
            {[1, 2, 3, 5].map((n) => <Chip key={n} role="radio" on={videoCount === n} onClick={() => { if (phase === "count") { setVideoCount(n); setPhase("model"); } }}>{n} {n === 1 ? t("video") : t("videos")}</Chip>)}
          </div>
        </Msg>
      )}
      {["model", "cost", "board"].includes(phase) && (
        <Msg testid="chat-model">
          <p>{t("whichModel")}</p>
          <div role="radiogroup" aria-label={t("whichModel")} className="flex flex-wrap gap-2">
            {FLOW_CHOICES.map((item) => (
              <Chip key={item.id} role="radio" on={model === item.id} onClick={() => { if (phase === "model") { setModel(item.id); saveFlowCategory(item.id); setPhase("cost"); } }}>
                {item.id === "lower" ? "Lower Priority" : item.name} · {item.credits === 0 ? t("zero") : `${item.credits} ${t("credits")}`}
              </Chip>
            ))}
          </div>
        </Msg>
      )}
      {(phase === "cost" || (phase === "board" && busy === "board")) && (
        <div className="space-y-3 rounded-[20px] border border-[#A98BFF]/40 bg-card p-4" data-testid="video-approval">
          <p className="font-semibold">{t("approveGen")}</p>
          <p className="text-sm">{videoCount} {videoCount === 1 ? t("video") : t("videos")} · {SCENES} {t("scenesWord")} · {chosen.id === "lower" ? "Lower Priority" : chosen.name}</p>
          <p className="text-sm text-muted-foreground">{t("spend")}: <b className="text-foreground">{totalCredits} {lang === "en" ? "credits" : "créditos"}</b></p>
          {phase === "cost" && (
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" className="rounded-full" onClick={() => setPhase("model")}><X className="size-4" /> {t("stop")}</Button>
              <Button type="button" className="rounded-full" onClick={() => void buildBoards()}>{t("approve")} <ArrowRight className="size-4" /></Button>
            </div>
          )}
        </div>
      )}
      {busy === "board" && <Working text={t("making")} />}

      {phase === "board" && board && (
        <Msg testid="storyboard">
          <p>{t("ready")}</p>
          {boards.length > 1 && (
            <div role="tablist" aria-label={t("video_n")} className="flex flex-wrap gap-2">
              {boards.map((_, v) => <button key={v} type="button" role="tab" aria-selected={active === v} onClick={() => setActive(v)} className={cn("rounded-full border px-3 py-1 text-xs", active === v ? "border-transparent bg-primary text-primary-foreground" : "border-border text-muted-foreground")}>{t("video_n")} {v + 1}</button>)}
            </div>
          )}
          <ol className="space-y-2">
            {board.scenes.map((scene, index) => (
              <li key={`${index}-${scene.line}`} className="rounded-[14px] border border-border bg-card p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{t("scene")} {index + 1}</p>
                <p>“{scene.line}”</p>
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => { void copyOut("pack", flowPackage()); window.open(FLOW_URL, "_blank", "noopener"); }}
              className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-[#8B5CF6] to-[#7B3FE4] px-4 py-2 text-sm font-medium text-white">
              {sent === "pack" ? <Check className="size-4" /> : <ClipboardCopy className="size-4" />} {t("pack")}
            </button>
            <button type="button" onClick={() => void copyOut("all", board.scenes.map((scene, index) => `${t("scene").toUpperCase()} ${index + 1}\n${scene.line}\n${board.imagePrompts[index] ?? ""}\n${board.videoPrompts[index] ?? ""}`).join("\n\n"))}
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-sm hover:text-foreground">
              {sent === "all" ? <Check className="size-4 text-[#5BD69A]" /> : <ClipboardCopy className="size-4" />} {t("onlyPrompts")}
            </button>
          </div>
          <div className="space-y-1" data-testid="next-steps">
            <p className="text-muted-foreground">{t("nextSteps")}</p>
            {([[t("more"), () => { setVideoCount(3); setBoards([]); setPhase("count"); }], [t("automation"), () => { window.location.href = "/automacao"; }]] as [string, () => void][]).map(([label, action]) => (
              <button key={label} type="button" onClick={action} className="block w-full rounded-[12px] px-2 py-2 text-left hover:bg-muted">↳ {label}</button>
            ))}
          </div>
        </Msg>
      )}

      <div ref={endRef} />

      <div className="sticky bottom-3 z-10">
        <div className="space-y-2 rounded-[26px] border border-border bg-card/95 p-3 shadow-lg backdrop-blur focus-within:border-[#A98BFF]/60" data-testid="chat-composer">
          <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={2} maxLength={600} disabled={started} aria-label={lang === "en" ? "Describe the influencer" : lang === "es" ? "Describe a la influencer" : "Descreva a influencer"}
            placeholder={phase === "home" ? (demo ? `${demo}▍` : t("ph")) : ""}
            className="w-full resize-none bg-transparent px-2 py-1 text-sm outline-none disabled:opacity-60" />
          <div className="flex items-center justify-between gap-2">
            <div role="group" aria-label={t("niche")} className="flex flex-wrap gap-1.5">
              {SKILLS.map((item) => (
                <button key={item.id} type="button" disabled={started} aria-pressed={skill === item.id} title={item.hint[lang]} onClick={() => setSkill(skill === item.id ? "" : item.id)}
                  className={cn("rounded-full border px-2.5 py-1 text-xs disabled:opacity-60", skill === item.id ? "border-transparent bg-primary text-primary-foreground" : "border-border text-muted-foreground")}>
                  {item.emoji} {item.name[lang]}
                </button>
              ))}
            </div>
            <button type="button" aria-label={t("send")} title={t("send")} onClick={() => void start()} disabled={started || prompt.trim().length < 8}
              className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#8B5CF6] to-[#7B3FE4] text-white disabled:opacity-40">
              {busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-5" />}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
