"use client";

import { ShopeeImport } from "@/components/app/shopee-import";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ArrowUp, Check, ClipboardCopy, Film, ImagePlus, Loader2, Plus, Search, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/auth-client";
import { FLOW_CHOICES, defaultFlowCategory, effectiveFlowId, saveFlowCategory, visibleFlowChoices } from "@/lib/flow-models";
import { useFlowConnection } from "@/hooks/use-flow-connection";
import { LanguageSwitcher, useI18n } from "@/lib/i18n";
import { takeKind, takeTag, withTake, type TakeKind } from "@/lib/take-kinds";
import { pushFlowPackage } from "@/lib/flow-push";
import { FlowRunPanel } from "@/components/app/flow-run-panel";
import { EXAMPLES, SKILLS, type Lang3, type SkillId } from "@/lib/influencer-examples";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { loadMySkills, loadPinned, saveMySkills, type PinnedSkill } from "@/lib/influencer-skills";
import { PolicyNotice } from "@/components/app/policy-notice";
import { checkPolicy, policySignature } from "@/lib/shopee-policy";
import { PRESET_BRIEFS, PRESET_MODELS } from "@/lib/influencer-presets";
import { dataUrlToFile, fileToDataUrl, loadModels, saveModels, videoFrames, type MyModel } from "@/lib/influencer-models";

type Option = { label: string; detail?: string };
type Question = { question: string; options: Option[] };
type Persona = { name: string; age: string; look: string; setting: string };
type Pin = { id: string; thumb: string; full: string };
type Board = { scenes: { line: string; what: string }[]; imagePrompts: string[]; videoPrompts: string[] };
type Snap = Record<string, unknown>;
type ChatItem = { id: number; title: string; project?: string; snap?: Snap };
function saveRemote(chat: ChatItem) {
  return fetch(`/api/multiplier/clone/chats/${chat.id}`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: chat.title, project: chat.project ?? "", snap: chat.snap ?? {} }),
  }).catch(() => undefined);
}

type Phase = "home" | "intake" | "ask" | "approve" | "photos" | "prompt" | "count" | "model" | "cost" | "board";

const CHANGE_HINTS: Record<"pt" | "en" | "es", string[]> = {
  pt: ["Deixe ela mais morena e com cabelo curto", "Troque o cenário para uma cozinha clara", "Fale mais do desconto e da urgência", "Deixe o tom mais animado e divertido", "Ela deve ter 35 anos e parecer mais madura", "Mostre o produto logo no começo"],
  en: ["Make her tanner with short hair", "Change the scene to a bright kitchen", "Talk more about the discount and urgency", "Make the tone more lively and fun", "She should be 35 and look more mature", "Show the product right at the start"],
  es: ["Hazla más morena y con pelo corto", "Cambia el escenario a una cocina clara", "Habla más del descuento y la urgencia", "Haz el tono más animado y divertido", "Debe tener 35 años y verse más madura", "Muestra el producto al inicio"],
};

