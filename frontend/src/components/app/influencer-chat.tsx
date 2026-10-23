"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, ArrowUp, Check, ClipboardCopy, ImagePlus, Loader2, Plus, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/auth-client";
import { FLOW_CHOICES, defaultFlowCategory, saveFlowCategory } from "@/lib/flow-models";
import { LanguageSwitcher, useI18n } from "@/lib/i18n";
import { EXAMPLES, SKILLS, type Lang3, type SkillId } from "@/lib/influencer-examples";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { loadMySkills, saveMySkills } from "@/lib/influencer-skills";
import { dataUrlToFile, fileToDataUrl, loadModels, saveModels, type MyModel } from "@/lib/influencer-models";

type Option = { label: string; detail?: string };
type Question = { question: string; options: Option[] };
type Persona = { name: string; age: string; look: string; setting: string };
type Pin = { id: string; thumb: string; full: string };
type Board = { scenes: { line: string; what: string }[]; imagePrompts: string[]; videoPrompts: string[] };
type Snap = Record<string, unknown>;
type ChatItem = { id: number; title: string; project?: string; snap?: Snap };
type Phase = "home" | "intake" | "ask" | "approve" | "photos" | "prompt" | "count" | "model" | "cost" | "board";

const FLOW_URL = "https://labs.google/fx/pt/tools/flow";
const SCENES = 4;
const ANGLES = ["curiosity", "problem", "proof", "question"];
const BODIES = ["story", "demo", "list", "proof"];
const CTAS: Record<Lang3, string[]> = {
  pt: ["Comente QUERO para receber o link.", "Toque no link da bio e veja agora.", "Comente INFO e eu te mando os detalhes.", "Salve este vídeo e comente QUERO."],
  en: ["Comment WANT and I will send you the link.", "Tap the link in my bio and see it now.", "Comment INFO and I will send you the details.", "Save this video and comment WANT."],
  es: ["Comenta QUIERO y te envío el enlace.", "Toca el enlace de mi bio y velo ahora.", "Comenta INFO y te mando los detalles.", "Guarda este video y comenta QUIERO."],
};
const LANG_NAMES: Record<string, string> = { "pt-BR": "Português", en: "English", es: "Español" };
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
  other: ["Outro", "Other", "Otro"],
  otherHint: ["Escreva o que você quer", "Write what you want", "Escribe lo que quieres"],
  styleAsk: ["Como você quer os vídeos?", "How do you want the videos?", "¿Cómo quieres los videos?"],
  styCaptions: ["Legenda no vídeo", "Subtitles", "Subtítulos"],
  styVoice: ["Idioma da voz", "Voice language", "Idioma de la voz"],
  styCamera: ["Tipo de câmera", "Camera", "Cámara"],
  styProduct: ["Mostrar o produto", "Show the product", "Mostrar el producto"],
  styYes: ["Com", "With", "Con"],
  styNo: ["Sem", "Without", "Sin"],
  styAuto: ["Automático", "Auto", "Automático"],
  camSelfie: ["Selfie de celular", "Phone selfie", "Selfie de celular"],
  camTripod: ["Tripé, de frente", "Tripod, front", "Trípode, de frente"],
  camPov: ["POV (mãos)", "POV (hands)", "POV (manos)"],
  camCinema: ["Cinematográfica", "Cinematic", "Cinematográfica"],
  styTone: ["Tipo de voz", "Voice type", "Tipo de voz"],
  styCustom: ["Outra voz: descreva (opcional)", "Other voice: describe (optional)", "Otra voz: describe (opcional)"],
  toneCalm: ["Calma", "Calm", "Calmada"],
  toneLively: ["Animada", "Lively", "Animada"],
  toneDeep: ["Grave", "Deep", "Grave"],
  toneSoft: ["Suave", "Soft", "Suave"],
  toneYoung: ["Jovem", "Young", "Joven"],
  toneMature: ["Madura", "Mature", "Madura"],
  creditsWord: ["créditos", "credits", "créditos"],
  quota: ["A IA está no limite de uso agora. Espere alguns minutos e tente de novo.", "The AI is at its usage limit right now. Wait a few minutes and try again.", "La IA está en su límite de uso ahora. Espera unos minutos e inténtalo de nuevo."],
  hint1: ["Isso pode levar até 1 minuto", "This can take up to 1 minute", "Esto puede tardar hasta 1 minuto"],
  hint2: ["Pode deixar esta aba aberta, eu aviso quando terminar", "Keep this tab open, I will tell you when it is done", "Deja esta pestaña abierta, te aviso al terminar"],
  hint3: ["Quase lá…", "Almost there…", "Casi listo…"],
  estimate: ["Estimativa de gasto", "Estimated cost", "Gasto estimado"],
  estFree: ["Sem custo no Lower Priority. Se a sua conta não tiver, usa o Lite (~40 créditos por vídeo).", "Free with Lower Priority. If your account has none, it uses Lite (~40 credits per video).", "Sin costo con Lower Priority. Si tu cuenta no lo tiene, usa Lite (~40 créditos por video)."],
  seeMore: ["Ver mais", "See more", "Ver más"],
  navLib: ["Biblioteca", "Library", "Biblioteca"],
  navFolders: ["Pastas", "Folders", "Carpetas"],
  navAuto: ["Automação", "Automation", "Automatización"],
  navFlow: ["Conectar Flow", "Connect Flow", "Conectar Flow"],
  navApis: ["Minhas APIs", "My APIs", "Mis APIs"],
  navApp: ["Voltar ao ClipGringa", "Back to ClipGringa", "Volver a ClipGringa"],
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
  modelAuto: ["Se sua conta não tiver o Lower Priority (sem custo), uso automaticamente a versão mais barata que ela tiver.", "If your account has no Lower Priority (free), I automatically use the cheapest version it has.", "Si tu cuenta no tiene Lower Priority (gratis), uso automáticamente la versión más barata que tenga."],
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
  chats: ["Chats", "Chats", "Chats"],
  noChats: ["Seus chats aparecem aqui", "Your chats show up here", "Tus chats aparecen aquí"],
  worked: ["Trabalhou por", "Worked for", "Trabajó durante"],
  askFirst: ["Perguntar antes de gerar", "Ask before generating", "Preguntar antes de generar"],
  whichNiche: ["Qual é o nicho?", "Which niche?", "¿Cuál es el nicho?"],
  otherNiche: ["Outro", "Other", "Otro"],
  hasProduct: ["Você tem foto do produto ou o link dele?", "Do you have a product photo or its link?", "¿Tienes foto del producto o su enlace?"],
  attachPhoto: ["Anexar foto do produto", "Attach product photo", "Adjuntar foto del producto"],
  pasteLink: ["Colar o link", "Paste the link", "Pegar el enlace"],
  noProduct: ["Não tenho", "I don't have one", "No tengo"],
  linkPh: ["https://…", "https://…", "https://…"],
  addLink: ["Adicionar", "Add", "Añadir"],
  reading: ["Lendo o produto…", "Reading the product…", "Leyendo el producto…"],
  productOk: ["Produto anexado e adicionado ao prompt.", "Product attached and added to the prompt.", "Producto adjuntado y añadido al prompt."],
  vary: ["Quer variar? (opcional)", "Want variations? (optional)", "¿Quieres variar? (opcional)"],
  vHook: ["Gancho", "Hook", "Gancho"],
  vBody: ["Corpo", "Body", "Cuerpo"],
  vCta: ["CTA", "CTA", "CTA"],
  go: ["Continuar", "Continue", "Continuar"],
  createProject: ["Criar projeto", "Create project", "Crear proyecto"],
  follow: ["Para pedir outra influencer, toque em Novo chat", "To request another influencer, tap New chat", "Para pedir otra influencer, toca en Nuevo chat"],
  skillsLink: ["Skills", "Skills", "Skills"],
  projects: ["Projetos", "Projects", "Proyectos"],
  noProject: ["Sem projeto", "No project", "Sin proyecto"],
  newProject: ["Novo projeto", "New project", "Nuevo proyecto"],
  allProjects: ["Todos", "All", "Todos"],
  saveSkill: ["Salvar como skill", "Save as skill", "Guardar como skill"],
  saved: ["Skill salva", "Skill saved", "Skill guardada"],
  remove: ["Apagar chat", "Delete chat", "Borrar chat"],
  modelLabel: ["Modelo do Flow", "Flow model", "Modelo de Flow"],
  myModel: ["Meu modelo", "My model", "Mi modelo"],
  noModel: ["Nenhum, criar do zero", "None, create from scratch", "Ninguno, crear desde cero"],
  newModel: ["Novo modelo", "New model", "Nuevo modelo"],
  modelName: ["Nome do modelo", "Model name", "Nombre del modelo"],
  modelLook: ["Como ela é (idade, cabelo, estilo)", "What she looks like (age, hair, style)", "Cómo es (edad, pelo, estilo)"],
  modelFace: ["Anexar rosto (1 a 3 fotos)", "Attach face (1 to 3 photos)", "Adjuntar rostro (1 a 3 fotos)"],
  modelVoice: ["Voz (ex.: feminina, calma, 30 anos, sotaque paulista)", "Voice (e.g. female, calm, 30s, neutral accent)", "Voz (ej.: femenina, calma, 30 años, acento neutro)"],
  saveModel: ["Salvar modelo", "Save model", "Guardar modelo"],
  modelNote: ["O rosto vira a foto de referência e a voz entra em todas as cenas. O Flow não clona a voz de um áudio: a voz é descrita no prompt.", "The face becomes the reference photo and the voice goes into every scene. Flow does not clone a voice from audio: the voice is described in the prompt.", "El rostro es la foto de referencia y la voz entra en todas las escenas. Flow no clona la voz desde un audio: la voz se describe en el prompt."],
  usingModel: ["Trabalhando em cima do modelo", "Working on model", "Trabajando sobre el modelo"],
  downloadFace: ["Baixar o rosto para anexar no Flow (Ingredientes)", "Download the face to attach in Flow (Ingredients)", "Descargar el rostro para adjuntar en Flow (Ingredientes)"],
  deleteModel: ["Apagar modelo", "Delete model", "Borrar modelo"],
  preview: ["Pré-visualização", "Preview", "Vista previa"],
} as const;

