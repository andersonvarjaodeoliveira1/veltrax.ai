"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Check, Loader2, Sparkles, X } from "lucide-react";
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
  all: { pt: "Todos", en: "All", es: "Todos" },
} as const;
const INTRO = [
  { emoji: "✍️", pt: ["1. Você descreve", "Escreva em uma frase quem é a sua influencer."], en: ["1. You describe", "Write in one sentence who your influencer is."], es: ["1. Tú describes", "Escribe en una frase quién es tu influencer."] },
  { emoji: "💬", pt: ["2. Eu pergunto", "Respondo com 3 opções por vez. Você toca, ou pula."], en: ["2. I ask", "I give 3 options at a time. You tap, or skip."], es: ["2. Yo pregunto", "Te doy 3 opciones por vez. Tocas, o omites."] },
  { emoji: "🎬", pt: ["3. Você aprova e gera", "Escolhe a foto, aprova o gasto e gera os vídeos no seu Flow."], en: ["3. You approve and generate", "Pick the photo, approve the cost and generate videos in your Flow."], es: ["3. Apruebas y generas", "Eliges la foto, apruebas el gasto y generas los videos en tu Flow."] },
] as const;
const INTRO_KEY = "gv-influencer-intro";
const TXT_INTRO = {
  tap: { pt: "Toque para continuar", en: "Tap to continue", es: "Toca para continuar" },
  go: { pt: "Começar o chat", en: "Start the chat", es: "Empezar el chat" },
  welcome: { pt: "Bem-vindo! Missão rápida de 3 toques", en: "Welcome! Quick 3-tap mission", es: "¡Bienvenido! Misión rápida de 3 toques" },
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
  const [intro, setIntro] = useState(-1);
  useEffect(() => {
    try { setIntro(window.localStorage.getItem(INTRO_KEY) ? INTRO.length : 0); } catch { setIntro(INTRO.length); }
  }, []);
  const nextIntro = () => {
    const n = intro + 1;
    setIntro(n);
    if (n >= INTRO.length) { try { window.localStorage.setItem(INTRO_KEY, "1"); } catch { /* sem armazenamento */ } }
  };

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

  if (intro >= 0 && intro < INTRO.length) {
    const card = INTRO[intro];
    return (
      <section className="space-y-3" data-testid="influencer-intro">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#A98BFF]">{TXT_INTRO.welcome[lang]}</p>
        <div role="progressbar" aria-valuemin={0} aria-valuemax={INTRO.length} aria-valuenow={intro} className="h-2 overflow-hidden rounded-full bg-border">
          <div className="h-full rounded-full bg-gradient-to-r from-[#8B5CF6] to-[#A98BFF] transition-all" style={{ width: `${(intro / INTRO.length) * 100}%` }} />
        </div>
        <button type="button" onClick={nextIntro} className="gt-pop w-full space-y-2 rounded-[18px] border border-[#A98BFF]/40 bg-card p-6 text-center">
          <span className="block text-5xl" aria-hidden>{card.emoji}</span>
          <span className="block text-lg font-semibold">{card[lang][0]}</span>
          <span className="block text-sm text-muted-foreground">{card[lang][1]}</span>
          <span className="block text-xs font-semibold text-[#A98BFF]">{intro === INTRO.length - 1 ? TXT_INTRO.go[lang] : TXT_INTRO.tap[lang]} →</span>
        </button>
      </section>
    );
  }
  if (intro < 0) return null;

  return (
    <section className="space-y-5" data-testid="influencer-chat">
      {(working || q || brief) && (
        <div className="flex justify-end" data-testid="chat-user-bubble">
          <p className="max-w-[85%] rounded-[18px] rounded-br-sm bg-gradient-to-br from-[#8B5CF6] to-[#7B3FE4] px-4 py-2.5 text-sm text-white">{prompt}</p>
        </div>
      )}

      {working && (
        <div role="status" className="flex items-center gap-3 rounded-[14px] border border-[#A98BFF]/40 bg-[#7B3FE4]/10 px-4 py-3 text-sm">
          <Loader2 className="size-4 animate-spin text-[#A98BFF]" /> {working === "ask" ? tx("thinking", lang) : tx("building", lang)}
        </div>
      )}
      {error && <p role="alert" className="rounded-[14px] border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">{tx("error", lang)}</p>}

      {q && (
        <div className="space-y-3 rounded-[18px] rounded-bl-sm border border-border bg-card p-4" data-testid="chat-question">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#A98BFF]">{tx("question", lang)} {index + 1}/{questions.length}</p>
          <p className="font-medium">{q.question}</p>
          <div role="radiogroup" aria-label={q.question} className="grid gap-2">
            {q.options.slice(0, 3).map((option) => (
              <button key={option.label} type="button" role="radio" aria-checked={picked === option.label} onClick={() => setPicked(option.label)}
                className={cn("rounded-[14px] border px-4 py-3 text-left text-sm", picked === option.label ? "border-[#A98BFF] bg-[#7B3FE4]/15" : "border-border")}>
                <span className="font-medium">{option.label}</span>
                {option.detail && <span className="block text-xs text-muted-foreground">{option.detail}</span>}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="rounded-full" onClick={() => void advance(true)}>{tx("skip", lang)}</Button>
            <Button type="button" className="rounded-full" disabled={!picked} onClick={() => void advance(false)}>{tx("next", lang)} <ArrowRight className="size-4" /></Button>
          </div>
        </div>
      )}

      {brief && (
        <div className="space-y-3 rounded-[18px] rounded-bl-sm border border-[#5BD69A]/40 bg-[#5BD69A]/5 p-4" data-testid="chat-approval">
          <p className="font-semibold">{tx("approveTitle", lang)}</p>
          <p className="text-sm text-muted-foreground">{tx("approveIntro", lang)}</p>
          <ul className="space-y-1 text-sm">
            {[brief.persona.name, [brief.persona.age, brief.persona.look].filter(Boolean).join(", "), brief.persona.setting].filter(Boolean).map((line) => (
              <li key={line} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-[#5BD69A]" /> {line}</li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">{tx("cost", lang)}</p>
          <p className="text-xs text-muted-foreground">{tx("next_steps", lang)}</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" className="rounded-full" onClick={() => onReady(brief)}>{tx("approve", lang)} <ArrowRight className="size-4" /></Button>
            <Button type="button" variant="outline" className="rounded-full" onClick={() => setBrief(null)}><X className="size-4" /> {tx("adjust", lang)}</Button>
          </div>
        </div>
      )}

      {!started && <div className="space-y-3" data-testid="influencer-examples">
        <div>
          <p className="font-semibold">{tx("examples", lang)}</p>
          <p className="text-xs text-muted-foreground">{tx("examplesHint", lang)}</p>
        </div>
        <div role="group" aria-label={tx("examples", lang)} className="flex flex-wrap gap-2">
          {([["all", tx("all", lang)], ...SKILLS.map((s) => [s.id, `${s.emoji} ${s.name[lang]}`])] as [SkillId | "all", string][]).map(([id, label]) => (
            <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)}
              className={cn("rounded-full border px-3 py-1 text-xs", filter === id ? "border-transparent bg-primary text-primary-foreground" : "border-border text-muted-foreground")}>{label}</button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {shown.map((item) => (
            <button key={item.id} type="button" onClick={() => { setPrompt(item.prompt[lang]); setSkill(item.skill); setBrief(null); setQuestions([]); }}
              className="overflow-hidden rounded-[18px] border border-border bg-card text-left transition hover:border-[#A98BFF]">
              <div className="flex h-24 items-center justify-center text-4xl" style={{ background: `linear-gradient(135deg, ${item.from}, ${item.to})` }} aria-hidden>{item.emoji}</div>
              <div className="space-y-1 p-3">
                <p className="text-sm font-medium">{item.title[lang]}</p>
                <p className="text-xs text-muted-foreground"><b>{tx("format", lang)}:</b> {item.format[lang]}</p>
                <span className="inline-block rounded-full bg-[#7B3FE4] px-3 py-1 text-xs font-medium text-white">{tx("recreate", lang)}</span>
              </div>
            </button>
          ))}
        </div>
      </div>}
      <div className="sticky bottom-3 z-10 space-y-2 rounded-[22px] border border-[#A98BFF]/30 bg-card/95 p-3 shadow-lg backdrop-blur" data-testid="chat-composer">
        <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={2} maxLength={600} aria-label={tx("label", lang)} placeholder={tx("placeholder", lang)}
          className="w-full resize-none rounded-[14px] border border-border bg-background px-3 py-2 text-sm" />
        <div className="flex items-center justify-between gap-2">
          <div role="group" aria-label={tx("skills", lang)} className="flex flex-wrap gap-1.5">
            {SKILLS.map((item) => (
              <button key={item.id} type="button" aria-pressed={skill === item.id} title={item.hint[lang]} onClick={() => setSkill(skill === item.id ? "" : item.id)}
                className={cn("rounded-full border px-2.5 py-1 text-xs", skill === item.id ? "border-transparent bg-primary text-primary-foreground" : "border-border text-muted-foreground")}>
                {item.emoji} {item.name[lang]}
              </button>
            ))}
          </div>
          <Button type="button" className="shrink-0 rounded-full" onClick={() => void start()} disabled={busy || working !== "" || prompt.trim().length < 8 || Boolean(q) || Boolean(brief)}>
            {working ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} {tx("start", lang)}
          </Button>
        </div>
      </div>
    </section>
  );
}