const FLOW_URL = "https://labs.google/fx/pt/tools/flow";
const DEFAULT_SCENES = 4;
const ANGLES = ["curiosity", "problem", "proof", "question"];
type StyleState = { captions: boolean; voice: string; tone: string; custom: string; camera: string; product: boolean | null; format: string; cta: string; setting: string; avatarMix: boolean };
const DEFAULT_STYLE: StyleState = { captions: false, voice: "", tone: "", custom: "", camera: "selfie", product: null, format: "talk", cta: "bio", setting: "", avatarMix: false };
const SETTINGS: Record<string, string> = { home: "in a real home kitchen", farm: "on a farm with a barn behind", office: "in a plain home office", car: "sitting inside a parked car", outdoor: "outdoors in natural daylight" };
/** Aparências que se alternam entre os vídeos (80/20: muda a pessoa, mantém o roteiro). */
const AVATAR_MIX = ["woman in her 50s, light skin, short grey hair, cardigan", "Black man in his 40s, short beard, plain t-shirt", "Latina woman in her 30s, dark wavy hair, casual blouse", "white farmer in his 60s, cap and flannel shirt", "Asian woman in her 40s, ponytail, simple sweater", "heavyset man in his 50s, glasses, polo shirt"];
const CTA_STYLE: Record<Lang3, Record<string, string>> = {
  pt: { bio: "Toque no link da bio e veja agora.", comment: "O link está nos comentários, toque e veja agora.", keyword: "Comente QUERO e eu te envio o link." },
  en: { bio: "Tap the link in my bio and see it now.", comment: "The link is in the comments, tap it and see it now.", keyword: "Comment WANT and I will send you the link." },
  es: { bio: "Toca el enlace de mi bio y velo ahora.", comment: "El enlace está en los comentarios, tócalo y velo ahora.", keyword: "Comenta QUIERO y te envío el enlace." },
};
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
  promptAttached: ["Prompt anexado ao chat", "Prompt attached to the chat", "Prompt adjuntado al chat"],
  all: ["Todos", "All", "Todos"],
  newChat: ["Novo chat", "New chat", "Nuevo chat"],
  other: ["Outro (ajustar)", "Other (adjust)", "Otro (ajustar)"],
  otherHint: ["Escreva o que você quer", "Write what you want", "Escribe lo que quieres"],
  secVideo: ["Vídeo", "Video", "Video"],
  secScene: ["Cenário", "Scene", "Escena"],
  secVoice: ["Voz", "Voice", "Voz"],
  secEnd: ["Final", "Ending", "Final"],
  changeQ: ["Ajuste pedido pela pessoa", "Change asked by the person", "Ajuste pedido por la persona"],
  changeSent: ["Ajuste aplicado na influencer e no prompt.", "Change applied to the influencer and the prompt.", "Ajuste aplicado a la influencer y al prompt."],
  styleAsk: ["Como você quer os vídeos?", "How do you want the videos?", "¿Cómo quieres los videos?"],
  styCaptions: ["Legenda no vídeo", "Subtitles", "Subtítulos"],
  styVoice: ["Idioma da voz", "Voice language", "Idioma de la voz"],
  yesWord: ["Sim", "Yes", "Sí"],
  noWord: ["Não", "No", "No"],
  styFormat: ["Formato do vídeo", "Video format", "Formato del video"],
  fmtTalk: ["Avatar falando", "Avatar talking", "Avatar hablando"],
  fmtPov: ["POV (mãos e produto)", "POV (hands and product)", "POV (manos y producto)"],
  fmtRecipe: ["Receita sem rosto", "Faceless recipe", "Receta sin rostro"],
  styCta: ["Chamada final (CTA)", "Call to action", "Llamada final (CTA)"],
  ctaBio: ["Link da bio", "Link in bio", "Enlace de la bio"],
  ctaComment: ["Link nos comentários", "Link in comments", "Enlace en los comentarios"],
  ctaKeyword: ["Comente a palavra", "Comment a keyword", "Comenta la palabra"],
  stySetting: ["Cenário", "Setting", "Escenario"],
  setHome: ["Cozinha de casa", "Home kitchen", "Cocina de casa"],
  setFarm: ["Fazenda", "Farm", "Granja"],
  setOffice: ["Escritório", "Office", "Oficina"],
  setCar: ["Dentro do carro", "In the car", "Dentro del coche"],
  setOutdoor: ["Ao ar livre", "Outdoors", "Al aire libre"],
  styAvatarMix: ["Variar o avatar a cada vídeo", "Vary the avatar in each video", "Variar el avatar en cada video"],
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
  perScene: ["por cena (8 s)", "per scene (8 s)", "por escena (8 s)"],
  creditsWord: ["créditos", "credits", "créditos"],
  quota: ["A IA está no limite de uso agora. Espere alguns minutos e tente de novo.", "The AI is at its usage limit right now. Wait a few minutes and try again.", "La IA está en su límite de uso ahora. Espera unos minutos e inténtalo de nuevo."],
  hint1: ["Isso pode levar até 1 minuto", "This can take up to 1 minute", "Esto puede tardar hasta 1 minuto"],
  hint2: ["Pode deixar esta aba aberta, eu aviso quando terminar", "Keep this tab open, I will tell you when it is done", "Deja esta pestaña abierta, te aviso al terminar"],
  hint3: ["Quase lá…", "Almost there…", "Casi listo…"],
  noPhotoHint: ["Sem foto, eu escolho uma modelo de IA como referência e crio com ela.", "Without a photo, I pick an AI model as reference and create with it.", "Sin foto, elijo una modelo de IA como referencia y creo con ella."],
  estimate: ["Estimativa de gasto", "Estimated cost", "Gasto estimado"],
  estFree: ["Sem custo no Lower Priority. Se a sua conta não tiver, usa o Lite (10 créditos por cena).", "Free with Lower Priority. If your account has none, it uses Lite (10 credits per scene).", "Sin costo con Lower Priority. Si tu cuenta no lo tiene, usa Lite (~40 créditos por video)."],
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
  searching: ["Buscando fotos e modelos de referência…", "Finding photos and reference models…", "Buscando fotos y modelos de referencia…"],
  noPhotos: ["Não achei fotos. Envie uma sua ou siga sem foto.", "No photos found. Upload yours or continue without one.", "No encontré fotos. Sube la tuya o sigue sin foto."],
  upload: ["Enviar minha foto", "Upload my photo", "Subir mi foto"],
  noPhoto: ["Seguir sem foto", "Continue without photo", "Seguir sin foto"],
  writing: ["Escrevendo o prompt da imagem…", "Writing the image prompt…", "Escribiendo el prompt de la imagen…"],
  promptReady: ["Prompt da imagem pronto. Cole no gerador de imagem do seu Flow.", "Image prompt ready. Paste it in your Flow image generator.", "Prompt de la imagen listo. Pégalo en el generador de imágenes de tu Flow."],
  copy: ["Copiar", "Copy", "Copiar"],
  copied: ["Copiado", "Copied", "Copiado"],
  toVideos: ["Fazer os vídeos", "Make the videos", "Hacer los videos"],
  back: ["Voltar", "Back", "Volver"],
  stepWord: ["Passo", "Step", "Paso"],
  ofWord: ["de", "of", "de"],
  tweak: ["Quer mudar mais alguma coisa? Escreva aqui (opcional)", "Want to change anything else? Write it here (optional)", "¿Quieres cambiar algo más? Escríbelo aquí (opcional)"],
  tweakLink: ["Quero escrever uma alteração", "I want to write a change", "Quiero escribir un cambio"],
  howScenes: ["Quantas cenas em cada vídeo?", "How many scenes per video?", "¿Cuántas escenas por video?"],
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
  pack: ["Enviar de novo para o Flow", "Send to Flow again", "Enviar de nuevo a Flow"],
  sending: ["Enviando para o Flow…", "Sending to Flow…", "Enviando a Flow…"],
  sentOk: ["Enviado! A extensão abre o Flow e gera as imagens e os vídeos sozinha. Eles aparecem aqui.", "Sent! The extension opens Flow and generates the images and videos by itself. They show up here.", "¡Enviado! La extensión abre Flow y genera las imágenes y los videos sola. Aparecen aquí."],
  sentManual: ["A extensão não respondeu. Abri o Flow em outra aba: confira se a extensão está ligada e toque em Enviar de novo.", "The extension did not answer. I opened Flow in another tab: check that the extension is on and tap Send again.", "La extensión no respondió. Abrí Flow en otra pestaña: revisa que la extensión esté activa y toca Enviar de nuevo."],
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
  typeName: ["Escrever o nome do produto", "Type the product name", "Escribir el nombre del producto"],
  namePh: ["Ex.: Garrafa térmica Stanley 1L", "E.g. Stanley 1L tumbler", "Ej.: Termo Stanley 1L"],
  searchBtn: ["Buscar", "Search", "Buscar"],
  searchingProduct: ["Buscando o produto…", "Searching for the product…", "Buscando el producto…"],
  searchHint1: ["Pesquisando no Google…", "Searching Google…", "Buscando en Google…"],
  searchHint2: ["Lendo o que dizem no Reddit…", "Reading what Reddit says…", "Leyendo lo que dicen en Reddit…"],
  searchHint3: ["Escolhendo a melhor foto…", "Picking the best photo…", "Eligiendo la mejor foto…"],
  photoMissing: ["Não achei foto. Anexe a sua se puder.", "No photo found. Attach yours if you can.", "No encontré foto. Adjunta la tuya si puedes."],
  aiPhoto: ["Foto criada por IA (não achei uma real).", "AI-made photo (no real one found).", "Foto creada por IA (no encontré una real)."],
  creatingProduct: ["Criando o produto com IA…", "Creating the product with AI…", "Creando el producto con IA…"],
  createHint1: ["Usando as informações que você deu…", "Using the info you gave…", "Usando la información que diste…"],
  createHint2: ["Inventando nome e descrição…", "Making up a name and description…", "Inventando nombre y descripción…"],
  createHint3: ["Criando a foto do produto…", "Creating the product photo…", "Creando la foto del producto…"],
  editBtn: ["Editar", "Edit", "Editar"],
  editLabel: ["Cole mais informações para ajustar a influencer e o prompt", "Paste more info to adjust the influencer and the prompt", "Pega más información para ajustar la influencer y el prompt"],
  editApply: ["Refazer com isso", "Redo with this", "Rehacer con esto"],
  didYouMean: ["Você quis dizer", "Did you mean", "¿Quisiste decir"],
  useThis: ["Usar este produto", "Use this product", "Usar este producto"],
  searchAgain: ["Buscar outra foto", "Try another photo", "Buscar otra foto"],
  notFound: ["Não achei esse produto. Confira o nome ou anexe a sua foto.", "I couldn't find that product. Check the name or attach your photo.", "No encontré ese producto. Revisa el nombre o adjunta tu foto."],
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
  changePh: ["Peça um ajuste: eu aplico na influencer e no prompt", "Ask for a change: I apply it to the influencer and the prompt", "Pide un ajuste: lo aplico a la influencer y al prompt"],
  follow: ["Para pedir outra influencer, toque em Novo chat", "To request another influencer, tap New chat", "Para pedir otra influencer, toca en Nuevo chat"],
  pinnedTitle: ["Skills fixadas", "Pinned skills", "Skills fijadas"],
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
  presetModels: ["Modelos prontos (realistas)", "Ready-made models (realistic)", "Modelos listos (realistas)"],
  usePreset: ["Usar", "Use", "Usar"],
  presetNote: ["Clique na foto ou em Usar: o texto da modelo entra na caixa lá em cima, é só completar com o produto e apertar o botão roxo. Para manter o mesmo rosto em todos os vídeos, anexe uma foto em Novo modelo.", "Click the photo or Use to create the video with this person. To keep the same face in every video, attach a photo in New model.", "Haz clic en la foto o en Usar para crear el video con esta persona. Para mantener el mismo rostro en todos los videos, adjunta una foto en Nuevo modelo."],
  saveModel: ["Salvar modelo", "Save model", "Guardar modelo"],
  modelNote: ["Anexe fotos do rosto ou um vídeo da pessoa: do vídeo eu pego alguns quadros como rosto e descrevo como ela é. O rosto vira a foto de referência e a voz entra em todas as cenas. O Flow não clona a voz de um áudio: a voz é descrita no prompt.", "The face becomes the reference photo and the voice goes into every scene. Flow does not clone a voice from audio: the voice is described in the prompt.", "El rostro es la foto de referencia y la voz entra en todas las escenas. Flow no clona la voz desde un audio: la voz se describe en el prompt."],
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
  useEffect(() => { const timer = window.setInterval(() => setSeconds((n) => n + 0.5), 500); return () => window.clearInterval(timer); }, []);
  // Sobe rápido no começo e desacelera perto do fim, até a resposta chegar (não passa de 95%).
  const percent = Math.min(95, Math.round(95 * (1 - Math.exp(-seconds / 18))));
  const hint = hints && hints.length ? hints[Math.floor(seconds / 5) % hints.length] : "";
  return (
    <div role="status" aria-live="polite" className="space-y-2.5 rounded-[18px] border border-white/10 bg-white/[0.03] px-4 py-3.5 text-sm">
      <div className="flex items-center gap-2 text-foreground"><Loader2 className="size-4 animate-spin text-[#A98BFF]" /> <span>{text}</span><span className="ml-auto text-xs tabular-nums text-muted-foreground">{Math.floor(seconds)}s</span></div>
      <div className="flex items-center gap-3">
        <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
          <span className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-[#5A1BAA] via-[#7B3FE4] to-[#A98BFF] shadow-[0_0_12px_#7B3FE4] transition-[width] duration-500 ease-out" style={{ width: `${percent}%` }} />
        </div>
        <span className="w-9 text-right text-xs font-semibold tabular-nums text-[#C9BBFA]">{percent}%</span>
      </div>
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
  const [attachedFx, setAttachedFx] = useState(0);
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
  const [sceneCount, setSceneCount] = useState(DEFAULT_SCENES);
  const [qStep, setQStep] = useState(0);
  const SCENES = sceneCount;
  const [style, setStyle] = useState<StyleState>(DEFAULT_STYLE);
  const [vary, setVary] = useState<{ hook: boolean; body: boolean; cta: boolean }>({ hook: true, body: false, cta: false });
  const [model, setModel] = useState<string>(FLOW_CHOICES[1].id);
  const { account: flowAcct } = useFlowConnection(true, false);
  const [boards, setBoards] = useState<Board[]>([]);
  const [productLook, setProductLook] = useState("");
  const [productLink, setProductLink] = useState("");
  const [linkOpen, setLinkOpen] = useState(false);
  const [nameOpen, setNameOpen] = useState(false);
  const [productName, setProductName] = useState("");
  const [searching, setSearching] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editText, setEditText] = useState("");
  const [found, setFound] = useState<{ name: string; summary: string; look: string; image: string; image_url: string; generated?: boolean; suggestion?: string } | null>(null);
  const seenPhotos = useRef<string[]>([]);
  const productRef = useRef<HTMLInputElement>(null);
  const [shopeeOpen, setShopeeOpen] = useState(false);
  const lookRef = useRef("");
  const attachRef = useRef<HTMLInputElement>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const [attached, setAttached] = useState<File[]>([]);
  const linkRef = useRef("");
  const [active, setActive] = useState(0);
  const [sent, setSent] = useState("");
  const [demo, setDemo] = useState("");
  const [changeText, setChangeText] = useState("");
  const [hint, setHint] = useState("");
  const orbitRef = useRef<HTMLDivElement>(null);
  // Luz que corre em volta da caixa: o ângulo é atualizado por script, então anda em qualquer navegador.
  useEffect(() => {
    let frame = 0; const begin = performance.now();
    const loop = (now: number) => {
      orbitRef.current?.style.setProperty("--cg-angle", `${(((now - begin) / 4500) * 360) % 360}deg`);
      frame = window.requestAnimationFrame(loop);
    };
    frame = window.requestAnimationFrame(loop);
    return () => window.cancelAnimationFrame(frame);
  }, [phase]);
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
  const [readingVideo, setReadingVideo] = useState(false);
  const videoRef2 = useRef<HTMLInputElement>(null);
  const [mName, setMName] = useState("");
  const [mLook, setMLook] = useState("");
  const [mVoice, setMVoice] = useState("");
  const [mFaces, setMFaces] = useState<string[]>([]);
  const faceRef = useRef<HTMLInputElement>(null);
  const selModel = models.find((m) => m.id === selModelId) ?? null;
  const [skillSaved, setSkillSaved] = useState(false);
  const chatId = useRef<number | null>(null);
  const [pinnedSkills, setPinnedSkills] = useState<PinnedSkill[]>([]);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    let local: ChatItem[] = [];
    try { const saved = JSON.parse(window.localStorage.getItem("gv-influencer-chats") ?? "[]"); if (Array.isArray(saved)) { local = saved.slice(0, 30); setChats(local); } } catch { /* sem armazenamento */ }
    void (async () => {
      // Os chats ficam no banco: aqui trazemos os da conta e enviamos uma vez os que só existiam neste navegador.
      try {
        const response = await fetch("/api/multiplier/clone/chats", { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json();
        const server: ChatItem[] = (Array.isArray(data.chats) ? data.chats : []).map((c: { id: string; title: string; project?: string; snap?: Snap }) => ({ id: Number(c.id), title: c.title, project: c.project || undefined, snap: c.snap }));
        let migrated = false;
        try { migrated = window.localStorage.getItem("gv-influencer-chats-synced") === "1"; } catch { /* sem armazenamento */ }
        const known = new Set(server.map((c) => c.id));
        setChats((current) => {
          // Só ficam fora do banco o chat aberto agora e, na primeira vez, os que existiam só neste navegador.
          const extra = current.filter((c) => !known.has(c.id) && (!migrated || c.id === chatId.current));
          if (!migrated) extra.forEach((c) => void saveRemote(c));
          const merged = [...server, ...extra].sort((x, y) => y.id - x.id).slice(0, 60);
          try { window.localStorage.setItem("gv-influencer-chats", JSON.stringify(merged)); window.localStorage.setItem("gv-influencer-chats-synced", "1"); } catch { /* sem armazenamento */ }
          return merged;
        });
      } catch { /* sem rede: segue com os chats deste navegador */ }
    })();
    try { const saved = JSON.parse(window.localStorage.getItem("gv-influencer-projects") ?? "[]"); if (Array.isArray(saved)) setProjects(saved); } catch { /* sem armazenamento */ }
    try {
      const params = new URLSearchParams(window.location.search);
      const incoming = params.get("prompt");
      if (incoming) { setPrompt(incoming.slice(0, 2000)); const sk = params.get("skill"); if (sk && SKILLS.some((item) => item.id === sk)) setSkill(sk as SkillId); }
    } catch { /* sem URL */ }
    setModels(loadModels());
    setPinnedSkills(loadPinned());
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

  const chosen = FLOW_CHOICES.find((item) => item.id === effectiveFlowId(model, flowAcct.plan)) ?? FLOW_CHOICES[1];
  const lower = chosen.id === "lower";

  async function fail(response: Response) {
    try { const data = await response.json(); setError(data?.detail === "TOKENS_EXHAUSTED" ? t("tokens") : data?.detail === "AI_QUOTA" ? t("quota") : t("error")); } catch { setError(t("error")); }
  }

  function reset() {
    chatId.current = null; setSkillSaved(false);
    setPhase("home"); setPrompt(""); setSkill(""); setBusy(""); setError(""); setQuestions([]); setQi(0); setPicked(null); setAnswers([]);
    setPersona({ name: "", age: "", look: "", setting: "" }); setSearches([]); setCopyText(""); setPins([]); setPin(null); setPhoto(null);
    setPrompts([]); setSummaries([]); setVideoCount(1); setBoards([]); setActive(0); setProductLook(""); setProductLink(""); setLinkOpen(false); setAttached([]); setFound(null); setNameOpen(false); setProductName(""); setEditOpen(false); setEditText("");
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

  async function searchProduct(again = false, override?: string) {
    const name = (override ?? productName).trim();
    if (override) setProductName(override);
    if (name.length < 2) return;
    if (!again) seenPhotos.current = [];
    setBusy("think"); setSearching(true); setError(""); setFound(null);
    try {
      const response = await fetch("/api/multiplier/clone/product-search", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, skip: seenPhotos.current }),
      });
      if (response.status === 404) { setError(t("notFound")); return; }
      if (!response.ok) { await fail(response); return; }
      const data = await response.json();
      if (typeof data.image_url === "string") seenPhotos.current.push(data.image_url);
      setFound({ name: String(data.name ?? name), summary: String(data.summary ?? ""), look: String(data.look ?? ""), image: String(data.image ?? ""), image_url: String(data.image_url ?? ""), generated: Boolean(data.generated), suggestion: typeof data.suggestion === "string" ? data.suggestion : "" });
    } catch { setError(t("error")); } finally { setBusy(""); setSearching(false); }
  }

  async function createProduct() {
    setBusy("think"); setCreating(true); setError("");
    let look = "";
    try {
      const response = await fetch("/api/multiplier/clone/product-create", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt, skill: skill && (skill as string) !== "other" ? skill : undefined }),
      });
      if (response.ok) {
        const data = await response.json();
        look = typeof data.look === "string" ? data.look : "";
        setFound({ name: String(data.name ?? ""), summary: String(data.summary ?? ""), look, image: String(data.image ?? ""), image_url: "", generated: true });
      }
    } catch { /* segue sem produto criado */ }
    setCreating(false);
    void runBrief(look, "");
  }

  async function editBrief() {
    const extra = editText.trim().slice(0, 600);
    if (!extra) return;
    setEditOpen(false); setEditText(""); setError("");
    const next = [...answers, { question: t("editLabel"), answer: extra }];
    setAnswers(next); setPrompt((current) => `${current}\n${extra}`.slice(0, 2000));
    setPhase("ask"); setBusy("build");
    try { const data = await brief(next); if (data) takeBrief(data); else setPhase("approve"); } catch { setError(t("error")); setPhase("approve"); } finally { setBusy(""); }
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

  async function answer(skipped: boolean, direct?: string) {
    const current = questions[qi];
    const chosen = direct ?? (isOther ? otherText.trim() : picked);
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

  // Sem foto da pessoa: busca uma modelo de referência (web, banco de fotos ou criada por IA) e cria com ela.
  async function autoReference() {
    setBusy("pins"); setError("");
    try {
      const response = await fetch("/api/multiplier/clone/influencer-reference", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ look: persona.look, age: persona.age, setting: persona.setting }),
      });
      if (response.ok) {
        const data = await response.json();
        if (typeof data.image === "string" && data.image.startsWith("data:image/")) {
          const file = await dataUrlToFile(data.image, "modelo.jpg");
          setPin({ id: "auto", thumb: data.image, full: data.image });
          setBusy("");
          void writePrompt(file, null, true);
          return;
        }
      }
    } catch { /* sem modelo: segue sem foto */ }
    setBusy("");
    void writePrompt(null, null);
  }

  // Foto achada pela IA vem como imagem embutida: vira arquivo; as do Pinterest seguem pelo endereço.
  async function pickPin(item: Pin) {
    if (item.full.startsWith("data:image/")) { void writePrompt(await dataUrlToFile(item.full, "modelo.jpg"), item); return; }
    void writePrompt(null, item);
  }

  async function writePrompt(file: File | null, chosenPin: Pin | null, keepPin = false, opts?: { persona?: Persona; extra?: string }) {
    setPhoto(file); if (!keepPin) setPin(chosenPin);
    setPhase("prompt"); setBusy("prompt"); setError("");
    try {
      const form = new FormData();
      Object.entries({ ...(opts?.persona ?? persona), extra: opts?.extra ?? "" }).forEach(([key, value]) => form.append(key, value));
      if (file) form.append("image", file); else if (chosenPin) form.append("image_url", chosenPin.full);
      const response = await fetch("/api/multiplier/clone/influencer-prompt", { method: "POST", body: form });
      if (!response.ok) { await fail(response); setPhase("photos"); return; }
      const data = await response.json();
      setPrompts(Array.isArray(data.prompts) ? data.prompts : []);
      mark("prompt");
      setSummaries(Array.isArray(data.summaries) ? data.summaries : []);
    } catch { setError(t("error")); setPhase("photos"); } finally { setBusy(""); }
  }

  async function buildBoards() {
    setBusy("board"); setError(""); setPhase("board");
    try {
      const make = async (i: number): Promise<Board | null> => {
        const response = await fetch("/api/multiplier/clone/influencer-storyboard", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            copy: copyText, scene_count: SCENES, persona: { ...persona, look: persona.look + (style.avatarMix && videoCount > 1 ? `. Appearance for this video: ${AVATAR_MIX[i % AVATAR_MIX.length]}` : "") + (SETTINGS[style.setting] ? `. Setting: ${SETTINGS[style.setting]}` : "") + (selModel?.voice ? `. Voice: ${selModel.voice}` : ""), extra: "" }, language: style.voice || LANG_CODE[lang], camera: style.format === "pov" || style.format === "recipe" ? "pov" : style.camera, format: style.format, captions: style.captions, voice_tone: style.tone, voice_custom: style.custom, cadence: "natural", energy: "calm",
            angle: videoCount > 1 && vary.hook ? ANGLES[i % ANGLES.length] : "",
            body_style: videoCount > 1 && vary.body ? BODIES[i % BODIES.length] : "",
            cta: videoCount > 1 && vary.cta ? CTAS[lang][i % CTAS[lang].length] : (CTA_STYLE[lang][style.cta] ?? ""),
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
      label: `Vídeo ${String(v + 1).padStart(2, "0")}`,
      base: v,
      scenes: item.scenes.map((_, index) => ({ imagePrompt: item.imagePrompts[index] ?? "", videoPrompt: item.videoPrompts[index] ?? "", file: `Video${String(v + 1).padStart(2, "0")}_Cena${String(index + 1).padStart(2, "0")}.mp4`, src: index })),
    })),
  }, null, 2);

  // Pacote pronto = vai sozinho para a extensão, que abre o Flow e gera as imagens e os vídeos. Sem copiar e colar.
  const flowLabel = () => productName || prompt.slice(0, 60) || "Influencer";
  const sentFor = useRef("");
  const [flowSend, setFlowSend] = useState<"" | "sending" | "ok" | "manual">("");
  const deliver = () => {
    setFlowSend("sending");
    void pushFlowPackage(flowPackage(), flowLabel()).then((ok) => {
      if (ok) { setFlowSend("ok"); return; }
      setFlowSend("manual");
      window.open(FLOW_URL, "_blank", "noopener");
    });
  };
  const boardsKey = boards.map((item) => item.videoPrompts.join("|")).join("##");
  // Antes de gerar: confere o produto, a copy e os prompts contra a política da Shopee Vídeo e pede confirmação se houver risco.
  const policyHits = checkPolicy(productName, prompt, boards.map((item) => item.scenes.map((scene) => scene.line).join(" ") + " " + item.videoPrompts.join(" ")).join(" "));
  const policyKey = `${boardsKey}#${policySignature(policyHits)}`;
  const [policyOk, setPolicyOk] = useState("");
  const policyBlocked = policyHits.length > 0 && policyOk !== policyKey;
  useEffect(() => {
    if (phase !== "board" || busy !== "" || !boards.length || policyBlocked || sentFor.current === boardsKey) return;
    sentFor.current = boardsKey;
    deliver();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, busy, boardsKey, policyBlocked]);
  // Mais um take de uma cena só: manda um pacote de uma cena; os outros vídeos continuam na biblioteca.
  const retakes = useRef<Record<string, number>>({});
  const retake = (vbase: number, sbase: number, kind: TakeKind = "same") => {
    const item = boards[vbase];
    if (!item) return;
    const key = `${vbase}-${sbase}`;
    const n = (retakes.current[key] ?? 1) + 1;
    retakes.current[key] = n;
    const pad2 = (x: number) => String(x).padStart(2, "0");
    const pkg = JSON.parse(flowPackage()) as { videos: unknown[] };
    pkg.videos = [{
      title: `${persona.name || "Influencer"} ${vbase + 1}`, label: `Vídeo ${pad2(vbase + 1)} · take ${n}${kind === "same" ? "" : ` · ${takeKind(kind).label.toLowerCase()}`}`, base: vbase,
      scenes: [{ imagePrompt: withTake(item.imagePrompts[sbase] ?? "", kind), videoPrompt: withTake(item.videoPrompts[sbase] ?? "", kind), file: `Video${pad2(vbase + 1)}_Cena${pad2(sbase + 1)}${takeTag(n, kind)}.mp4`, src: sbase, label: `Cena ${pad2(sbase + 1)}` }],
    }];
    void pushFlowPackage(JSON.stringify(pkg, null, 2), flowLabel());
  };

  async function copyOut(key: string, text: string) {
    try { await navigator.clipboard.writeText(text); setSent(key); window.setTimeout(() => setSent(""), 1800); } catch { /* o texto continua na tela */ }
  }

  const snapshot = (): Snap => ({ style, phase, prompt, skill, answers, persona, searches, copyText, pins, pin, prompts, summaries, videoCount, sceneCount, vary, model, boards, productLook, productLink, worked, questions, qi, productName, found: found ? { ...found, image: "" } : null });
  const snapKey = JSON.stringify(snapshot());
  useEffect(() => {
    if (!hydrated || chatId.current === null || phase === "home") return;
    const id = chatId.current;
    setChats((current) => {
      const next = current.map((c) => (c.id === id ? { ...c, title: prompt.slice(0, 60) || c.title, project: project || c.project, snap: JSON.parse(snapKey) } : c));
      try { window.localStorage.setItem("gv-influencer-chats", JSON.stringify(next)); } catch { /* sem armazenamento */ }
      return next;
    });
    const timer = window.setTimeout(() => {
      const item = { id, title: prompt.slice(0, 60), project: project || undefined, snap: JSON.parse(snapKey) as Snap };
      void saveRemote(item);
    }, 900);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapKey, hydrated]);

  function openChat(chat: ChatItem) {
    reset();
    chatId.current = chat.id;
    setPrompt(chat.title);
    const snap = chat.snap as Record<string, never> | undefined;
    if (!snap) return;
    setPrompt((snap.prompt as string) || chat.title); setSkill((snap.skill as SkillId) || "");
    setQuestions((snap.questions as unknown as Question[]) ?? []); setQi((snap.qi as number) ?? 0);
    setProductName((snap.productName as string) ?? ""); setNameOpen(Boolean(snap.productName)); setFound((snap.found as never) ?? null);
    setAnswers(snap.answers ?? []); setPersona(snap.persona ?? { name: "", age: "", look: "", setting: "" }); setSearches(snap.searches ?? []); setCopyText((snap.copyText as string) ?? "");
    setPins(snap.pins ?? []); setPin(snap.pin ?? null); setPrompts(snap.prompts ?? []); setSummaries(snap.summaries ?? []); setVideoCount((snap.videoCount as number) ?? 1); setSceneCount((snap.sceneCount as number) ?? DEFAULT_SCENES);
    setStyle({ ...DEFAULT_STYLE, ...((snap.style as Partial<StyleState>) ?? {}) }); setVary(snap.vary ?? { hook: true, body: false, cta: false }); setModel((snap.model as string) ?? model); setBoards(snap.boards ?? []); setProductLook((snap.productLook as string) ?? ""); setProductLink((snap.productLink as string) ?? "");
    lookRef.current = (snap.productLook as string) ?? ""; linkRef.current = (snap.productLink as string) ?? "";
    setWorked(snap.worked ?? {}); setProject(chat.project ?? "");
    const saved = (snap.phase as Phase) ?? "home";
    // Continua exatamente de onde parou; só volta uma etapa se a pergunta atual se perdeu no meio.
    setPhase(saved === "ask" && !((snap.questions as unknown[]) ?? []).length ? "intake" : saved === "home" ? "intake" : saved);
  }

  async function addFaces(files: FileList | null) {
    if (!files?.length) return;
    const urls = await Promise.all(Array.from(files).slice(0, 3).map((file) => fileToDataUrl(file)));
    setMFaces(urls);
  }
  /** Vídeo da pessoa: tira alguns quadros como rosto e a IA descreve como ela é para preencher o modelo. */
  async function addFromVideo(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("video/")) { setError("Envie um arquivo de vídeo (mp4, mov ou webm)."); return; }
    setError(""); setReadingVideo(true);
    try {
      const frames = await videoFrames(file);
      if (!frames.length) { setError("Não consegui ler esse vídeo. Tente outro arquivo ou anexe fotos do rosto."); return; }
      setMFaces(frames);
      const form = new FormData();
      await Promise.all(frames.map(async (src, n) => form.append("images", await dataUrlToFile(src), `quadro-${n + 1}.jpg`)));
      const response = await fetch("/api/multiplier/clone/person-look", { method: "POST", body: form });
      const data = await response.json().catch(() => null);
      if (response.ok && typeof data?.look === "string" && data.look.trim()) {
        setMLook((current) => current.trim() || `${data.age ? `${data.age}, ` : ""}${data.look}`.slice(0, 300));
        setMName((current) => current.trim() || file.name.replace(/\.[^.]+$/, "").replace(/[._-]+/g, " ").trim().slice(0, 40) || "Minha influencer");
      }
    } catch { setError("Não consegui descrever a pessoa do vídeo. Os quadros foram anexados como rosto; escreva como ela é."); } finally { setReadingVideo(false); }
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

  function deleteChat(id: number) { void fetch(`/api/multiplier/clone/chats/${id}`, { method: "DELETE" }).catch(() => undefined); persistChats(chats.filter((c) => c.id !== id)); if (chatId.current === id) reset(); }
  function addProject() {
    const name = newProject.trim().slice(0, 40);
    if (!name) return;
    persistProjects([...projects, { id: String(Date.now()), name }]);
    setNewProject("");
  }
  function applyPinned(item: PinnedSkill) {
    if (started) return;
    setPrompt(item.prompt.slice(0, 2000)); setSkill((SKILLS.some((x) => x.id === item.skill) ? item.skill : "") as SkillId | "");
    if (item.style) setStyle((current) => ({ ...current, ...(item.style as Partial<typeof current>) }));
    if (item.model && FLOW_CHOICES.some((m) => m.id === item.model)) { setModel(item.model); setModelChosen(true); }
    if (item.videoCount) setVideoCount(item.videoCount);
  }
  function saveAsSkill() {
    const list = loadMySkills();
    saveMySkills([{ id: String(Date.now()), title: prompt.slice(0, 60), prompt, skill: skill && (skill as string) !== "other" ? skill : "", style, model, videoCount }, ...list]);
    setSkillSaved(true);
  }

  const shown = EXAMPLES.filter((item) => filter === "all" || item.skill === filter);
  const q = questions[qi];
  const totalCredits = chosen.credits * SCENES * videoCount;
  const started = phase !== "home";
  const canChange = started && Boolean(persona.name) && busy === "";

  // Depois que a influencer existe, a caixa aceita ajustes: sugere um, apaga e traz outro.
  useEffect(() => {
    if (!canChange || changeText || typeof window === "undefined") { setHint(""); return; }
    const texts = CHANGE_HINTS[lang];
    let ti = 0; let n = 0; let erasing = false; let timer = 0;
    const tick = () => {
      const full = texts[ti % texts.length];
      if (!erasing) { n += 1; setHint(full.slice(0, n)); if (n >= full.length) { erasing = true; timer = window.setTimeout(tick, 2200); return; } }
      else { n -= 2; setHint(full.slice(0, Math.max(n, 0))); if (n <= 0) { erasing = false; n = 0; ti += 1; timer = window.setTimeout(tick, 500); return; } }
      timer = window.setTimeout(tick, erasing ? 18 : 40);
    };
    timer = window.setTimeout(tick, 700);
    return () => window.clearTimeout(timer);
  }, [canChange, changeText, lang]);

  async function applyChange() {
    const extra = changeText.trim().slice(0, 400);
    if (!extra || !canChange) return;
    setChangeText(""); setError("");
    const keep = phase;
    const next = [...answers, { question: t("changeQ"), answer: extra }];
    setAnswers(next); setPrompt((current) => `${current}\n${extra}`.slice(0, 2000));
    setBusy("build");
    try {
      const data = await brief(next);
      if (!data) return;
      const updated: Persona = selModel ? selModel.persona : data.persona ?? persona;
      setPersona(updated); setSearches(Array.isArray(data.searches) ? data.searches : searches); setCopyText(data.copy || copyText);
      if (prompts.length) {
        await writePrompt(photo, pin, true, { persona: updated, extra });
        // Etapas depois do prompt: os roteiros antigos não valem mais, então volta para escolher de novo.
        if (["count", "model", "cost", "board"].includes(keep)) { setBoards([]); setQStep(0); setPhase("count"); }
      } else setPhase(keep === "ask" || keep === "intake" ? "approve" : keep);
      setSent(t("changeSent")); window.setTimeout(() => setSent(""), 2500);
    } catch { setError(t("error")); } finally { setBusy(""); }
  }
  const STYLE_ROWS = () => ([
            ["format", t("styFormat"), [["talk", t("fmtTalk")], ["pov", t("fmtPov")], ["recipe", t("fmtRecipe")]]],
            ["setting", t("stySetting"), [["", t("styAuto")], ["home", t("setHome")], ["farm", t("setFarm")], ["office", t("setOffice")], ["car", t("setCar")], ["outdoor", t("setOutdoor")]]],
            ["avatarMix", t("styAvatarMix"), [[false, t("noWord")], [true, t("yesWord")]]],
            ["cta", t("styCta"), [["bio", t("ctaBio")], ["comment", t("ctaComment")], ["keyword", t("ctaKeyword")]]],
            ["captions", t("styCaptions"), [[false, t("styNo")], [true, t("styYes")]]],
            ["voice", t("styVoice"), [["", `${t("styAuto")} (${LANG_NAMES[LANG_CODE[lang]]})`], ["pt-BR", "Português (Brasil)"], ["pt-PT", "Português (Portugal)"], ["en", "English"], ["es", "Español"], ["fr", "Français"], ["de", "Deutsch"], ["it", "Italiano"]]],
            ["tone", t("styTone"), [["", t("styAuto")], ["calm", t("toneCalm")], ["lively", t("toneLively")], ["deep", t("toneDeep")], ["soft", t("toneSoft")], ["young", t("toneYoung")], ["mature", t("toneMature")]]],
            ["camera", t("styCamera"), [["selfie", t("camSelfie")], ["tripod", t("camTripod")], ["pov", t("camPov")], ["cinematic", t("camCinema")]]],
            ["product", t("styProduct"), [[true, t("styYes")], [false, t("styNo")]]],
          ] as [keyof typeof style, string, [string | boolean, string][]][]);

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

  const recreateExample = (item: (typeof EXAMPLES)[number], card: HTMLElement | null) => {
    setPrompt(item.prompt[lang]); setSkill(item.skill);
    setAttachedFx((n) => n + 1);
    if (typeof window === "undefined") return;
    const box = orbitRef.current; // o wrapper não remonta, ao contrário do campo
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (!box) return;
    if (reduce || !card) { box.scrollIntoView?.({ block: "center" }); return; } // sem animação, mas sempre leva até o prompt
    const img = card.querySelector("img");
    const from = (img ?? card).getBoundingClientRect();
    // Sobe devagar até o campo do prompt (rolagem própria, mais lenta que a do navegador).
    const DURATION = 1300, TOP_GAP = 110;
    let scroller: HTMLElement | null = box.parentElement;
    while (scroller && scroller !== document.body && !(scroller.scrollHeight > scroller.clientHeight && /(auto|scroll)/.test(getComputedStyle(scroller).overflowY))) scroller = scroller.parentElement;
    const useWindow = !scroller || scroller === document.body;
    const startTop = useWindow ? window.scrollY : scroller!.scrollTop;
    const boxTop = box.getBoundingClientRect().top;
    const containerTop = useWindow ? 0 : scroller!.getBoundingClientRect().top;
    const endTop = Math.max(0, startTop + (boxTop - containerTop) - TOP_GAP);
    const started = performance.now();
    const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
    const step = (now: number) => {
      const k = Math.min(1, (now - started) / DURATION);
      const y = startTop + (endTop - startTop) * ease(k);
      if (useWindow) window.scrollTo(0, y); else scroller!.scrollTop = y;
      if (k < 1) { window.requestAnimationFrame(step); return; }
      // Garantia: se o campo não ficou à vista (outro container rolável, layout diferente), centraliza.
      const top = box.getBoundingClientRect().top;
      if (top < 0 || top > window.innerHeight * 0.6) box.scrollIntoView?.({ behavior: "smooth", block: "center" });
    };
    window.requestAnimationFrame(step);
    // A miniatura do card acompanha a subida e pousa onde o prompt aparece.
    const toLeft = box.getBoundingClientRect().left + 28, toTop = (useWindow ? 0 : containerTop) + TOP_GAP + 30;
    const chip = document.createElement("div");
    chip.setAttribute("aria-hidden", "true");
    chip.style.cssText = `position:fixed;z-index:80;left:${from.left}px;top:${from.top}px;width:${from.width}px;height:${from.height}px;border-radius:20px;overflow:hidden;pointer-events:none;box-shadow:0 20px 60px -10px #7B3FE4;background:#17161b url(${img?.getAttribute("src") ?? ""}) center top/cover`;
    document.body.appendChild(chip);
    const dx = toLeft - from.left, dy = toTop - from.top;
    const anim = chip.animate?.([
      { transform: "translate(0,0) scale(1)", opacity: 1 },
      { transform: `translate(${dx}px,${dy}px) scale(${Math.min(0.14, 90 / from.width)})`, opacity: 0.2 },
    ], { duration: DURATION, easing: "cubic-bezier(.6,.05,.3,1)" });
    if (anim) anim.onfinish = () => chip.remove(); else chip.remove();
    window.setTimeout(() => chip.remove(), DURATION + 300);
  };

  const composer = (
    <div ref={orbitRef} className="cg-orbit relative">
    <div key={attachedFx} className={cn("relative rounded-[26px] bg-[#1a191d] p-5 ring-1 ring-white/10 shadow-[0_20px_60px_-30px_#000]", attachedFx > 0 && "cg-attach")} data-testid="chat-composer">
      {attachedFx > 0 && !started && <span key={`b${attachedFx}`} className="cg-attach-badge pointer-events-none absolute -top-3 left-6 rounded-full bg-[#7B3FE4] px-3 py-1 text-[11px] font-medium text-white shadow-lg">📎 {t("promptAttached")}</span>}
      <textarea ref={promptRef} value={started ? changeText : prompt} onChange={(event) => (started ? setChangeText(event.target.value) : setPrompt(event.target.value))} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); if (started) void applyChange(); else if (!busy && prompt.trim().length >= 8) start(); } }} rows={!started && prompt.length > 220 ? 8 : 3} maxLength={2000} disabled={started && !canChange} aria-label={lang === "en" ? "Describe the influencer" : lang === "es" ? "Describe a la influencer" : "Descreva a influencer"}
        placeholder={phase === "home" ? (demo ? `${demo}▍` : t("ph")) : canChange ? (hint ? `${hint}▍` : t("changePh")) : t("follow")}
        className={cn("min-h-[96px] w-full resize-none bg-transparent px-1 py-1 text-lg outline-none placeholder:text-muted-foreground/70 disabled:opacity-60", attachedFx > 0 && !started && "cg-reveal")} />
      <div className="mt-2 flex items-center gap-2">
        <input ref={attachRef} type="file" multiple accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label={t("attachPhoto")}
          onChange={(event) => { const files = Array.from(event.target.files ?? []).slice(0, 3); if (files.length) setAttached(files); event.target.value = ""; }} />
        <button type="button" disabled={started} title={t("attachPhoto")} aria-label={t("attachPhoto")} onClick={() => attachRef.current?.click()}
          className="relative grid size-9 place-items-center rounded-full text-muted-foreground hover:bg-white/5 hover:text-foreground disabled:opacity-60">
          <Plus className="size-5" />
          {attached.length > 0 && <span className="absolute -right-0.5 -top-0.5 grid size-4 place-items-center rounded-full bg-[#7B3FE4] text-[10px] text-white">{attached.length}</span>}
        </button>
        {attached.length > 0 && !started && <button type="button" aria-label={t("stop")} onClick={() => setAttached([])} className="text-muted-foreground hover:text-foreground"><X className="size-3.5" /></button>}
        <select aria-label={t("modelLabel")} value={effectiveFlowId(model, flowAcct.plan)} onChange={(event) => { setModel(event.target.value); saveFlowCategory(event.target.value); setModelChosen(true); }} disabled={started}
          className="max-w-[14rem] truncate rounded-full bg-white/5 px-3 py-1.5 text-xs font-medium text-foreground disabled:opacity-60 [&>option]:bg-[#1a191d] [&>option]:text-white">
          {visibleFlowChoices(flowAcct.plan).map((item) => <option key={item.id} value={item.id}>{item.id === "lower" ? "Lower Priority" : item.name} · {item.credits === 0 ? `0 ${t("creditsWord")}` : `${item.credits} ${t("creditsWord")}/${t("scene").toLowerCase()}`}</option>)}
        </select>
        {projects.length > 0 && (
          <select aria-label={t("projects")} value={project} onChange={(event) => setProject(event.target.value)} disabled={started}
            className="max-w-[8rem] truncate rounded-full bg-white/5 px-3 py-1.5 text-xs text-muted-foreground disabled:opacity-60">
            <option value="">{t("noProject")}</option>
            {projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        )}
        <span className="ml-auto inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground">✋ {t("askFirst")}</span>
        <button type="button" aria-label={t("send")} title={t("send")} onClick={() => (started ? void applyChange() : start())} disabled={started ? !canChange || changeText.trim().length < 3 : prompt.trim().length < 8}
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#A98BFF] to-[#7B3FE4] text-white disabled:opacity-40">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-5" />}
        </button>
      </div>
      {sent === t("changeSent") && <p role="status" className="mt-2 px-1 text-xs text-[#5BD69A]">✓ {sent}</p>}
      <p className="mt-2 px-1 text-[11px] text-muted-foreground" data-testid="cost-estimate">
        {chosen.credits === 0 ? t("estFree") : `${t("estimate")}: ${chosen.credits} ${t("creditsWord")} ${t("perScene")} · ${SCENES} ${SCENES === 1 ? t("scene").toLowerCase() : t("scenesWord")} = ~${chosen.credits * SCENES} ${t("creditsWord")} / ${t("video")}`}
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
      {pinnedSkills.length > 0 && (
        <div className="space-y-0.5 px-1 pb-1" data-testid="pinned-sidebar">
          <p className="px-1 pt-1 text-[11px] uppercase tracking-wide text-muted-foreground">{t("pinnedTitle")}</p>
          {pinnedSkills.map((item) => (
            <button key={item.id} type="button" disabled={started} onClick={() => applyPinned(item)} className="flex w-full items-center gap-2 truncate rounded-[10px] px-2 py-1.5 text-left text-sm hover:bg-white/5 disabled:opacity-50">
              <span aria-hidden>{item.emoji ?? "⚡"}</span><span className="truncate">{item.title}</span>
            </button>
          ))}
        </div>
      )}
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
          <p data-testid="home-steps" className="text-center text-xs text-muted-foreground"><b className="text-foreground">1</b> Escolha quem vai aparecer · <b className="text-foreground">2</b> Escolha o tipo de vídeo · <b className="text-foreground">3</b> Escreva ou ajuste o texto e envie</p>
          {pinnedSkills.length > 0 && (
            <div className="flex flex-wrap items-center gap-2" data-testid="pinned-home">
              <span className="text-xs text-muted-foreground">{t("pinnedTitle")}:</span>
              {pinnedSkills.map((item) => <Chip key={item.id} onClick={() => applyPinned(item)}>{item.emoji ?? "⚡"} {item.title}</Chip>)}
            </div>
          )}
          <div className="space-y-3" data-testid="my-models">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground"><b className="text-foreground">1</b> {t("myModel")}:</span>
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
                  <input ref={videoRef2} type="file" accept="video/*" className="sr-only" aria-label="Anexar vídeo da pessoa" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; void addFromVideo(file); }} />
                  <Button type="button" variant="outline" className="rounded-full" disabled={readingVideo} onClick={() => videoRef2.current?.click()}>{readingVideo ? <Loader2 className="size-4 animate-spin" /> : <Film className="size-4" />} {readingVideo ? "Lendo o vídeo…" : "Anexar vídeo"}</Button>
                  {mFaces.map((src, n) => (
                    <span key={n} className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={src} alt="" className="h-12 rounded-md" />
                      <button type="button" aria-label={`Remover rosto ${n + 1}`} onClick={() => setMFaces((current) => current.filter((_, i) => i !== n))} className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full bg-black/70 text-[10px] text-white">×</button>
                    </span>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">{t("modelNote")}</p>
                <Button type="button" className="rounded-full" disabled={mName.trim().length < 2} onClick={saveModel}>{t("saveModel")}</Button>
              </div>
            )}
          </div>
          <div className="space-y-2" data-testid="preset-models">
            <span className="text-xs text-muted-foreground">{t("presetModels")}:</span>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {PRESET_MODELS.map((preset) => {
                const owned = models.find((m) => m.id === preset.id);
                const choose = () => {
                  if (!owned) { const next = [{ id: preset.id, ...preset.model, faces: [] }, ...models]; if (!saveModels(next)) { setError(t("error")); return; } setModels(next); }
                  setSelModelId(preset.id);
                  // Coloca o texto pronto da modelo na caixa (sem apagar o que a pessoa escreveu) e leva até ela, pronta para enviar.
                  const brief = PRESET_BRIEFS[preset.id];
                  const mine = prompt.trim() && !Object.values(PRESET_BRIEFS).includes(prompt) ? prompt : "";
                  if (brief && !mine) setPrompt(brief);
                  window.setTimeout(() => { promptRef.current?.focus({ preventScroll: true }); orbitRef.current?.scrollIntoView?.({ behavior: "smooth", block: "center" }); }, 60);
                };
                const on = selModelId === preset.id;
                return (
                  <div key={preset.id} className={cn("min-w-0 space-y-2 overflow-hidden rounded-[14px] border bg-card p-3 text-xs", on ? "border-[#7B3FE4]" : "border-border")}>
                    <button type="button" onClick={choose} aria-label={`${t("usePreset")} ${preset.name}`} className="flex w-full items-center gap-3 text-left">
                      {preset.photo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={preset.photo} alt={preset.name} loading="lazy" className="size-16 shrink-0 rounded-full object-cover ring-2 ring-[#7B3FE4]/50" />
                      ) : (
                        <div aria-hidden className="grid size-16 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#7B3FE4]/40 to-[#F0466B]/25 text-xl font-semibold text-white/80">{preset.name.charAt(0)}</div>
                      )}
                      <div className="min-w-0 text-sm font-medium">{preset.name}<span className="block text-xs font-normal text-muted-foreground">{preset.scene}</span></div>
                    </button>
                    <p className="line-clamp-3 text-muted-foreground">{PRESET_BRIEFS[preset.id] ?? preset.model.persona.look}</p>
                    <Button type="button" size="sm" variant={on ? "default" : "outline"} className="rounded-full" onClick={choose}>{on ? `✓ ${t("usePreset")}` : t("usePreset")}</Button>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">{t("presetNote")}</p>
          </div>
          <div className="space-y-2" data-testid="home-niche">
            <span className="text-xs text-muted-foreground"><b className="text-foreground">2</b> Tipo de vídeo:</span>
            {nicheRow}
          </div>
          <div className="space-y-2" data-testid="home-composer">
            <span className="text-xs text-muted-foreground"><b className="text-foreground">3</b> Escreva ou ajuste o texto e envie:</span>
            {composer}
          </div>
          <div className="space-y-4 pt-4" data-testid="influencer-examples">
            <div role="group" aria-label={t("all")} className="flex flex-wrap justify-center gap-1.5">
              {([["all", t("all")], ...SKILLS.map((s) => [s.id, `${s.emoji} ${s.name[lang]}`])] as [SkillId | "all", string][]).map(([id, label]) => (
                <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)}
                  className={cn("rounded-[10px] px-3.5 py-1.5 text-xs font-medium", filter === id ? "bg-white/10 text-foreground" : "text-muted-foreground hover:bg-white/5")}>{label}</button>
              ))}
            </div>
            <div className="grid gap-x-4 gap-y-6 sm:grid-cols-2 xl:grid-cols-3">
              {shown.map((item) => (
                <button key={item.id} type="button" onClick={(event) => recreateExample(item, event.currentTarget)} className="group cursor-pointer text-left">
                  <div className="relative aspect-[16/10] overflow-hidden rounded-[20px] ring-1 ring-white/10" style={{ background: `radial-gradient(120% 90% at 20% 0%, ${item.from}66, transparent 60%), radial-gradient(100% 90% at 100% 100%, ${item.to}55, transparent 60%), #17161b` }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/influencers/${item.id}.jpg`} alt={item.title[lang]} loading="lazy" className="absolute inset-0 size-full object-cover object-top transition duration-500 group-hover:scale-105" />
                    <span aria-hidden className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/70 to-transparent" />
                    <span className="absolute inset-0 grid place-items-center bg-black/25 opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100"><span className="rounded-full bg-[#7B3FE4] px-4 py-1.5 text-xs font-semibold text-white shadow-lg">{t("recreate")}</span></span>
                    <span className="absolute bottom-3 left-3 rounded-full bg-black/55 px-2.5 py-0.5 text-[10px] font-medium text-white/90">{SKILLS.find((x) => x.id === item.skill)?.name[lang]}</span>
                  </div>
                  <span className="mt-3 flex items-center gap-3">
                    <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-[9px] bg-white/10 text-sm">{item.emoji}</span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.title[lang]}</span>
                    <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">⚡ Skill</span>
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
            <Button type="button" variant="outline" className="rounded-full" onClick={() => { setNameOpen(true); setLinkOpen(false); }} disabled={busy !== ""}><Search className="size-4" /> {t("typeName")}</Button>
            <Button type="button" variant="outline" className="rounded-full" onClick={() => { setLinkOpen(true); setNameOpen(false); }} disabled={busy !== ""}>{t("pasteLink")}</Button>
            <Button type="button" variant="outline" className="rounded-full" onClick={() => setShopeeOpen((open) => !open)} disabled={busy !== ""}>Importar da Shopee</Button>
            <Button type="button" variant="ghost" className="rounded-full" onClick={() => void createProduct()} disabled={busy !== ""}>{t("noProduct")}</Button>
          </div>
          {shopeeOpen && <ShopeeImport disabled={busy !== ""} onUse={(files, title) => { if (title) setProductName(title); setShopeeOpen(false); void readProduct(files); }} />}
          {nameOpen && !found && (
            <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); void searchProduct(); }}>
              <input value={productName} onChange={(event) => setProductName(event.target.value)} maxLength={80} aria-label={t("typeName")} placeholder={t("namePh")} className="min-w-0 flex-1 rounded-full border border-border bg-background px-4 py-2 text-sm" />
              <Button type="submit" className="rounded-full" disabled={busy !== "" || productName.trim().length < 2}>{t("searchBtn")}</Button>
            </form>
          )}
          {found && (
            <div data-testid="product-found" className="flex gap-3 rounded-[18px] border border-white/10 bg-white/[0.03] p-3">
              {found.image
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={found.image} alt={found.name} className="size-24 shrink-0 rounded-xl bg-white object-contain" />
                : <div className="grid size-24 shrink-0 place-items-center rounded-xl bg-white/5 px-2 text-center text-[11px] text-muted-foreground">{t("photoMissing")}</div>}
              <div className="min-w-0 space-y-2">
                <p className="font-medium text-foreground">{found.name}</p>
                {found.summary && <p className="text-xs text-muted-foreground">{found.summary}</p>}
                {found.generated && <p className="text-[11px] text-[#A98BFF]">{t("aiPhoto")}</p>}
                {found.suggestion && (
                  <p className="text-xs">{t("didYouMean")} <button type="button" className="font-semibold text-[#A98BFF] underline underline-offset-2" disabled={busy !== ""} onClick={() => void searchProduct(false, found.suggestion)}>{found.suggestion}</button>?</p>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" className="rounded-full" disabled={busy !== ""} onClick={() => { setProductLook(found.look); void runBrief(found.look, ""); }}>{t("useThis")}</Button>
                  <Button type="button" size="sm" variant="outline" className="rounded-full" disabled={busy !== ""} onClick={() => void searchProduct(true)}>{t("searchAgain")}</Button>
                </div>
              </div>
            </div>
          )}
          {linkOpen && (
            <div className="flex gap-2">
              <input value={productLink} onChange={(event) => setProductLink(event.target.value)} maxLength={300} aria-label={t("pasteLink")} placeholder={t("linkPh")} className="min-w-0 flex-1 rounded-full border border-border bg-background px-4 py-2 text-sm" />
              <Button type="button" className="rounded-full" disabled={!/^https?:\/\//i.test(productLink.trim())} onClick={() => void runBrief("", productLink.trim())}>{t("addLink")}</Button>
            </div>
          )}
        </Msg>
      )}
      {busy === "think" && phase === "intake" && creating && <Working hints={[t("createHint1"), t("createHint2"), t("createHint3")]} text={t("creatingProduct")} />}
      {busy === "think" && phase === "intake" && searching && <Working hints={[t("searchHint1"), t("searchHint2"), t("searchHint3")]} text={t("searchingProduct")} />}
      {busy === "think" && phase === "intake" && !searching && !creating && <Working hints={[t("hint1"), t("hint2"), t("hint3")]} text={t("reading")} />}
      {busy === "think" && phase !== "intake" && <Working hints={[t("hint1"), t("hint2"), t("hint3")]} text={t("think")} />}
      {error && <p role="alert" className="rounded-[14px] border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">{error}</p>}

      {answers.length > 0 && <div className="flex flex-wrap justify-center gap-2">{answers.map((a) => <span key={a.question} className="rounded-full bg-muted/50 px-3 py-1 text-xs text-muted-foreground">✓ {a.answer}</span>)}</div>}

      {q && (
        <Msg testid="chat-question">
          <p className="font-medium">{q.question}</p>
          <div role="radiogroup" aria-label={q.question} className="grid gap-2">
            {q.options.slice(0, 3).map((option, n) => (
              <button key={option.label} type="button" role="radio" aria-checked={picked === option.label} onClick={() => { setPicked(option.label); setIsOther(false); void answer(false, option.label); }}
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
            {qi > 0 && <Button type="button" variant="ghost" className="mr-auto rounded-full" onClick={() => { const before = questions[qi - 1]?.question; setAnswers((list) => list.filter((a) => a.question !== before)); setPicked(null); setIsOther(false); setOtherText(""); setQi(qi - 1); }}><ArrowLeft className="size-4" /> {t("back")}</Button>}
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
            {[persona.name, [persona.age, persona.look].filter(Boolean).join(", "), persona.setting, found?.name ? `${found.name}${found.generated ? " · IA" : ""}` : ""].filter(Boolean).map((line) => (
              <li key={line} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-[#5BD69A]" /> {line}</li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">{t("approveCost")}</p>
          {editOpen && (
            <div className="space-y-2">
              <textarea value={editText} onChange={(event) => setEditText(event.target.value)} maxLength={600} rows={3} aria-label={t("editLabel")} placeholder={t("editLabel")} className="w-full rounded-[14px] border border-border bg-background px-3 py-2 text-sm" />
              <div className="flex justify-end"><Button type="button" size="sm" className="rounded-full" disabled={!editText.trim() || busy !== ""} onClick={() => void editBrief()}>{t("editApply")}</Button></div>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" className="rounded-full" onClick={reset}><X className="size-4" /> {t("stop")}</Button>
            <Button type="button" variant="outline" className="rounded-full" onClick={() => setEditOpen((open) => !open)}>{t("editBtn")}</Button>
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
                <button key={item.id} type="button" aria-label={`${t("approve")} ${item.id}`} onClick={() => void pickPin(item)} className="overflow-hidden rounded-[14px] border border-border hover:border-[#A98BFF]">
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
              <Button type="button" variant="ghost" className="rounded-full" onClick={() => void autoReference()}>{t("noPhoto")}</Button>
            </div>
          )}
          {phase === "photos" && busy !== "pins" && (
            <p className="text-xs text-muted-foreground">{t("noPhotoHint")}</p>
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
          {phase === "prompt" && (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" className="rounded-full" onClick={() => setPhase("photos")}><ArrowLeft className="size-4" /> {t("back")}</Button>
              <Button type="button" className="rounded-full" onClick={() => { setQStep(0); setPhase("count"); }}>{t("toVideos")} <ArrowRight className="size-4" /></Button>
            </div>
          )}
        </Msg>
      )}

      {phase === "count" && (() => {
        type Step = { key: string; label: string; options: [string | boolean | number, string][]; value: unknown; set: (v: string | boolean | number) => void };
        const rows = STYLE_ROWS();
        const row = (key: string): Step => {
          const found = rows.find(([k]) => k === key)!;
          return { key, label: found[1], options: found[2], value: key === "product" ? (style.product ?? Boolean(productLook || productLink)) : style[key as keyof typeof style], set: (v) => setStyle((current) => ({ ...current, [key]: v })) };
        };
        const steps: Step[] = [
          { key: "videos", label: t("howMany"), options: [1, 2, 3, 5, 10].map((n) => [n, `${n} ${n === 1 ? t("video") : t("videos")}`] as [number, string]), value: videoCount, set: (v) => setVideoCount(Number(v)) },
          { key: "scenes", label: t("howScenes"), options: [1, 2, 3, 4, 5, 6].map((n) => [n, `${n} ${n === 1 ? t("scene").toLowerCase() : t("scenesWord")}`] as [number, string]), value: sceneCount, set: (v) => setSceneCount(Number(v)) },
          row("format"), row("camera"), row("product"),
          ...(videoCount > 1 ? [row("avatarMix")] : []),
          row("setting"), row("voice"), row("tone"), row("cta"), row("captions"),
        ];
        const extra = videoCount > 1 ? 2 : 1; // variações (se houver) e o campo de alteração, por último
        const total = steps.length + extra;
        const at = Math.min(qStep, total - 1);
        const current = steps[at];
        const goBack = () => { if (at === 0) setPhase("prompt"); else setQStep(at - 1); };
        const finish = () => setPhase(modelChosen ? "cost" : "model");
        return (
          <Msg testid="chat-style">
            <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
              <span>{t("stepWord")} {at + 1} {t("ofWord")} {total}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-[#8B5CF6] to-[#A98BFF] transition-all duration-500" style={{ width: `${((at + 1) / total) * 100}%` }} /></div>
            </div>
            <div key={at} className="qc-in space-y-3">
              {current && (
                <>
                  <p className="font-medium">{current.label}</p>
                  <div role="radiogroup" aria-label={current.label} className="flex flex-wrap gap-2">
                    {current.options.map(([value, text]) => (
                      <Chip key={String(value)} role="radio" on={current.value === value} onClick={() => { current.set(value); setQStep(at + 1); }}>{text}</Chip>
                    ))}
                  </div>
                </>
              )}
              {!current && videoCount > 1 && at === steps.length && (
                <>
                  <p className="font-medium">{t("vary")}</p>
                  <div role="group" aria-label={t("vary")} className="flex flex-wrap gap-2">
                    {([["hook", t("vHook")], ["body", t("vBody")], ["cta", t("vCta")]] as const).map(([key, label]) => (
                      <Chip key={key} on={vary[key]} onClick={() => setVary({ ...vary, [key]: !vary[key] })}>{vary[key] ? "✓ " : ""}{label}</Chip>
                    ))}
                  </div>
                  <Button type="button" className="rounded-full" onClick={() => setQStep(at + 1)}>{t("go")} <ArrowRight className="size-4" /></Button>
                </>
              )}
              {!current && at === total - 1 && (
                <>
                  <p className="font-medium">{t("tweak")}</p>
                  <input value={style.custom} onChange={(event) => setStyle((c) => ({ ...c, custom: event.target.value }))} maxLength={120} aria-label={t("styCustom")} placeholder={t("styCustom")} className="w-full rounded-full border border-border bg-background px-4 py-2 text-sm" />
                  <Button type="button" className="rounded-full" onClick={finish}>{t("go")} <ArrowRight className="size-4" /></Button>
                </>
              )}
            </div>
            <div className="flex items-center justify-between gap-2">
              <Button type="button" variant="ghost" className="rounded-full" onClick={goBack}><ArrowLeft className="size-4" /> {t("back")}</Button>
              {at < total - 1 && <button type="button" onClick={() => setQStep(total - 1)} className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground">{t("tweakLink")}</button>}
            </div>
          </Msg>
        );
      })()}
      {["model", "cost", "board"].includes(phase) && (
        <Msg testid="video-count">
          <div className="flex flex-wrap gap-2" data-testid="style-summary">
            {[`${videoCount} ${videoCount === 1 ? t("video") : t("videos")}`, `${sceneCount} ${sceneCount === 1 ? t("scene").toLowerCase() : t("scenesWord")}`, ...(["format", "camera", "setting", "voice", "tone", "cta"] as const).map((key) => {
              const found = STYLE_ROWS().find(([k]) => k === key)?.[2].find(([value]) => value === style[key]);
              return found && found[0] !== "" ? found[1] : "";
            }), style.captions ? t("styCaptions") : "", style.custom].filter(Boolean).map((text) => <span key={text} className="rounded-full bg-muted/50 px-3 py-1 text-xs text-muted-foreground">✓ {text}</span>)}
          </div>
          {phase === "model" && <Button type="button" variant="ghost" className="rounded-full" onClick={() => setPhase("count")}><ArrowLeft className="size-4" /> {t("back")}</Button>}
        </Msg>
      )}
      {["model", "cost", "board"].includes(phase) && !modelChosen && (
        <Msg testid="chat-model">
          <p>{t("whichModel")}</p>
          <div role="radiogroup" aria-label={t("whichModel")} className="grid gap-2 sm:grid-cols-2">
            {visibleFlowChoices(flowAcct.plan).map((item) => (
              <button key={item.id} type="button" role="radio" aria-checked={model === item.id} aria-label={`${item.id === "lower" ? "Lower Priority" : item.name} · ${item.credits === 0 ? t("zero") : `${item.credits} ${t("credits")}`}`} onClick={() => { if (phase === "model") { setModel(item.id); saveFlowCategory(item.id); setPhase("cost"); } }}
                className={cn("flex items-center justify-between gap-3 rounded-[16px] border px-4 py-3 text-left transition", model === item.id ? "border-[#A98BFF] bg-[#7B3FE4]/15" : "border-border bg-card hover:border-[#A98BFF]/60")}>
                <span className="font-medium">{item.id === "lower" ? "Lower Priority" : item.name}</span>
                <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-xs", item.credits === 0 ? "bg-[#5BD69A]/15 text-[#5BD69A]" : "bg-white/5 text-muted-foreground")}>{" · "}{item.credits === 0 ? t("zero") : `${item.credits} ${t("credits")}`}</span>
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">{t("modelAuto")}</p>
          {phase === "model" && <Button type="button" variant="outline" className="rounded-full" onClick={() => setPhase("count")}><ArrowLeft className="size-4" /> {t("back")}</Button>}
        </Msg>
      )}
      {(phase === "cost" || (phase === "board" && busy === "board")) && (
        <div className="space-y-3 rounded-[20px] border border-[#A98BFF]/40 bg-card p-4" data-testid="video-approval">
          <p className="font-semibold">{t("approveGen")}</p>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-[14px] border border-white/10 bg-white/[0.03] px-2 py-3"><p className="text-xl font-semibold tabular-nums">{videoCount}</p><p className="text-xs text-muted-foreground">{videoCount === 1 ? t("video") : t("videos")}</p></div>
            <div className="rounded-[14px] border border-white/10 bg-white/[0.03] px-2 py-3"><p className="text-xl font-semibold tabular-nums">{SCENES}</p><p className="text-xs text-muted-foreground">{SCENES === 1 ? t("scene").toLowerCase() : t("scenesWord")}</p></div>
            <div className="rounded-[14px] border border-[#A98BFF]/40 bg-[#7B3FE4]/10 px-2 py-3"><p className="text-xl font-semibold tabular-nums">{totalCredits}</p><p className="text-xs text-muted-foreground">{lang === "en" ? "credits" : "créditos"}</p></div>
          </div>
          <p className="text-sm text-muted-foreground">{chosen.id === "lower" ? "Lower Priority" : chosen.name} · {t("spend")}: <b className="text-foreground">{totalCredits} {lang === "en" ? "credits" : "créditos"}</b></p>
          {phase === "cost" && (
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" className="mr-auto rounded-full" onClick={() => setPhase("count")}><ArrowLeft className="size-4" /> {t("back")}</Button>
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
          <PolicyNotice hits={policyHits} confirmed={policyOk === policyKey} onConfirm={(value) => setPolicyOk(value ? policyKey : "")} />
          {policyBlocked && <p className="text-xs text-muted-foreground">O envio para o Flow só começa depois que você confirmar o aviso acima.</p>}
          <p data-testid="flow-send-status" className="text-sm text-muted-foreground">{flowSend === "sending" ? t("sending") : flowSend === "ok" ? t("sentOk") : flowSend === "manual" ? t("sentManual") : ""}</p>
          <FlowRunPanel onRetake={retake} />
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={deliver} disabled={flowSend === "sending"}
              className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-br from-[#8B5CF6] to-[#7B3FE4] px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
              {flowSend === "sending" ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />} {t("pack")}
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
            {([[t("more"), () => { setVideoCount(3); setBoards([]); setQStep(0); setPhase("count"); }], [t("automation"), () => { window.location.href = "/automacao"; }]] as [string, () => void][]).map(([label, action]) => (
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
