"use client";

import { useEffect, useState } from "react";
import { ArrowRight, ArrowUp, Check, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { EXAMPLES, SKILLS, type Lang3, type SkillId } from "@/lib/influencer-examples";
import { cn } from "@/lib/utils";

export type Brief = {
  persona: { name: string; age: string; look: string; setting: string };
  searches: string[];
  copy: string;
};
type Option = { label: string; detail?: string };
type Question = { question: string; options: Option[] };

// Todo o texto desta tela segue o idioma escolhido pelo membro (PT/EN/ES).
const TXT = {
  title: { pt: "Descreva a sua influencer em uma frase", en: "Describe your influencer in one sentence", es: "Describe a tu influencer en una frase" },
  label: { pt: "Descreva a influencer", en: "Describe the influencer", es: "Describe a la influencer" },
  placeholder: { pt: "Ex.: Gere uma influencer de 22 anos, loira, vendendo roupas", en: "E.g.: Create a 22-year-old blonde influencer selling clothes", es: "Ej.: Crea una influencer de 22 años, rubia, vendiendo ropa" },
  skills: { pt: "Nicho (opcional)", en: "Niche (optional)", es: "Nicho (opcional)" },
  start: { pt: "Criar a influencer", en: "Create the influencer", es: "Crear a la influencer" },
  thinking: { pt: "Entendendo o seu pedido…", en: "Understanding your request…", es: "Entendiendo tu pedido…" },
  building: { pt: "Montando a pessoa, as buscas e a fala…", en: "Building the person, searches and script…", es: "Armando la persona, las búsquedas y el guion…" },
  question: { pt: "Pergunta", en: "Question", es: "Pregunta" },
  skip: { pt: "Pular", en: "Skip", es: "Omitir" },
  next: { pt: "Continuar", en: "Continue", es: "Continuar" },
  approveTitle: { pt: "Aprovar a criação", en: "Approve creation", es: "Aprobar la creación" },
  approveIntro: { pt: "Vou criar esta influencer. Confira antes de seguir:", en: "I will create this influencer. Check before going on:", es: "Voy a crear a esta influencer. Revisa antes de seguir:" },
  cost: { pt: "Custo: algumas chamadas de IA da plataforma (tokens) para ler o pedido e buscar fotos. A geração do vídeo usa os créditos do seu próprio Flow, e você vê o gasto antes de gerar.", en: "Cost: a few platform AI calls (tokens) to read the request and find photos. Video generation uses your own Flow credits, and you see the spend before generating.", es: "Costo: algunas llamadas de IA de la plataforma (tokens) para leer el pedido y buscar fotos. La generación del video usa los créditos de tu propio Flow, y ves el gasto antes de generar." },
  approve: { pt: "Aprovar e continuar", en: "Approve and continue", es: "Aprobar y continuar" },
  adjust: { pt: "Ajustar o pedido", en: "Edit request", es: "Ajustar el pedido" },
  next_steps: { pt: "Depois: escolher a foto, gerar o prompt e fazer os vídeos.", en: "Next: pick the photo, generate the prompt and make the videos.", es: "Luego: elegir la foto, generar el prompt y hacer los videos." },
  error: { pt: "Não consegui entender o pedido. Tente de novo com um pouco mais de detalhe.", en: "I couldn't understand the request. Try again with a bit more detail.", es: "No pude entender el pedido. Inténtalo de nuevo con un poco más de detalle." },
  examples: { pt: "Exemplos de influencers", en: "Example influencers", es: "Ejemplos de influencers" },
  examplesHint: { pt: "Toque em um exemplo para usar como ponto de partida. São modelos de descrição e de formato, não fotos reais.", en: "Tap an example to use it as a starting point. These are description and format models, not real photos.", es: "Toca un ejemplo para usarlo como punto de partida. Son modelos de descripción y formato, no fotos reales." },
  recreate: { pt: "Recriar", en: "Recreate", es: "Recrear" },
  format: { pt: "Formato", en: "Format", es: "Formato" },
  home: { pt: "O que vamos criar hoje?", en: "What are we creating today?", es: "¿Qué vamos a crear hoy?" },
  all: { pt: "Todos", en: "All", es: "Todos" },
} as const;
const tx = (key: keyof typeof TXT, lang: Lang3) => TXT[key][lang];

export function InfluencerChat({ onReady, busy }: { onReady: (brief: Brief) => void; busy: boolean }) {
  const { lang: rawLang } = useI18n();
  const lang: Lang3 = rawLang === "en" || rawLang === "es" ? rawLang : "pt";
  const [prompt, setPrompt] = useState("");
  const [skill, setSkill] = useState<SkillId | "">("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [answers, setAnswers] = useState<{ question: string; answer: string }[]>([]);
  const [brief, setBrief] = useState<Brief | null>(null);
  const [working, setWorking] = useState<"" | "ask" | "build">("");
  const [error, setError] = useState(false);
  const [filter, setFilter] = useState<SkillId | "all">("all");
  // Prompt de demonstração: digita e apaga exemplos, um após o outro.
  const [demo, setDemo] = useState("");
  useEffect(() => {
    if (prompt || typeof window === "undefined" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const texts = EXAMPLES.map((item) => item.prompt[lang]);
    let t = 0; let n = 0; let erasing = false;
    let timer = 0;
    const tick = () => {
      const full = texts[t % texts.length];
      if (!erasing) { n += 1; setDemo(full.slice(0, n)); if (n >= full.length) { erasing = true; timer = window.setTimeout(tick, 1600); return; } }
      else { n -= 2; setDemo(full.slice(0, Math.max(n, 0))); if (n <= 0) { erasing = false; n = 0; t += 1; timer = window.setTimeout(tick, 400); return; } }
      timer = window.setTimeout(tick, erasing ? 18 : 38);
    };
    timer = window.setTimeout(tick, 600);
    return () => window.clearTimeout(timer);
  }, [prompt, lang]);
  async function call(withAnswers: { question: string; answer: string }[]) {
    const response = await fetch("/api/multiplier/clone/influencer-brief", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, skill: skill || undefined, language: lang, answers: withAnswers.length ? withAnswers : undefined }),
    });
    if (!response.ok) throw new Error("brief");
    return response.json();
  }

  function finish(data: { persona?: Brief["persona"]; searches?: string[]; copy?: string }) {
    const persona = data.persona ?? { name: "", age: "", look: "", setting: "" };
    setBrief({ persona, searches: Array.isArray(data.searches) ? data.searches : [], copy: data.copy ?? "" });
    setWorking("");
  }

  async function start() {
    setError(false); setBrief(null); setAnswers([]); setIndex(0); setPicked(null); setQuestions([]);
    setWorking("ask");
    try {
      const data = await call([]);
      const list: Question[] = Array.isArray(data.questions) ? data.questions.filter((q: Question) => q?.options?.length >= 2).slice(0, 3) : [];
      if (list.length) { setQuestions(list); setWorking(""); } else finish(data);
    } catch { setError(true); setWorking(""); }
  }

  async function advance(skipped: boolean) {
    const current = questions[index];
    const next = skipped || !picked ? answers : [...answers, { question: current.question, answer: picked }];
    setAnswers(next);
    setPicked(null);
    if (index + 1 < questions.length) { setIndex(index + 1); return; }
    setQuestions([]);
    setWorking("build");
    try { finish(await call(next)); } catch { setError(true); setWorking(""); }
  }

  const q = questions[index];
  const started = working !== "" || Boolean(q) || Boolean(brief);
  const shown = EXAMPLES.filter((item) => filter === "all" || item.skill === filter);

  const Avatar = () => <span aria-hidden className="mt-1 size-6 shrink-0 rounded-full bg-gradient-to-br from-[#8B5CF6] to-[#A98BFF]" />;
  return (
    <section className="mx-auto w-full max-w-3xl space-y-6" data-testid="influencer-chat">
      {!started && <h2 className="pt-4 text-center text-3xl font-semibold tracking-tight">{tx("home", lang)}</h2>}

      {started && (
        <div className="flex justify-center" data-testid="chat-user-bubble">
          <p className="max-w-[85%] rounded-full border border-border bg-card px-5 py-2 text-center text-xs font-semibold uppercase tracking-wide">{prompt}</p>
        </div>
      )}

      {working && (
        <div role="status" className="flex items-center gap-3 text-sm text-muted-foreground">
          <Avatar /> <Loader2 className="size-4 animate-spin text-[#A98BFF]" /> {working === "ask" ? tx("thinking", lang) : tx("building", lang)}
        </div>
      )}
      {error && <p role="alert" className="rounded-[14px] border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">{tx("error", lang)}</p>}

      {q && (
        <div className="flex gap-3" data-testid="chat-question">
          <Avatar />
          <div className="min-w-0 flex-1 space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#A98BFF]">{tx("question", lang)} {index + 1}/{questions.length}</p>
            <p className="font-medium">{q.question}</p>
            <div role="radiogroup" aria-label={q.question} className="grid gap-2">
              {q.options.slice(0, 3).map((option, n) => (
                <button key={option.label} type="button" role="radio" aria-checked={picked === option.label} onClick={() => setPicked(option.label)}
                  className={cn("flex items-start gap-3 rounded-[16px] border px-4 py-3 text-left text-sm transition", picked === option.label ? "border-[#A98BFF] bg-[#7B3FE4]/15" : "border-border bg-card hover:border-[#A98BFF]/60")}>
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border border-border text-[11px]" aria-hidden>{n + 1}</span>
                  <span><span className="font-medium">{option.label}</span>{option.detail && <span className="block text-xs text-muted-foreground">{option.detail}</span>}</span>
                </button>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" className="rounded-full" onClick={() => void advance(true)}>{tx("skip", lang)}</Button>
              <Button type="button" className="rounded-full" disabled={!picked} onClick={() => void advance(false)}>{tx("next", lang)} <ArrowRight className="size-4" /></Button>
            </div>
          </div>
        </div>
      )}

      {!started && (
        <div className="space-y-4" data-testid="influencer-examples">
          <div role="group" aria-label={tx("examples", lang)} className="flex flex-wrap justify-center gap-2">
            {([["all", tx("all", lang)], ...SKILLS.map((s) => [s.id, `${s.emoji} ${s.name[lang]}`])] as [SkillId | "all", string][]).map(([id, label]) => (
              <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)}
                className={cn("rounded-full border px-3.5 py-1.5 text-xs", filter === id ? "border-transparent bg-primary text-primary-foreground" : "border-border text-muted-foreground")}>{label}</button>
            ))}
          </div>
          <p className="text-center text-xs text-muted-foreground">{tx("examplesHint", lang)}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {shown.map((item) => (
              <button key={item.id} type="button" onClick={() => { setPrompt(item.prompt[lang]); setSkill(item.skill); setBrief(null); setQuestions([]); }}
                className="group overflow-hidden rounded-[18px] border border-border bg-card text-left transition hover:border-[#A98BFF]">
                <div className="relative flex h-28 items-center justify-center text-5xl" style={{ background: `linear-gradient(135deg, ${item.from}, ${item.to})` }} aria-hidden>
                  {item.emoji}
                  <span className="absolute left-3 top-3 rounded-full bg-black/40 px-2 py-0.5 text-[10px] font-medium text-white">{SKILLS.find((s) => s.id === item.skill)?.name[lang]}</span>
                </div>
                <div className="space-y-2 p-3.5">
                  <p className="text-sm font-medium leading-snug">{item.title[lang]}</p>
                  <p className="text-xs text-muted-foreground"><b>{tx("format", lang)}:</b> {item.format[lang]}</p>
                  <span className="inline-block rounded-full bg-[#7B3FE4] px-3.5 py-1 text-xs font-medium text-white">{tx("recreate", lang)}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="sticky bottom-3 z-10 space-y-2">
        {brief && (
          <div className="space-y-3 rounded-[20px] border border-[#A98BFF]/40 bg-card/95 p-4 shadow-lg backdrop-blur" data-testid="chat-approval">
            <p className="font-semibold">{tx("approveTitle", lang)}</p>
            <p className="text-sm text-muted-foreground">{tx("approveIntro", lang)}</p>
            <ul className="space-y-1 text-sm">
              {[brief.persona.name, [brief.persona.age, brief.persona.look].filter(Boolean).join(", "), brief.persona.setting].filter(Boolean).map((line) => (
                <li key={line} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-[#5BD69A]" /> {line}</li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">{tx("cost", lang)}</p>
            <p className="text-xs text-muted-foreground">{tx("next_steps", lang)}</p>
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" className="rounded-full" onClick={() => setBrief(null)}><X className="size-4" /> {tx("adjust", lang)}</Button>
              <Button type="button" className="rounded-full" onClick={() => onReady(brief)}>{tx("approve", lang)} <ArrowRight className="size-4" /></Button>
            </div>
          </div>
        )}
        <div className="space-y-2 rounded-[26px] border border-border bg-card/95 p-3 shadow-lg backdrop-blur focus-within:border-[#A98BFF]/60" data-testid="chat-composer">
          <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={2} maxLength={600} aria-label={tx("label", lang)} placeholder={demo ? `${demo}▍` : tx("placeholder", lang)}
            className="w-full resize-none bg-transparent px-2 py-1 text-sm outline-none" />
          <div className="flex items-center justify-between gap-2">
            <div role="group" aria-label={tx("skills", lang)} className="flex flex-wrap gap-1.5">
              {SKILLS.map((item) => (
                <button key={item.id} type="button" aria-pressed={skill === item.id} title={item.hint[lang]} onClick={() => setSkill(skill === item.id ? "" : item.id)}
                  className={cn("rounded-full border px-2.5 py-1 text-xs", skill === item.id ? "border-transparent bg-primary text-primary-foreground" : "border-border text-muted-foreground")}>
                  {item.emoji} {item.name[lang]}
                </button>
              ))}
            </div>
            <button type="button" aria-label={tx("start", lang)} title={tx("start", lang)} onClick={() => void start()} disabled={busy || working !== "" || prompt.trim().length < 8 || Boolean(q) || Boolean(brief)}
              className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#8B5CF6] to-[#7B3FE4] text-white disabled:opacity-40">
              {working ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-5" />}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