const Msg = ({ children, testid }: { children: React.ReactNode; testid?: string }) => (
  <div className="min-w-0 space-y-3 text-[15px] leading-relaxed" data-testid={testid}>{children}</div>
);
const Chip = ({ on, onClick, children, role }: { on?: boolean; onClick: () => void; children: React.ReactNode; role?: string }) => (
  <button type="button" role={role} aria-checked={role ? Boolean(on) : undefined} aria-pressed={role ? undefined : on} onClick={onClick}
    className={cn("rounded-full border px-4 py-1.5 text-sm", on ? "border-transparent bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:text-foreground")}>{children}</button>
);
function Working({ text, hints }: { text: string; hints?: string[] }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => { const timer = window.setInterval(() => setSeconds((n) => n + 1), 1000); return () => window.clearInterval(timer); }, []);
  const hint = hints && hints.length ? hints[Math.floor(seconds / 5) % hints.length] : "";
  return (
    <div role="status" className="space-y-2 rounded-[16px] border border-white/10 bg-white/[0.03] px-4 py-3 text-sm">
      <div className="flex items-center gap-2 text-foreground"><Loader2 className="size-4 animate-spin text-[#A98BFF]" /> <span>{text}</span><span className="ml-auto text-xs tabular-nums text-muted-foreground">{seconds}s</span></div>
      <div className="h-1 overflow-hidden rounded-full bg-white/10"><span className="block h-full w-1/3 animate-[progress-sheen_1.6s_ease-in-out_infinite] rounded-full bg-gradient-to-r from-[#8B5CF6] to-[#A98BFF]" /></div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

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
  const [isOther, setIsOther] = useState(false);
  const [otherText, setOtherText] = useState("");
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
  const [style, setStyle] = useState<{ captions: boolean; voice: string; tone: string; custom: string; camera: string; product: boolean | null }>({ captions: false, voice: "", tone: "", custom: "", camera: "selfie", product: null });
  const [vary, setVary] = useState<{ hook: boolean; body: boolean; cta: boolean }>({ hook: true, body: false, cta: false });
  const [model, setModel] = useState<string>(FLOW_CHOICES[1].id);
  const [boards, setBoards] = useState<Board[]>([]);
  const [productLook, setProductLook] = useState("");
  const [productLink, setProductLink] = useState("");
  const [linkOpen, setLinkOpen] = useState(false);
  const productRef = useRef<HTMLInputElement>(null);
  const lookRef = useRef("");
  const attachRef = useRef<HTMLInputElement>(null);
  const [attached, setAttached] = useState<File[]>([]);
  const linkRef = useRef("");
  const [active, setActive] = useState(0);
  const [sent, setSent] = useState("");
  const [demo, setDemo] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const t0 = useRef(0);
  const [worked, setWorked] = useState<Record<string, number>>({});
  const [chats, setChats] = useState<ChatItem[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [project, setProject] = useState("");
  const [filter2, setFilter2] = useState("");
  const [newProject, setNewProject] = useState("");
  const [modelChosen, setModelChosen] = useState(false);
  const [models, setModels] = useState<MyModel[]>([]);
  const [selModelId, setSelModelId] = useState("");
  const [modelForm, setModelForm] = useState(false);
  const [mName, setMName] = useState("");
  const [mLook, setMLook] = useState("");
  const [mVoice, setMVoice] = useState("");
  const [mFaces, setMFaces] = useState<string[]>([]);
  const faceRef = useRef<HTMLInputElement>(null);
  const selModel = models.find((m) => m.id === selModelId) ?? null;
  const [skillSaved, setSkillSaved] = useState(false);
  const chatId = useRef<number | null>(null);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    try { const saved = JSON.parse(window.localStorage.getItem("gv-influencer-chats") ?? "[]"); if (Array.isArray(saved)) setChats(saved.slice(0, 30)); } catch { /* sem armazenamento */ }
    try { const saved = JSON.parse(window.localStorage.getItem("gv-influencer-projects") ?? "[]"); if (Array.isArray(saved)) setProjects(saved); } catch { /* sem armazenamento */ }
    try {
      const params = new URLSearchParams(window.location.search);
      const incoming = params.get("prompt");
      if (incoming) { setPrompt(incoming.slice(0, 600)); const sk = params.get("skill"); if (sk && SKILLS.some((item) => item.id === sk)) setSkill(sk as SkillId); }
    } catch { /* sem URL */ }
    setModels(loadModels());
    setHydrated(true);
  }, []);
  const persistChats = (list: ChatItem[]) => { setChats(list); try { window.localStorage.setItem("gv-influencer-chats", JSON.stringify(list)); } catch { /* sem armazenamento */ } };
  const persistProjects = (list: { id: string; name: string }[]) => { setProjects(list); try { window.localStorage.setItem("gv-influencer-projects", JSON.stringify(list)); } catch { /* sem armazenamento */ } };
  const mark = (key: string) => setWorked((current) => (current[key] ? current : { ...current, [key]: Math.max(1, Math.round((Date.now() - t0.current) / 1000)) }));

  useEffect(() => { setModel(defaultFlowCategory(isAdmin)); }, [isAdmin]);
  useEffect(() => { if (phase !== "home") endRef.current?.scrollIntoView?.({ behavior: "smooth", block: "end" }); }, [phase, qi, pins.length, prompts.length, boards.length]);

  // Prompt de demonstração: digita e apaga exemplos, um após o outro.
  useEffect(() => {
    if (prompt || phase !== "home" || typeof window === "undefined") return;
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
    try { const data = await response.json(); setError(data?.detail === "TOKENS_EXHAUSTED" ? t("tokens") : data?.detail === "AI_QUOTA" ? t("quota") : t("error")); } catch { setError(t("error")); }
  }

  function reset() {
    chatId.current = null; setSkillSaved(false);
    setPhase("home"); setPrompt(""); setSkill(""); setBusy(""); setError(""); setQuestions([]); setQi(0); setPicked(null); setAnswers([]);
    setPersona({ name: "", age: "", look: "", setting: "" }); setSearches([]); setCopyText(""); setPins([]); setPin(null); setPhoto(null);
    setPrompts([]); setSummaries([]); setVideoCount(1); setBoards([]); setActive(0); setProductLook(""); setProductLink(""); setLinkOpen(false); setAttached([]);
  }

  const fullPrompt = () => [prompt, selModel && `Persona fixa (já existe, não mude): ${selModel.persona.name}, ${selModel.persona.age}, ${selModel.persona.look}, ${selModel.persona.setting}`, lookRef.current && `Produto: ${lookRef.current}`, linkRef.current && `Link do produto: ${linkRef.current}`].filter(Boolean).join("\n");

  async function brief(withAnswers: { question: string; answer: string }[]) {
    const response = await fetch("/api/multiplier/clone/influencer-brief", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: fullPrompt(), skill: skill && (skill as string) !== "other" ? skill : undefined, language: lang, answers: withAnswers.length ? withAnswers : undefined }),
    });
    if (!response.ok) { await fail(response); return null; }
    return response.json();
  }

  function takeBrief(data: { persona?: Persona; searches?: string[]; copy?: string }) {
    setPersona(selModel ? selModel.persona : data.persona ?? { name: "", age: "", look: "", setting: "" });
    setSearches(Array.isArray(data.searches) ? data.searches : []);
    setCopyText(data.copy || prompt);
    setPhase("approve");
  }

  function start() {
    setError(""); setWorked({});
    t0.current = Date.now();
    chatId.current = Date.now();
    persistChats([{ id: chatId.current, title: prompt.slice(0, 60), project }, ...chats].slice(0, 30));
    if (selModel) { void runBrief("", ""); return; }
    if (attached.length && skill) { setPhase("intake"); void readProduct(attached); return; }
    setPhase("intake");
  }

  async function readProduct(files: FileList | File[]) {
    setBusy("think"); setError("");
    try {
      const form = new FormData();
      Array.from(files).slice(0, 3).forEach((file) => form.append("images", file));
      const response = await fetch("/api/multiplier/clone/product-look", { method: "POST", body: form });
      if (!response.ok) { await fail(response); setBusy(""); return; }
      const data = await response.json();
      setProductLook(typeof data.look === "string" ? data.look : "");
      setBusy("");
      void runBrief(typeof data.look === "string" ? data.look : "", "");
    } catch { setError(t("error")); setBusy(""); }
  }

  async function runBrief(look = productLook, link = productLink) {
    setProductLook(look); setProductLink(link);
    lookRef.current = look; linkRef.current = link;
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
    const chosen = isOther ? otherText.trim() : picked;
    const next = skipped || !chosen ? answers : [...answers, { question: current.question, answer: chosen }];
    setAnswers(next); setPicked(null); setIsOther(false); setOtherText("");
    if (qi + 1 < questions.length) { setQi(qi + 1); return; }
    setQuestions([]); setBusy("build");
    try { const data = await brief(next); if (data) takeBrief(data); } catch { setError(t("error")); } finally { setBusy(""); }
  }

  async function approve() {
    if (selModel?.faces[0]) {
      setPin({ id: "model", thumb: selModel.faces[0], full: selModel.faces[0] });
      const file = await dataUrlToFile(selModel.faces[0]);
      void writePrompt(file, null, true);
      return;
    }
    setPhase("photos"); setBusy("pins"); setError("");
    try {
      const response = await fetch("/api/multiplier/clone/influencer-pins", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ queries: searches, author: "" }),
      });
      if (response.ok) { const data = await response.json(); setPins(Array.isArray(data.pins) ? data.pins : []); }
    } catch { /* sem fotos: o membro envia a sua ou segue sem foto */ } finally { setBusy(""); }
  }

  async function writePrompt(file: File | null, chosenPin: Pin | null, keepPin = false) {
    setPhoto(file); if (!keepPin) setPin(chosenPin);
    setPhase("prompt"); setBusy("prompt"); setError("");
    try {
      const form = new FormData();
      Object.entries({ ...persona, extra: "" }).forEach(([key, value]) => form.append(key, value));
      if (file) form.append("image", file); else if (chosenPin) form.append("image_url", chosenPin.full);
      const response = await fetch("/api/multiplier/clone/influencer-prompt", { method: "POST", body: form });
      if (!response.ok) { await fail(response); return; }
      const data = await response.json();
      setPrompts(Array.isArray(data.prompts) ? data.prompts : []);
      mark("prompt");
      setSummaries(Array.isArray(data.summaries) ? data.summaries : []);
    } catch { setError(t("error")); } finally { setBusy(""); }
  }

  async function buildBoards() {
    setBusy("board"); setError(""); setPhase("board");
    try {
      const make = async (i: number): Promise<Board | null> => {
        const response = await fetch("/api/multiplier/clone/influencer-storyboard", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            copy: copyText, scene_count: SCENES, persona: { ...persona, look: persona.look + (selModel?.voice ? `. Voice: ${selModel.voice}` : ""), extra: "" }, language: style.voice || LANG_CODE[lang], camera: style.camera, captions: style.captions, voice_tone: style.tone, voice_custom: style.custom, cadence: "natural", energy: "calm",
            angle: videoCount > 1 && vary.hook ? ANGLES[i % ANGLES.length] : "",
            body_style: videoCount > 1 && vary.body ? BODIES[i % BODIES.length] : "",
            cta: videoCount > 1 && vary.cta ? CTAS[lang][i % CTAS[lang].length] : "",
            product: "", product_look: productLook, show_product: style.product ?? Boolean(productLook || productLink),
          }),
        });
        if (!response.ok) { await fail(response); return null; }
        return response.json();
      };
      const result: Board[] = [];
      for (let start = 0; start < videoCount; start += 3) {
        const batch = await Promise.all(Array.from({ length: Math.min(3, videoCount - start) }, (_, k) => make(start + k)));
        if (batch.some((item) => !item)) { setPhase("cost"); return; }
        result.push(...(batch as Board[]));
      }
      setBoards(result); setActive(0); mark("board");
    } catch { setError(t("error")); setPhase("cost"); } finally { setBusy(""); }
  }

  const board = boards[active] ?? null;
  const flowPackage = () => JSON.stringify({
    app: "clipgringa-flow", version: 1, sceneCount: board?.scenes.length ?? 0, model: chosen.name, flowModel: chosen.needle, lowerPriority: lower, fallbackModels: lower ? ["Lite", "Omni", "Fast"] : [], mode: "frames",
    videos: boards.map((item, v) => ({
      title: `${persona.name || "Influencer"} ${v + 1}`,
      scenes: item.scenes.map((_, index) => ({ imagePrompt: item.imagePrompts[index] ?? "", videoPrompt: item.videoPrompts[index] ?? "", file: `Video${String(v + 1).padStart(2, "0")}_Cena${String(index + 1).padStart(2, "0")}.mp4` })),
    })),
  }, null, 2);

  async function copyOut(key: string, text: string) {
    try { await navigator.clipboard.writeText(text); setSent(key); window.setTimeout(() => setSent(""), 1800); } catch { /* o texto continua na tela */ }
  }

  const snapshot = (): Snap => ({ style, phase, prompt, skill, answers, persona, searches, copyText, pins, pin, prompts, summaries, videoCount, vary, model, boards, productLook, productLink, worked });
  const snapKey = JSON.stringify(snapshot());
  useEffect(() => {
    if (!hydrated || chatId.current === null || phase === "home") return;
    const id = chatId.current;
    setChats((current) => {
      const next = current.map((c) => (c.id === id ? { ...c, title: prompt.slice(0, 60) || c.title, project: project || c.project, snap: JSON.parse(snapKey) } : c));
      try { window.localStorage.setItem("gv-influencer-chats", JSON.stringify(next)); } catch { /* sem armazenamento */ }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapKey, hydrated]);

  function openChat(chat: ChatItem) {
    reset();
    chatId.current = chat.id;
    setPrompt(chat.title);
    const snap = chat.snap as Record<string, never> | undefined;
    if (!snap) return;
    const unsettled = snap.phase === "intake" || snap.phase === "ask";
    setPrompt((snap.prompt as string) || chat.title); setSkill((snap.skill as SkillId) || "");
    if (unsettled && !(snap.persona as Persona)?.name) { chatId.current = null; return; }
    setAnswers(snap.answers ?? []); setPersona(snap.persona ?? { name: "", age: "", look: "", setting: "" }); setSearches(snap.searches ?? []); setCopyText((snap.copyText as string) ?? "");
    setPins(snap.pins ?? []); setPin(snap.pin ?? null); setPrompts(snap.prompts ?? []); setSummaries(snap.summaries ?? []); setVideoCount((snap.videoCount as number) ?? 1);
    setStyle((snap.style as typeof style) ?? { captions: false, voice: "", tone: "", custom: "", camera: "selfie", product: null }); setVary(snap.vary ?? { hook: true, body: false, cta: false }); setModel((snap.model as string) ?? model); setBoards(snap.boards ?? []); setProductLook((snap.productLook as string) ?? ""); setProductLink((snap.productLink as string) ?? "");
    lookRef.current = (snap.productLook as string) ?? ""; linkRef.current = (snap.productLink as string) ?? "";
    setWorked(snap.worked ?? {}); setProject(chat.project ?? "");
    setPhase(((snap.phase as Phase) === "ask" || (snap.phase as Phase) === "intake") ? "approve" : (snap.phase as Phase));
  }

  async function addFaces(files: FileList | null) {
    if (!files?.length) return;
    const urls = await Promise.all(Array.from(files).slice(0, 3).map((file) => fileToDataUrl(file)));
    setMFaces(urls);
  }
  function saveModel() {
    const nameClean = mName.trim().slice(0, 40);
    if (!nameClean) return;
    const item: MyModel = { id: String(Date.now()), name: nameClean, persona: { name: nameClean, age: "", look: mLook.trim().slice(0, 300), setting: "" }, faces: mFaces, voice: mVoice.trim().slice(0, 200) };
    const next = [item, ...models];
    if (!saveModels(next)) { setError(t("error")); return; }
    setModels(next); setSelModelId(item.id); setModelForm(false); setMName(""); setMLook(""); setMVoice(""); setMFaces([]);
  }
  function deleteModel(id: string) { const next = models.filter((m) => m.id !== id); setModels(next); saveModels(next); if (selModelId === id) setSelModelId(""); }

  function deleteChat(id: number) { persistChats(chats.filter((c) => c.id !== id)); if (chatId.current === id) reset(); }
  function addProject() {
    const name = newProject.trim().slice(0, 40);
    if (!name) return;
    persistProjects([...projects, { id: String(Date.now()), name }]);
    setNewProject("");
  }
  function saveAsSkill() {
    const list = loadMySkills();
    saveMySkills([{ id: String(Date.now()), title: prompt.slice(0, 60), prompt, skill: skill && (skill as string) !== "other" ? skill : "" }, ...list]);
    setSkillSaved(true);
  }

  const shown = EXAMPLES.filter((item) => filter === "all" || item.skill === filter);
  const q = questions[qi];
  const totalCredits = chosen.credits * SCENES * videoCount;
  const started = phase !== "home";

  const nicheRow = (
    <div className="flex flex-wrap items-center gap-1 text-sm">
      <div role="group" aria-label={t("niche")} className="flex flex-wrap gap-1">
        {SKILLS.map((item) => (
          <button key={item.id} type="button" disabled={started} aria-pressed={skill === item.id} title={item.hint[lang]} onClick={() => setSkill(skill === item.id ? "" : item.id)}
            className={cn("rounded-[10px] px-3 py-1.5 text-xs font-medium transition disabled:opacity-60", skill === item.id ? "bg-[#7B3FE4]/30 text-white" : "text-muted-foreground hover:bg-white/5 hover:text-foreground")}>
            {item.emoji} {item.name[lang]}
          </button>
        ))}
      </div>
      <Link href="/influencer/skills" className="ml-auto inline-flex items-center gap-1.5 rounded-[10px] px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-white/5 hover:text-foreground">⚡ {t("skillsLink")}</Link>
    </div>
  );

  const composer = (
    <div className="relative">
      {/* luz roxa girando em volta da caixa */}
      <span aria-hidden className="pointer-events-none absolute -inset-1 overflow-hidden rounded-[30px] opacity-70 blur-lg">
        <span className="absolute left-1/2 top-1/2 aspect-square w-[160%] -translate-x-1/2 -translate-y-1/2 animate-spin bg-[conic-gradient(from_0deg,transparent_0deg,#7B3FE4_70deg,#A98BFF_120deg,transparent_200deg,transparent_360deg)] [animation-duration:5s] " />
      </span>
      <span aria-hidden className="pointer-events-none absolute -inset-px overflow-hidden rounded-[27px]">
        <span className="absolute left-1/2 top-1/2 aspect-square w-[160%] -translate-x-1/2 -translate-y-1/2 animate-spin bg-[conic-gradient(from_0deg,transparent_0deg,#7B3FE4_70deg,#C9BBFA_120deg,transparent_200deg,transparent_360deg)] [animation-duration:4s]" />
      </span>
    <div className="relative rounded-[26px] bg-[#1a191d] p-5 ring-1 ring-white/10 shadow-[0_20px_60px_-30px_#000]" data-testid="chat-composer">
      <textarea value={started ? "" : prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); if (!started && !busy && prompt.trim().length >= 8) start(); } }} rows={3} maxLength={600} disabled={started} aria-label={lang === "en" ? "Describe the influencer" : lang === "es" ? "Describe a la influencer" : "Descreva a influencer"}
        placeholder={phase === "home" ? (demo ? `${demo}▍` : t("ph")) : t("follow")}
        className="min-h-[96px] w-full resize-none bg-transparent px-1 py-1 text-lg outline-none placeholder:text-muted-foreground/70 disabled:opacity-60" />
      <div className="mt-2 flex items-center gap-2">
        <input ref={attachRef} type="file" multiple accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label={t("attachPhoto")}
          onChange={(event) => { const files = Array.from(event.target.files ?? []).slice(0, 3); if (files.length) setAttached(files); event.target.value = ""; }} />
        <button type="button" disabled={started} title={t("attachPhoto")} aria-label={t("attachPhoto")} onClick={() => attachRef.current?.click()}
          className="relative grid size-9 place-items-center rounded-full text-muted-foreground hover:bg-white/5 hover:text-foreground disabled:opacity-60">
          <Plus className="size-5" />
          {attached.length > 0 && <span className="absolute -right-0.5 -top-0.5 grid size-4 place-items-center rounded-full bg-[#7B3FE4] text-[10px] text-white">{attached.length}</span>}
        </button>
        {attached.length > 0 && !started && <button type="button" aria-label={t("stop")} onClick={() => setAttached([])} className="text-muted-foreground hover:text-foreground"><X className="size-3.5" /></button>}
        <select aria-label={t("modelLabel")} value={model} onChange={(event) => { setModel(event.target.value); saveFlowCategory(event.target.value); setModelChosen(true); }} disabled={started}
          className="max-w-[14rem] truncate rounded-full bg-white/5 px-3 py-1.5 text-xs font-medium text-foreground disabled:opacity-60 [&>option]:bg-[#1a191d] [&>option]:text-white">
          {FLOW_CHOICES.map((item) => <option key={item.id} value={item.id}>{item.id === "lower" ? "Lower Priority" : item.name} · {item.credits === 0 ? `0 ${t("creditsWord")}` : `~${item.credits * SCENES} ${t("creditsWord")}/${t("video")}`}</option>)}
        </select>
        {projects.length > 0 && (
          <select aria-label={t("projects")} value={project} onChange={(event) => setProject(event.target.value)} disabled={started}
            className="max-w-[8rem] truncate rounded-full bg-white/5 px-3 py-1.5 text-xs text-muted-foreground disabled:opacity-60">
            <option value="">{t("noProject")}</option>
            {projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        )}
        <span className="ml-auto inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground">✋ {t("askFirst")}</span>
        <button type="button" aria-label={t("send")} title={t("send")} onClick={start} disabled={started || prompt.trim().length < 8}
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#A98BFF] to-[#7B3FE4] text-white disabled:opacity-40">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-5" />}
        </button>
      </div>
      <p className="mt-2 px-1 text-[11px] text-muted-foreground" data-testid="cost-estimate">
        {chosen.credits === 0 ? t("estFree") : `${t("estimate")}: ~${chosen.credits * SCENES} ${t("creditsWord")} / ${t("video")} (${SCENES} ${t("scenesWord")} × ${chosen.credits})`}
      </p>
    </div>
    </div>
  );

  return (
    <div className={cn("grid h-screen gap-3 overflow-hidden bg-[#09080C] p-3 lg:grid-cols-[250px_minmax(0,1fr)]", started && (pin || persona.name) && "xl:grid-cols-[250px_minmax(0,1fr)_280px]")}>
    <aside className="hidden min-h-0 space-y-1 overflow-y-auto rounded-[22px] bg-[#111113] p-3 ring-1 ring-white/10 lg:block" aria-label={t("chats")} data-testid="chat-sidebar">
      <Link href="/list" className="mb-2 flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground hover:text-foreground">← {t("navApp")}</Link>
      <button type="button" onClick={reset} className="flex w-full items-center gap-3 rounded-[14px] bg-white/5 px-2 py-2 text-sm font-medium hover:bg-white/10"><span aria-hidden className="grid size-7 place-items-center rounded-[9px] bg-white/10"><Plus className="size-4" /></span> {t("newChat")}</button>
      <Link href="/influencer/skills" className="flex w-full items-center gap-3 rounded-[14px] px-2 py-2 text-sm font-medium hover:bg-white/5"><span aria-hidden className="grid size-7 place-items-center rounded-[9px] bg-white/10 text-xs">⚡</span> {t("skillsLink")}</Link>
      <details className="space-y-1.5 px-1" data-testid="chat-projects">
        <summary className="flex cursor-pointer list-none items-center gap-3 rounded-[14px] px-1 py-2 text-sm font-medium hover:bg-white/5"><span aria-hidden className="grid size-7 place-items-center rounded-[9px] bg-white/10 text-xs">▤</span> {t("projects")}</summary>
        <div className="flex flex-wrap gap-1.5 px-1">
          <Chip on={filter2 === ""} onClick={() => setFilter2("")}>{t("allProjects")}</Chip>
          {projects.map((item) => <Chip key={item.id} on={filter2 === item.id} onClick={() => setFilter2(item.id)}>{item.name}</Chip>)}
        </div>
        <div className="flex gap-1.5 px-1">
          <input value={newProject} onChange={(event) => setNewProject(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") addProject(); }} maxLength={40} aria-label={t("newProject")} placeholder={t("newProject")} className="min-w-0 flex-1 rounded-full border border-border bg-background px-3 py-1 text-xs" />
          <button type="button" aria-label={t("createProject")} onClick={addProject} className="rounded-full border border-border px-2 text-xs hover:text-foreground"><Plus className="size-3.5" /></button>
        </div>
      </details>
      <details className="px-1 pt-2 text-sm">
        <summary className="flex cursor-pointer list-none items-center gap-3 rounded-[14px] px-0 py-2 text-sm font-medium hover:bg-white/5"><span aria-hidden className="grid size-7 place-items-center rounded-[9px] bg-white/10 text-xs">···</span> {t("seeMore")}</summary>
        <nav className="space-y-0.5 pt-1">
          {([["/list", "navLib"], ["/folders", "navFolders"], ["/automacao", "navAuto"], ["/conectar-flow", "navFlow"], ["/minhas-apis", "navApis"]] as const).map(([href, key]) => (
            <Link key={href} href={href} className="block rounded-[10px] px-2 py-1.5 text-sm hover:bg-white/5">{t(key)}</Link>
          ))}
          <div className="px-2 pt-1"><LanguageSwitcher /></div>
        </nav>
      </details>
      <p className="px-2 pt-3 text-xs text-muted-foreground">{t("chats")}</p>
      {chats.filter((c) => !filter2 || c.project === filter2).length === 0 && <p className="px-2 text-xs text-muted-foreground">{t("noChats")}</p>}
      {chats.filter((c) => !filter2 || c.project === filter2).map((chat) => (
        <div key={chat.id} className={cn("group flex items-center rounded-[12px] hover:bg-card", chatId.current === chat.id && "bg-card")}>
          <button type="button" onClick={() => openChat(chat)} className="min-w-0 flex-1 truncate px-3 py-2 text-left text-sm">{chat.title}</button>
          <button type="button" aria-label={`${t("remove")}: ${chat.title}`} onClick={() => deleteChat(chat.id)} className="mr-1 hidden rounded-full p-1 text-muted-foreground hover:text-foreground group-hover:block"><X className="size-3.5" /></button>
        </div>
      ))}
      <div className="sticky bottom-0 -mx-3 -mb-3 mt-4 flex items-center gap-3 bg-[#111113] px-4 py-3">
        <span aria-hidden className="grid size-9 place-items-center rounded-full bg-gradient-to-br from-[#8B5CF6] to-[#A98BFF] text-sm font-bold text-white">{(session?.user?.name ?? "?").slice(0, 1).toUpperCase()}</span>
        <span className="min-w-0 truncate text-sm font-medium">{session?.user?.name ?? ""}</span>
      </div>
    </aside>
    <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[22px] bg-[#111113] ring-1 ring-white/10" data-testid="influencer-chat">
      <header className="flex items-center justify-between gap-3 px-4 py-3 sm:px-8">
        <p className="min-w-0 flex-1 truncate text-sm font-semibold" data-testid="chat-user-bubble">{started ? prompt : ""}</p>
        {started && <button type="button" onClick={reset} className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"><Plus className="size-3.5" /> {t("newChat")}</button>}
        <Link href="/conectar-flow" className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.07] px-4 py-2 text-sm font-medium hover:bg-white/10">{t("navFlow")}</Link>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-8">
      {phase === "home" && (
        <>
          <div className="flex items-center justify-center gap-3 pb-2 pt-10">
            <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-gradient-to-br from-[#8B5CF6] to-[#7B3FE4] text-white shadow-[0_10px_28px_-10px_#7B3FE4]"><Sparkles className="size-5" /></span>
            <h1 className="text-2xl font-extrabold uppercase tracking-tight sm:text-3xl">{session?.user?.name && <span aria-hidden>{session.user.name.split(" ")[0]}, </span>}{t("home")}</h1>
          </div>
          {composer}
          {nicheRow}
          <div className="space-y-3" data-testid="my-models">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">{t("myModel")}:</span>
              <Chip on={selModelId === ""} onClick={() => setSelModelId("")}>{t("noModel")}</Chip>
              {models.map((m) => (
                <span key={m.id} className="inline-flex items-center gap-1">
                  <Chip on={selModelId === m.id} onClick={() => setSelModelId(m.id)}>{m.name}</Chip>
                  <button type="button" aria-label={`${t("deleteModel")}: ${m.name}`} onClick={() => deleteModel(m.id)} className="text-muted-foreground hover:text-foreground"><X className="size-3.5" /></button>
                </span>
              ))}
              <Chip onClick={() => setModelForm((open) => !open)}>+ {t("newModel")}</Chip>
            </div>
            {modelForm && (
              <div className="space-y-3 rounded-[18px] border border-border bg-card p-4" data-testid="model-form">
                <input value={mName} onChange={(event) => setMName(event.target.value)} maxLength={40} aria-label={t("modelName")} placeholder={t("modelName")} className="w-full rounded-full border border-border bg-background px-4 py-2 text-sm" />
                <input value={mLook} onChange={(event) => setMLook(event.target.value)} maxLength={300} aria-label={t("modelLook")} placeholder={t("modelLook")} className="w-full rounded-full border border-border bg-background px-4 py-2 text-sm" />
                <input value={mVoice} onChange={(event) => setMVoice(event.target.value)} maxLength={200} aria-label={t("modelVoice")} placeholder={t("modelVoice")} className="w-full rounded-full border border-border bg-background px-4 py-2 text-sm" />
                <input ref={faceRef} type="file" multiple accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label={t("modelFace")} onChange={(event) => { void addFaces(event.target.files); event.target.value = ""; }} />
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" variant="outline" className="rounded-full" onClick={() => faceRef.current?.click()}><ImagePlus className="size-4" /> {t("modelFace")}</Button>
                  {mFaces.map((src, n) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={n} src={src} alt="" className="h-12 rounded-md" />
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">{t("modelNote")}</p>
                <Button type="button" className="rounded-full" disabled={mName.trim().length < 2} onClick={saveModel}>{t("saveModel")}</Button>
              </div>
            )}
          </div>
          <div className="space-y-4 pt-4" data-testid="influencer-examples">
            <div role="group" aria-label={t("all")} className="flex flex-wrap justify-center gap-1.5">
              {([["all", t("all")], ...SKILLS.map((s) => [s.id, `${s.emoji} ${s.name[lang]}`])] as [SkillId | "all", string][]).map(([id, label]) => (
                <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)}
                  className={cn("rounded-[10px] px-3.5 py-1.5 text-xs font-medium", filter === id ? "bg-white/10 text-foreground" : "text-muted-foreground hover:bg-white/5")}>{label}</button>
              ))}
            </div>
            <div className="grid gap-x-4 gap-y-6 sm:grid-cols-2">
              {shown.map((item) => (
                <button key={item.id} type="button" onClick={() => { setPrompt(item.prompt[lang]); setSkill(item.skill); }} className="group text-left">
                  <div className="relative aspect-[16/10] overflow-hidden rounded-[20px] ring-1 ring-white/10" style={{ background: `radial-gradient(120% 90% at 20% 0%, ${item.from}66, transparent 60%), radial-gradient(100% 90% at 100% 100%, ${item.to}55, transparent 60%), #17161b` }} aria-hidden>
                    <span className="absolute left-1/2 top-1/2 size-28 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/[0.06] blur-sm transition group-hover:scale-110" />
                    <span className="absolute inset-0 grid place-items-center text-5xl transition group-hover:scale-110">{item.emoji}</span>
                    <span className="absolute bottom-3 left-3 rounded-full bg-black/45 px-2.5 py-0.5 text-[10px] font-medium text-white/90">{SKILLS.find((x) => x.id === item.skill)?.name[lang]}</span>
                  </div>
                  <span className="mt-3 flex items-center gap-3">
                    <span className="min-w-0 flex-1 line-clamp-2 text-sm font-medium leading-snug">{item.title[lang]}</span>
                    <span className="rounded-full bg-[#7B3FE4] px-3 py-1 text-xs font-medium text-white opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">{t("recreate")}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {phase === "intake" && !skill && (
        <Msg testid="chat-niche">
          <p>{t("whichNiche")}</p>
          <div className="flex flex-wrap gap-2">
            {SKILLS.map((item) => <Chip key={item.id} onClick={() => { setSkill(item.id); if (attached.length) void readProduct(attached); }}>{item.emoji} {item.name[lang]}</Chip>)}
            <Chip onClick={() => { setSkill("other" as SkillId); if (attached.length) void readProduct(attached); }}>{t("otherNiche")}</Chip>
          </div>
        </Msg>
      )}
      {phase === "intake" && skill && (
        <Msg testid="chat-product">
          <p>{t("hasProduct")}</p>
          <input ref={productRef} type="file" multiple accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label={t("attachPhoto")}
            onChange={(event) => { if (event.target.files?.length) void readProduct(event.target.files); event.target.value = ""; }} />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" className="rounded-full" onClick={() => productRef.current?.click()} disabled={busy !== ""}><ImagePlus className="size-4" /> {t("attachPhoto")}</Button>
            <Button type="button" variant="outline" className="rounded-full" onClick={() => setLinkOpen(true)} disabled={busy !== ""}>{t("pasteLink")}</Button>
            <Button type="button" variant="ghost" className="rounded-full" onClick={() => void runBrief("", "")} disabled={busy !== ""}>{t("noProduct")}</Button>
          </div>
          {linkOpen && (
            <div className="flex gap-2">
              <input value={productLink} onChange={(event) => setProductLink(event.target.value)} maxLength={300} aria-label={t("pasteLink")} placeholder={t("linkPh")} className="min-w-0 flex-1 rounded-full border border-border bg-background px-4 py-2 text-sm" />
              <Button type="button" className="rounded-full" disabled={!/^https?:\/\//i.test(productLink.trim())} onClick={() => void runBrief("", productLink.trim())}>{t("addLink")}</Button>
            </div>
          )}
        </Msg>
      )}
      {busy === "think" && phase === "intake" && <Working hints={[t("hint1"), t("hint2"), t("hint3")]} text={t("reading")} />}
      {busy === "think" && phase !== "intake" && <Working hints={[t("hint1"), t("hint2"), t("hint3")]} text={t("think")} />}
      {error && <p role="alert" className="rounded-[14px] border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">{error}</p>}

      {answers.length > 0 && <div className="flex flex-wrap justify-center gap-2">{answers.map((a) => <span key={a.question} className="rounded-full bg-muted/50 px-3 py-1 text-xs text-muted-foreground">✓ {a.answer}</span>)}</div>}

      {q && (
        <Msg testid="chat-question">
          <p className="font-medium">{q.question}</p>
          <div role="radiogroup" aria-label={q.question} className="grid gap-2">
            {q.options.slice(0, 3).map((option, n) => (
              <button key={option.label} type="button" role="radio" aria-checked={picked === option.label} onClick={() => { setPicked(option.label); setIsOther(false); }}
                className={cn("flex items-start gap-3 rounded-[16px] border px-4 py-3 text-left transition", picked === option.label ? "border-[#A98BFF] bg-[#7B3FE4]/15" : "border-border bg-card hover:border-[#A98BFF]/60")}>
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border border-border text-[11px]" aria-hidden>{n + 1}</span>
                <span><span className="font-medium">{option.label}</span>{option.detail && <span className="block text-xs text-muted-foreground">{option.detail}</span>}</span>
              </button>
            ))}
            <button type="button" role="radio" aria-checked={isOther} onClick={() => { setIsOther(true); setPicked(null); }}
              className={cn("flex items-start gap-3 rounded-[16px] border px-4 py-3 text-left transition", isOther ? "border-[#A98BFF] bg-[#7B3FE4]/15" : "border-border bg-card hover:border-[#A98BFF]/60")}>
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border border-border text-[11px]" aria-hidden>✎</span>
              <span className="font-medium">{t("other")}</span>
            </button>
            {isOther && (
              <textarea autoFocus value={otherText} onChange={(event) => setOtherText(event.target.value)} rows={2} maxLength={300} aria-label={t("otherHint")} placeholder={t("otherHint")}
                className="w-full resize-none rounded-[16px] border border-[#A98BFF]/60 bg-card px-4 py-3 text-sm outline-none" />
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" className="rounded-full" onClick={() => void answer(true)}>{t("skip")}</Button>
            <Button type="button" className="rounded-full" disabled={isOther ? otherText.trim().length < 2 : !picked} onClick={() => void answer(false)}>{t("next")} <ArrowRight className="size-4" /></Button>
          </div>
        </Msg>
      )}
      {busy === "build" && <Working hints={[t("hint1"), t("hint2"), t("hint3")]} text={t("build")} />}

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

      {busy === "prompt" && <Working hints={[t("hint1"), t("hint2"), t("hint3")]} text={t("writing")} />}
      {["prompt", "count", "model", "cost", "board"].includes(phase) && prompts.length > 0 && (
        <Msg testid="chat-prompt">
          {worked.prompt && <p className="flex items-center gap-3 text-xs text-muted-foreground" data-testid="worked"><span>{t("worked")} {worked.prompt}s</span><span aria-hidden className="h-px flex-1 bg-white/10" /></p>}
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
        <Msg testid="chat-style">
          <p>{t("styleAsk")}</p>
          {([
            ["captions", t("styCaptions"), [[false, t("styNo")], [true, t("styYes")]]],
            ["voice", t("styVoice"), [["", `${t("styAuto")} (${LANG_NAMES[LANG_CODE[lang]]})`], ["pt-BR", "Português (Brasil)"], ["pt-PT", "Português (Portugal)"], ["en", "English"], ["es", "Español"], ["fr", "Français"], ["de", "Deutsch"], ["it", "Italiano"]]],
            ["tone", t("styTone"), [["", t("styAuto")], ["calm", t("toneCalm")], ["lively", t("toneLively")], ["deep", t("toneDeep")], ["soft", t("toneSoft")], ["young", t("toneYoung")], ["mature", t("toneMature")]]],
            ["camera", t("styCamera"), [["selfie", t("camSelfie")], ["tripod", t("camTripod")], ["pov", t("camPov")], ["cinematic", t("camCinema")]]],
            ["product", t("styProduct"), [[true, t("styYes")], [false, t("styNo")]]],
          ] as [keyof typeof style, string, [string | boolean, string][]][]).map(([key, label, opts]) => (
            <div key={key} role="radiogroup" aria-label={label} className="flex flex-wrap items-center gap-2">
              <span className="w-full text-xs text-muted-foreground sm:w-28">{label}</span>
              {opts.map(([value, text]) => (
                <Chip key={String(value)} role="radio" on={(key === "product" ? (style.product ?? Boolean(productLook || productLink)) : style[key]) === value} onClick={() => { if (phase === "count") setStyle((current) => ({ ...current, [key]: value })); }}>{text}</Chip>
              ))}
            </div>
          ))}
          <input value={style.custom} onChange={(event) => setStyle((current) => ({ ...current, custom: event.target.value }))} disabled={phase !== "count"} maxLength={120} aria-label={t("styCustom")} placeholder={t("styCustom")} className="w-full rounded-full border border-border bg-background px-4 py-2 text-sm" />
        </Msg>
      )}

      {["count", "model", "cost", "board"].includes(phase) && (
        <Msg testid="video-count">
          <p>{t("howMany")}</p>
          <div role="radiogroup" aria-label={t("howMany")} className="flex flex-wrap gap-2">
            {[1, 2, 3, 5, 10].map((n) => <Chip key={n} role="radio" on={videoCount === n} onClick={() => { if (phase === "count") setVideoCount(n); }}>{n} {n === 1 ? t("video") : t("videos")}</Chip>)}
          </div>
          {videoCount > 1 && (
            <div className="space-y-2">
              <p className="text-muted-foreground">{t("vary")}</p>
              <div role="group" aria-label={t("vary")} className="flex flex-wrap gap-2">
                {([["hook", t("vHook")], ["body", t("vBody")], ["cta", t("vCta")]] as const).map(([key, label]) => (
                  <Chip key={key} on={vary[key]} onClick={() => { if (phase === "count") setVary({ ...vary, [key]: !vary[key] }); }}>{vary[key] ? "✓ " : ""}{label}</Chip>
                ))}
              </div>
            </div>
          )}
          {phase === "count" && <Button type="button" className="rounded-full" onClick={() => setPhase(modelChosen ? "cost" : "model")}>{t("go")} <ArrowRight className="size-4" /></Button>}
        </Msg>
      )}
      {["model", "cost", "board"].includes(phase) && !modelChosen && (
        <Msg testid="chat-model">
          <p>{t("whichModel")}</p>
          <div role="radiogroup" aria-label={t("whichModel")} className="flex flex-wrap gap-2">
            {FLOW_CHOICES.map((item) => (
              <Chip key={item.id} role="radio" on={model === item.id} onClick={() => { if (phase === "model") { setModel(item.id); saveFlowCategory(item.id); setPhase("cost"); } }}>
                {item.id === "lower" ? "Lower Priority" : item.name} · {item.credits === 0 ? t("zero") : `${item.credits} ${t("credits")}`}
              </Chip>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">{t("modelAuto")}</p>
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
      {busy === "board" && <Working hints={[t("hint1"), t("hint2"), t("hint3")]} text={t("making")} />}

      {phase === "board" && board && (
        <Msg testid="storyboard">
          {worked.board && <p className="flex items-center gap-3 text-xs text-muted-foreground"><span>{t("worked")} {worked.board}s</span><span aria-hidden className="h-px flex-1 bg-white/10" /></p>}
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
            <button type="button" onClick={() => { const raw = flowPackage(); window.postMessage({ source: "clipgringa-page", type: "flow-package", raw }, window.location.origin); void copyOut("pack", raw); window.open(FLOW_URL, "_blank", "noopener"); }}
              className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-[#8B5CF6] to-[#7B3FE4] px-4 py-2 text-sm font-medium text-white">
              {sent === "pack" ? <Check className="size-4" /> : <ClipboardCopy className="size-4" />} {t("pack")}
            </button>
            <button type="button" onClick={() => void copyOut("all", board.scenes.map((scene, index) => `${t("scene").toUpperCase()} ${index + 1}\n${scene.line}\n${board.imagePrompts[index] ?? ""}\n${board.videoPrompts[index] ?? ""}`).join("\n\n"))}
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-sm hover:text-foreground">
              {sent === "all" ? <Check className="size-4 text-[#5BD69A]" /> : <ClipboardCopy className="size-4" />} {t("onlyPrompts")}
            </button>
          </div>
          {selModel?.faces[0] && (
            <a href={selModel.faces[0]} download={`${selModel.name}.jpg`} className="inline-block rounded-full border border-border px-4 py-2 text-sm hover:text-foreground">⬇ {t("downloadFace")}</a>
          )}
          <div className="space-y-1" data-testid="next-steps">
            <p className="text-muted-foreground">{t("nextSteps")}</p>
            <button type="button" onClick={saveAsSkill} disabled={skillSaved} className="block w-full rounded-[12px] px-2 py-2 text-left hover:bg-muted disabled:opacity-60">↳ {skillSaved ? `✓ ${t("saved")}` : t("saveSkill")}</button>
            {([[t("more"), () => { setVideoCount(3); setBoards([]); setPhase("count"); }], [t("automation"), () => { window.location.href = "/automacao"; }]] as [string, () => void][]).map(([label, action]) => (
              <button key={label} type="button" onClick={action} className="block w-full rounded-[12px] px-2 py-2 text-left hover:bg-muted">↳ {label}</button>
            ))}
          </div>
        </Msg>
      )}

      <div ref={endRef} />
      </div>
      </div>
      {phase !== "home" && <div className="px-4 pb-4 sm:px-8"><div className="mx-auto w-full max-w-3xl">{composer}</div></div>}
    </section>
    <aside className={cn("hidden min-h-0 overflow-y-auto rounded-[22px] bg-[#111113] p-4 ring-1 ring-white/10", started && (pin || persona.name) && "xl:block")} aria-label={t("preview")} data-testid="chat-preview">
      {(pin || persona.name) && started && (
        <div className="sticky top-6 space-y-3 rounded-[18px] border border-border bg-card p-3">
          <p className="text-xs text-muted-foreground">{t("preview")}</p>
          {pin && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={pin.full} alt="" referrerPolicy="no-referrer" className="w-full rounded-[14px] object-cover" />
          )}
          {persona.name && <p className="text-sm font-medium">{[persona.name, persona.age].filter(Boolean).join(", ")}</p>}
        </div>
      )}
    </aside>
    </div>
  );
}
