"use client";

import { aiErrorText } from "@/lib/ai-errors";
import { isImageFile, toJpegFile } from "@/lib/photo-file";
import { LoadingTips } from "@/components/app/loading-tips";
import { PolicyNotice } from "@/components/app/policy-notice";
import { checkPolicy, policySignature } from "@/lib/shopee-policy";
import { LinkVideo } from "@/components/app/link-video";
import { ShopeeImport } from "@/components/app/shopee-import";
import { useCallback, useEffect, useRef, useState } from "react";
import { takeKind, takeTag, withTake, type TakeKind } from "@/lib/take-kinds";
import { FlowRunPanel } from "@/components/app/flow-run-panel";
import { QuestChat } from "./clone-quest-chat";
import { ArrowUp, Check, ClipboardCopy, Download, ExternalLink, Loader2, Lock, Pencil, Plus, RefreshCw, Sparkles, Trash2, Unlock, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { FLOW_CHOICES, FLOW_MODELS, defaultFlowCategory, effectiveFlowId, saveFlowCategory, visibleFlowChoices } from "@/lib/flow-models";
import { ReferenceSummary } from "@/components/app/reference-summary";
import { PresenterChoice, useReferenceGender, type Presenter } from "@/components/app/presenter-choice";
import { useSession } from "@/lib/auth-client";
import { ADMIN_WHATSAPP_URL } from "@/lib/token-balance";
import { flowUploadInfo } from "@/lib/flow-upload";
import { useFlowConnection } from "@/hooks/use-flow-connection";
import { announceTokens, readTokenBalance } from "@/lib/token-alert";

// BETA — Clonagem de Vídeo, seguindo o Protocolo Árvore.
// A copy validada é o tronco; as variações são os galhos (mesma mensagem, outro avatar/formato).
// Modo opcional "variar a copy": ganchos, corpos e CTAs diferentes misturados em cada vídeo.
// Isolated from the rest of Automação: own storage key, own API calls.

type Stage = "scenes" | "mix" | "variations" | "images" | "videos";
type Avatar = { id: string; name: string; look: string };
type Scene = { what: string; line: string };
type Variation = { title: string; avatar: string; look: string; setting: string; summary: string };
type Prompts = { prompts: string[] };
type Mix = { hooks: string[]; bodies: string[]; ctas: string[] };
type Project = {
  step: number;
  reference: string;
  notes: string;
  changes: string;
  ownCopy?: string;
  copySource?: "video" | "own" | "describe";
  product: string;
  productInfo: string;
  productLook: string;
  keyword: string;
  keepCase: boolean;
  sceneCount: number;
  takes?: number;
  takeKind?: TakeKind;
  flowModel: string;
  language: string;
  cta: string;
  ctaLocked: boolean;
  copyMode: "same" | "mix";
  mix: Mix;
  avatarMode: "own" | "random";
  presenter?: Presenter;
  avatars: Avatar[];
  objects: SceneObject[];
  count: number;
  scenes: Scene[];
  variations: Variation[];
  images: Prompts[];
  videos: Prompts[];
  approved: Record<string, boolean>;
  checks: Record<string, boolean>;
  gen: Record<string, { image?: string; video?: string }>;
  final: Record<string, string>;
};
type Built = { state: "running" | "done" | "error"; jobId?: string; note?: string };
type Task = { id: string; label: string; state: "running" | "done" | "error"; start: number; ms?: number; note?: string };

const PHOTO_BRIEF = "Vídeo curto de avatar apresentando o produto da foto: mostra o produto, explica para que serve e chama para comprar.";
const KEY = "gv-clonagem-v2";
const MODE_KEY = "gv-clonagem-mode";
const VIEW_KEY = "gv-clonagem-view-v2";
const TOUCH_KEY = "gv-clonagem-touch";
const SENT_KEY = "gv-clonagem-sent";
const IDLE_MS = 10 * 60 * 1000; // projeto parado: some e começa um novo
const WAIT_FLOW_MS = 2 * 60 * 60 * 1000; // depois de enviar ao Flow a pessoa precisa de tempo para gerar e voltar
// Ferramenta "ClipGringa — Gerar Vídeos" no Flow (BETA). Trocar pelo link compartilhado quando for liberada aos membros.
// Vídeo já enviado e transcrito antes? Reconhece pelo "RG" do arquivo (tamanho, nome e amostras do começo e do fim) e pula o envio.
const REF_CACHE_KEY = "cg-ref-cache-v1";
async function videoFingerprint(file: File): Promise<string | null> {
  try {
    const head = await file.slice(0, 2_000_000).arrayBuffer();
    const tail = await file.slice(Math.max(0, file.size - 1_000_000)).arrayBuffer();
    const joined = new Uint8Array(head.byteLength + tail.byteLength);
    joined.set(new Uint8Array(head), 0); joined.set(new Uint8Array(tail), head.byteLength);
    const digest = await crypto.subtle.digest("SHA-256", joined);
    const hex = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
    return `${file.size}-${hex.slice(0, 32)}`;
  } catch { return null; }
}
function cachedTranscript(key: string | null): string {
  if (!key) return "";
  try { const all = JSON.parse(window.localStorage.getItem(REF_CACHE_KEY) || "{}") as Record<string, { text: string }>; return all[key]?.text || ""; } catch { return ""; }
}
function rememberTranscript(key: string | null, text: string) {
  if (!key || text.trim().length < 20) return;
  try {
    const all = JSON.parse(window.localStorage.getItem(REF_CACHE_KEY) || "{}") as Record<string, { text: string; at: number }>;
    all[key] = { text, at: Date.now() };
    const keep = Object.entries(all).sort((a, b) => b[1].at - a[1].at).slice(0, 20);
    window.localStorage.setItem(REF_CACHE_KEY, JSON.stringify(Object.fromEntries(keep)));
  } catch { /* storage unavailable */ }
}
const FLOW_HOME_URL = "https://labs.google/fx/pt/tools/flow";
// Créditos do Flow por geração de 8s (conta sem Lower Priority). Fonte: support.google.com/flow/answer/16526234. Podem mudar.
const NEXT_HINTS = [
  "separe a referência em cenas (botão “Separar em cenas”) e, se escolheu variar a copy, gere os ganchos, corpos e CTAs.",
  "clique em “Gerar variações”.",
  "gere os prompts de imagem e marque todas as imagens como aprovadas.",
  "digite a palavra-chave e clique em “Travar a CTA”.",
  "clique em “Gerar prompts de animação”.",
  "",
  "",
];
const COUNT_OPTIONS =[1, 2, 3, 4, 5, 7, 10];
const STEPS = ["Referência", "Avatares", "Imagens", "CTA", "Animações", "Download", "Montagem"];
const NO_MIX: Mix = { hooks: [], bodies: [], ctas: [] };
const EMPTY: Project = {
  step: 1,
  reference: "",
  notes: "",
  changes: "",
  product: "",
  productInfo: "",
  productLook: "",
  keyword: "",
  keepCase: false,
  sceneCount: 4,
  flowModel: "lite",
  language: "pt-BR",
  cta: "Comente {KEYWORD} para assistir o vídeo completo",
  ctaLocked: false,
  copyMode: "same",
  mix: NO_MIX,
  avatarMode: "random",
  avatars: [],
  objects: [],
  count: 3,
  scenes: [],
  variations: [],
  images: [],
  videos: [],
  approved: {},
  checks: {},
  gen: {},
  final: {},
};
const HINTS = [
  "Escolha o vídeo que você quer copiar. Depois é só clicar em um botão para criar tudo.",
  "Diga quantos vídeos quer e clique em “Gerar variações”.",
  "Copie cada prompt, gere a imagem no Flow e marque “Aprovada”.",
  "Escreva o produto e a palavra-chave, depois clique em “Travar a CTA”.",
  "Copie cada prompt no Flow e envie aqui o vídeo de cada cena.",
  "Baixe as cenas, se quiser guardar uma cópia.",
  "Clique em “Montar todos os vídeos” e espere. Seus vídeos finais aparecem aqui.",
];
const LANGUAGES = [
  { value: "pt-BR", text: "Português", cta: "Comente {KEYWORD} para assistir o vídeo completo" },
  { value: "en", text: "Inglês", cta: "Comment {KEYWORD} to watch the full video" },
  { value: "es", text: "Espanhol", cta: "Comenta {KEYWORD} para ver el video completo" },
  { value: "fr", text: "Francês", cta: "Commente {KEYWORD} pour voir la vidéo complète" },
  { value: "de", text: "Alemão", cta: "Kommentiere {KEYWORD}, um das ganze Video zu sehen" },
  { value: "it", text: "Italiano", cta: "Scrivi {KEYWORD} nei commenti per vedere il video completo" },
];
const KEYWORDS = ["QUERO", "EU QUERO", "LINK", "INFO", "GUIA", "AULA"];
const CTA_PRESETS = [
  "Comente {KEYWORD} para assistir o vídeo completo",
  "Comente {KEYWORD} que eu te mando o link",
  "Escreva {KEYWORD} nos comentários e receba o passo a passo",
  "Comente {KEYWORD} agora e veja como funciona",
];
const CTA_BY_LANG: Record<string, string[]> = {
  "pt-BR": CTA_PRESETS,
  en: ["Comment {KEYWORD} to watch the full video", "Comment {KEYWORD} and I'll send you the link", "Type {KEYWORD} below and get the step by step", "Comment {KEYWORD} now and see how it works"],
  es: ["Comenta {KEYWORD} para ver el video completo", "Comenta {KEYWORD} y te mando el enlace", "Escribe {KEYWORD} en los comentarios y recibe el paso a paso", "Comenta {KEYWORD} ahora y mira cómo funciona"],
  fr: ["Commente {KEYWORD} pour voir la vidéo complète", "Commente {KEYWORD} et je t'envoie le lien"],
  de: ["Kommentiere {KEYWORD}, um das ganze Video zu sehen", "Schreib {KEYWORD} in die Kommentare und ich schicke dir den Link"],
  it: ["Scrivi {KEYWORD} nei commenti per vedere il video completo", "Scrivi {KEYWORD} e ti mando il link"],
};
const ALL_CTAS = Object.values(CTA_BY_LANG).flat();
type SceneObject = { id: string; name: string; place: string; position: "center" | "side" | "any" };
const OBJECT_PLACES = ["No fundo", "Na mão da pessoa", "Na mesa", "Na parede", "Na lapela", "Perto da porta"];
const OBJECT_POSITIONS: { value: SceneObject["position"]; text: string }[] = [{ value: "any", text: "Centro ou lateral" }, { value: "center", text: "No centro" }, { value: "side", text: "Na lateral" }];

const LOOK_PRESETS: [string, string][] = [
  ["Mulher jovem", "Mulher de 25 anos, cabelo castanho solto, camiseta branca"],
  ["Homem jovem", "Homem de 28 anos, cabelo curto, camiseta escura"],
  ["Mulher 40+", "Mulher de 42 anos, cabelo ondulado, blusa clara"],
  ["Homem 40+", "Homem de 45 anos, barba curta, camisa polo"],
];
const CAPCUT_STEPS = ["Importar os arquivos do vídeo", "Colocar as cenas na sequência correta", "Ajustar as junções entre as cenas", "Revisar a CTA e a palavra-chave", "Exportar"];

function load(): Project {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) return { ...EMPTY, ...(JSON.parse(raw) as Partial<Project>) };
  } catch { /* storage unavailable */ }
  return EMPTY;
}

function ptError(detail: unknown, fallback = "Não foi possível gerar esta etapa. Tente de novo.") {
  if (typeof detail !== "string") return fallback;
  const ai = aiErrorText(detail);
  if (ai) return ai;
  if (/Send the reference/i.test(detail)) return "Envie um vídeo ou descreva a referência (mínimo 20 caracteres).";
  if (/Keyword is required/i.test(detail)) return "Digite a palavra-chave.";
  if (/Too many (AI|caption)/i.test(detail)) return "Muitos pedidos em pouco tempo. Tente de novo daqui a pouco.";
  if (/not configured/i.test(detail)) return "A IA não está disponível agora.";
  if (/took too long/i.test(detail)) return "A IA demorou demais. Tente de novo.";
  if (/Generate the/i.test(detail)) return "Gere a etapa anterior primeiro.";
  if (/too long \(max/i.test(detail)) return "O vídeo é longo demais (máximo 10 minutos).";
  if (/No speech/i.test(detail)) return "Não encontrei fala nesse vídeo. Descreva o vídeo no campo de notas.";
  if (/Could not read/i.test(detail)) return "Não foi possível ler esse vídeo.";
  if (/Could not create the captions/i.test(detail)) return "Não consegui transcrever o vídeo agora. Use “Tentar de novo” (não precisa enviar outra vez).";
  if (/not enabled yet/i.test(detail)) return "A geração dentro da ferramenta ainda não está ligada.";
  if (/not enabled on the Google/i.test(detail)) return "A geração não está liberada na conta do Google. Avise o administrador.";
  if (/Daily (image|scene) limit/i.test(detail)) return "Você chegou ao limite de hoje. Tente de novo amanhã.";
  if (/Wait for the scenes/i.test(detail)) return "Espere as cenas em andamento terminarem.";
  if (/not available anymore/i.test(detail)) return "O modelo de geração não está mais disponível. Avise o administrador.";
  if (/blocked|not accepted/i.test(detail)) return "O Google não aceitou este prompt. Edite o texto e tente de novo.";
  if (/Google is busy/i.test(detail)) return "O Google está ocupado agora. Tente de novo em alguns minutos.";
  if (/Interrupted/i.test(detail)) return "A geração foi interrompida. Tente de novo.";
  if (/Could not (generate|reach|download)/i.test(detail)) return "Não foi possível gerar agora. Tente de novo.";
  return fallback;
}

const pad = (n: number) => String(n).padStart(2, "0");
const extOf = (name: string) => (/\.[a-z0-9]{2,4}$/i.exec(name)?.[0] ?? ".mp4").toLowerCase();
const fileName = (vi: number, si: number, source: string) => `Video${pad(vi + 1)}_Cena${pad(si + 1)}${extOf(source)}`;
const inputClass = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm";

/** Which hook, body and CTA the video number `vi` uses in "variar a copy" mode (all three change between videos). */
function mixPick(mix: Mix, vi: number) {
  const at = (list: string[], index: number) => (list.length ? list[index % list.length] : "");
  return {
    hook: { index: vi % Math.max(1, mix.hooks.length), text: at(mix.hooks, vi) },
    body: { index: (vi * 2 + 1) % Math.max(1, mix.bodies.length), text: at(mix.bodies, vi * 2 + 1) },
    cta: { index: (vi * 2 + 2) % Math.max(1, mix.ctas.length), text: at(mix.ctas, vi * 2 + 2) },
  };
}

const RENDER = "/api/multiplier/clone/render";
const POLL_MS = process.env.NODE_ENV === "test" ? 5 : 4000;
const ASSEMBLE_POLL_MS = process.env.NODE_ENV === "test" ? 5 : 2000;
const AUTO_WEIGHT = { text: 1, image: 2, video: 6, final: 3 };

/** Cópia final falada de cada vídeo (a CTA travada fecha a última cena). */
function linesOf(proj: Project, vi: number): string[] {
  const kw = proj.keyword.trim() || "PALAVRA";
  if (proj.copyMode === "mix") {
    const pick = mixPick(proj.mix, vi);
    const cta = pick.cta.text.replace("{KEYWORD}", kw);
    if (proj.sceneCount === 1) return [`${pick.hook.text} ${cta}`];
    if (proj.sceneCount === 2) return [pick.hook.text, cta];
    const middle = proj.scenes.slice(2, proj.sceneCount - 1).map((scene) => scene.line);
    return [pick.hook.text, pick.body.text, ...middle, cta];
  }
  const lines = proj.scenes.map((scene) => scene.line);
  if (lines.length) lines[lines.length - 1] = `${lines[lines.length - 1]} ${proj.cta.replace("{KEYWORD}", kw)}`.trim();
  return lines;
}

const isMixReady = (m: Mix) => m.hooks.length >= 2 && m.bodies.length >= 2 && m.ctas.length >= 2 && m.ctas.every((item) => item.includes("{KEYWORD}"));

/** Chama uma etapa da IA e devolve os dados. Lança um erro já em português. */
const STAGE_LABEL: Record<string, string> = { scenes: "Separação das cenas", variations: "Variações", mix: "Copys", images: "Prompts de imagem", videos: "Prompts de animação" };

async function callStage(stage: Stage, proj: Project): Promise<{ items?: unknown[]; hooks?: string[]; bodies?: string[]; ctas?: string[] }> {
  const tokensBefore = await readTokenBalance();
  const response = await fetch("/api/multiplier/clone/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      stage,
      reference: (proj.copySource === "own" || proj.copySource === "describe") && (proj.ownCopy ?? "").trim().length >= 20 ? proj.ownCopy!.trim() : proj.reference,
      own_copy: proj.copySource === "own" && (proj.ownCopy ?? "").trim().length >= 20,
      copy_brief: proj.copySource === "describe" && (proj.ownCopy ?? "").trim().length >= 20,
      notes: proj.notes,
      changes: proj.changes ?? "",
      product: proj.product,
      product_info: proj.productInfo,
      product_look: proj.productLook,
      keyword: proj.keyword,
      keep_case: proj.keepCase,
      scene_count: proj.sceneCount,
      language: proj.language,
      cta: proj.cta,
      avatar_mode: proj.avatarMode,
      ...(proj.presenter ? { presenter: proj.presenter } : {}),
      avatars: proj.avatars.filter((a) => a.name.trim()).map(({ name, look }) => ({ name, look })),
      objects: (proj.objects ?? []).filter((o) => o.name.trim()).map(({ name, place, position }) => ({ name, place, position })),
      count: proj.count,
      scenes: proj.scenes,
      variations: proj.variations,
      ...(proj.copyMode === "mix" && (stage === "images" || stage === "videos") ? { lines: proj.variations.map((_, i) => linesOf(proj, i)) } : {}),
    }),
  });
  const data = await response.json().catch(() => null);
  const valid = stage === "mix" ? Array.isArray(data?.hooks) && Array.isArray(data?.bodies) && Array.isArray(data?.ctas) : Array.isArray(data?.items);
  if (!response.ok || !valid) {
    try { window.dispatchEvent(new Event("gv-tokens-changed")); } catch { /* sem janela */ }
    throw new Error(ptError(data?.detail));
  }
  void announceTokens(STAGE_LABEL[stage] ?? "Etapa", tokensBefore);
  return data;
}

function applyStage(cur: Project, stage: Stage, data: { items?: unknown[]; hooks?: string[]; bodies?: string[]; ctas?: string[] }): Project {
  if (stage === "scenes") return { ...cur, scenes: (data.items as Scene[]).slice(0, cur.sceneCount), mix: NO_MIX, variations: [], images: [], videos: [], approved: {}, gen: {}, final: {} };
  if (stage === "mix") return { ...cur, mix: { hooks: data.hooks ?? [], bodies: data.bodies ?? [], ctas: data.ctas ?? [] }, videos: [] };
  if (stage === "variations") return { ...cur, variations: data.items as Variation[], images: [], videos: [], approved: {}, gen: {}, final: {} };
  if (stage === "images") return { ...cur, images: (data.items as Prompts[]).map((set) => ({ prompts: set.prompts.slice(0, cur.sceneCount) })), videos: [], approved: {}, gen: {}, final: {} };
  const gen = Object.fromEntries(Object.entries(cur.gen).map(([key, value]) => [key, { image: value.image }]));
  return { ...cur, videos: (data.items as Prompts[]).map((set) => ({ prompts: set.prompts.slice(0, cur.sceneCount) })), gen, final: {} };
}

async function renderImage(prompt: string): Promise<string> {
  const response = await fetch(`${RENDER}/image`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt }) });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.id) throw new Error(ptError(data?.detail, "Não foi possível gerar a imagem agora. Tente de novo."));
  return data.id as string;
}

async function renderVideo(prompt: string, imageId?: string, stopped?: () => boolean): Promise<string> {
  const response = await fetch(`${RENDER}/video`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt, image_id: imageId, seconds: 8 }) });
  const started = await response.json().catch(() => null);
  if (!response.ok || !started?.id) throw new Error(ptError(started?.detail, "Não foi possível gerar a cena agora. Tente de novo."));
  for (let attempt = 0; attempt < 240; attempt += 1) {
    if (stopped?.()) throw new Error("STOP");
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    const item = await fetch(`${RENDER}/${started.id}`).then((r) => r.json()).catch(() => null);
    if (item?.status === "ready") return started.id as string;
    if (item?.status === "error") throw new Error(ptError(item.error, "Não foi possível gerar a cena agora. Tente de novo."));
  }
  throw new Error("A cena demorou demais. Tente de novo.");
}

async function pool<T>(items: T[], size: number, worker: (item: T) => Promise<void>): Promise<void> {
  let index = 0;
  let failure: unknown = null;
  const runners = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (!failure && index < items.length) {
      const item = items[index];
      index += 1;
      try { await worker(item); } catch (err) { failure = failure ?? err; }
    }
  });
  await Promise.all(runners);
  if (failure) throw failure;
}

function Chips<T extends string | number>({ label, options, value, onPick, disabled }: { label: string; options: { value: T; text: string }[]; value?: T; onPick: (value: T) => void; disabled?: boolean }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((option) => (
        <button key={String(option.value)} type="button" role="radio" aria-checked={value === option.value} disabled={disabled} onClick={() => onPick(option.value)}
          className={cn("min-h-10 rounded-full border px-4 py-2 text-sm font-medium transition-all duration-150 hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A98BFF] disabled:opacity-50 disabled:hover:translate-y-0",
            value === option.value ? "border-transparent bg-gradient-to-br from-[#8B5CF6] to-[#7B3FE4] text-white shadow-[0_6px_18px_-8px_#7B3FE4]" : "border-border bg-card/60 text-muted-foreground hover:border-[#A98BFF]/60 hover:text-foreground")}>
          {option.text}
        </button>
      ))}
    </div>
  );
}

/** Escolha da palavra-chave: exemplos clicáveis ou escrita livre (maiúsculas e minúsculas, se o membro autorizar). */
function KeywordPicker({ keyword, keepCase, disabled, onChange, onKeepCase, placeholder }: { keyword: string; keepCase: boolean; disabled?: boolean; onChange: (value: string) => void; onKeepCase: (value: boolean) => void; placeholder: string }) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">Exemplos de palavra-chave. Clique em um ou escreva a sua abaixo.</p>
      <Chips label="Exemplos de palavra-chave" disabled={disabled} value={keyword} onPick={onChange} options={KEYWORDS.map((k) => ({ value: k, text: k }))} />
      <input value={keyword} onChange={(event) => onChange(keepCase ? event.target.value : event.target.value.toUpperCase())} disabled={disabled} maxLength={30} placeholder={placeholder} aria-label="Escrever a minha palavra-chave" className={inputClass} />
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <input type="checkbox" checked={keepCase} disabled={disabled} onChange={(event) => onKeepCase(event.target.checked)} className="size-4" />
        Escrever do meu jeito: manter minúsculas e maiúsculas como digitei
      </label>
    </div>
  );
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

function Group({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-2 text-sm">
      <span className="block font-medium text-foreground">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}

export function CloneWizard() {
  const [ready, setReady] = useState(false);
  const [p, setP] = useState<Project>(EMPTY);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [busy, setBusy] = useState<Stage | "upload" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [clips, setClips] = useState<Record<string, { url: string; name: string; file: File }>>({});
  const [batch, setBatch] = useState<{ done: number; total: number } | null>(null);
  const [assembling, setAssembling] = useState(false);
  const [render, setRender] = useState<{ enabled: boolean } | null>(null);
  const [auto, setAuto] = useState<{ label: string; done: number; total: number } | null>(null);
  const [genBusy, setGenBusy] = useState<Record<string, boolean>>({});
  const [canResume, setCanResume] = useState(false);
  // Padrão: Flow em Lower Priority (sem custo). O automático pago só roda se o membro escolher.
  const [mode, setMode] = useState<"free" | "auto">("free");
  const [simple, setSimple] = useState(true);
  const [askProduct, setAskProduct] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [productPhotos, setProductPhotos] = useState<{ url: string; name: string }[]>([]);
  const [skip, setSkip] = useState<Record<string, boolean>>({}); // vídeos ("0") e cenas ("0-1") que a pessoa tirou antes de enviar ao Flow
  const [lookState, setLookState] = useState<"idle" | "reading" | "done" | "failed">("idle");
  useEffect(() => {
    try { if (window.localStorage.getItem(VIEW_KEY) === "advanced") setSimple(false); } catch { /* storage unavailable */ }
  }, []);
  const chooseView = (next: "simple" | "advanced") => {
    setSimple(next === "simple");
    try { window.localStorage.setItem(VIEW_KEY, next); } catch { /* storage unavailable */ }
  };
  const [genLog, setGenLog] = useState<Record<string, { kind: "image" | "video"; label: string; state: "running" | "done" | "error"; start: number; ms?: number }>>({});
  const paid = Boolean(render?.enabled) && mode === "auto";
  const stopRef = useRef(false);
  const projRef = useRef<Project>(EMPTY);
  const [built, setBuilt] = useState<Record<number, Built>>({});
  const [imgs, setImgs] = useState<Record<string, string>>({});
  const [now, setNow] = useState(() => Date.now());
  const fileRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  // O erro pode aparecer longe do botão clicado: leva o aviso para a vista.
  useEffect(() => { if (error) errorRef.current?.scrollIntoView?.({ behavior: "smooth", block: "center" }); }, [error]);
  // Luz que corre em volta do botão de escolher o vídeo (mesma técnica do chat do influencer).
  // O ângulo fica no <html>: todas as luzes (botão e barras de progresso) herdam e giram juntas.
  useEffect(() => {
    let frame = 0; const begin = performance.now();
    const loop = (time: number) => {
      document.documentElement.style.setProperty("--cg-angle", `${(((time - begin) / 4500) * 360) % 360}deg`);
      frame = window.requestAnimationFrame(loop);
    };
    frame = window.requestAnimationFrame(loop);
    return () => { window.cancelAnimationFrame(frame); document.documentElement.style.removeProperty("--cg-angle"); };
  }, []);

  const savedRef = useRef<string | null>(null);
  useEffect(() => {
    const loaded = load();
    savedRef.current = JSON.stringify(loaded);
    setP(loaded);
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    try {
      const json = JSON.stringify(p);
      if (savedRef.current !== json) {
        savedRef.current = json;
        window.localStorage.setItem(KEY, json);
        window.localStorage.setItem(TOUCH_KEY, String(Date.now()));
      }
    } catch { /* storage unavailable */ }
  }, [ready, p]);
  // Projeto parado por mais de 10 minutos (ou 2 horas, se já foi enviado ao Flow) é apagado e vira um projeto novo.
  const [expiredNote, setExpiredNote] = useState(false);
  const hasContent = p.reference.trim().length > 0 || p.scenes.length > 0 || p.variations.length > 0;
  useEffect(() => {
    if (!ready || !hasContent || busy !== null || auto !== null) return;
    const check = () => {
      try {
        const touched = Number(window.localStorage.getItem(TOUCH_KEY) || 0);
        const limit = window.localStorage.getItem(SENT_KEY) === "1" ? WAIT_FLOW_MS : IDLE_MS;
        if (touched && Date.now() - touched > limit) { resetRef.current(); setExpiredNote(true); }
      } catch { /* storage unavailable */ }
    };
    check();
    const id = setInterval(check, 30_000);
    document.addEventListener("visibilitychange", check);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", check); };
  }, [ready, hasContent, busy, auto]);
  useEffect(() => {
    if (!busy && !tasks.some((task) => task.state === "running") && !Object.values(genLog).some((item) => item.state === "running")) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [busy, tasks, genLog]);

  useEffect(() => { projRef.current = p; }, [p]);
  useEffect(() => {
    // Só o Lower Priority fica disponível. O modo pago existe apenas para testes internos ("auto-dev").
    try { if (window.localStorage.getItem(MODE_KEY) === "auto-dev") setMode("auto"); else window.localStorage.setItem(MODE_KEY, "free"); } catch { /* storage unavailable */ }
  }, []);
  const chooseScenes = (count: number) => {
    if (count === p.sceneCount) return;
    setClips((current) => { Object.values(current).forEach((clip) => URL.revokeObjectURL(clip.url)); return {}; });
    setImgs({});
    setBuilt({});
    setP((cur) => ({ ...cur, sceneCount: count, scenes: [], mix: NO_MIX, variations: [], images: [], videos: [], approved: {}, checks: {}, gen: {}, final: {} }));
    setOptionsChanged(true);
  };
  // Modo avançado: escolher a quantidade de cenas ou de vídeos já faz todo o resto sozinho (cenas, variações, prompts) e abre o Flow.
  const [autoGo, setAutoGo] = useState(0);
  const [optionsChanged, setOptionsChanged] = useState(false);
  const startAuto = () => {
    if (p.reference.trim().length < 20 && p.notes.trim().length < 20) return;
    setOptionsChanged(false);
    setAutoGo((n) => n + 1);
  };
  const chooseCount = (count: number) => {
    if (count === p.count) return;
    setP((cur) => ({ ...cur, count, variations: [], images: [], videos: [], approved: {}, checks: {}, gen: {}, final: {} }));
    setOptionsChanged(true);
  };
  const chooseLanguage = (language: string) => {
    if (language === p.language) return;
    setClips((current) => { Object.values(current).forEach((clip) => URL.revokeObjectURL(clip.url)); return {}; });
    setImgs({});
    setBuilt({});
    const isDefault = (text: string) => ALL_CTAS.includes(text) || !text.trim();
    setP((cur) => ({ ...cur, language, cta: isDefault(cur.cta) ? LANGUAGES.find((item) => item.value === language)?.cta ?? cur.cta : cur.cta, scenes: [], mix: NO_MIX, variations: [], images: [], videos: [], approved: {}, checks: {}, gen: {}, final: {} }));
  };
  const chooseMode = (next: "free" | "auto") => {
    setMode(next);
    try { window.localStorage.setItem(MODE_KEY, next); } catch { /* storage unavailable */ }
  };
  useEffect(() => {
    if (!ready) return;
    fetch(`${RENDER}/status`).then((r) => (r.ok ? r.json() : null)).then((data) => { setRender(data?.enabled === true ? { enabled: true } : null); if (data?.enabled === true) setP((cur) => (cur.keyword.trim() ? cur : { ...cur, keyword: "QUERO" })); }).catch(() => setRender(null));
  }, [ready]);
  // Depois de atualizar a página, traz de volta o que já foi gerado e salvo.
  useEffect(() => {
    if (!ready) return;
    const entries = Object.entries(p.gen);
    setImgs((current) => ({ ...Object.fromEntries(entries.filter(([, v]) => v.image).map(([k, v]) => [k, `${RENDER}/${v.image}/file`])), ...current }));
    entries.filter(([key, v]) => v.video && !clips[key]).forEach(([key, v]) => {
      const [vi, si] = key.split("-").map(Number);
      void fetch(`${RENDER}/${v.video}/file`).then((r) => (r.ok ? r.blob() : null)).then((blob) => {
        if (!blob) return;
        const file = new File([blob], fileName(vi, si, "x.mp4"), { type: "video/mp4" });
        setClips((current) => (current[key] ? current : { ...current, [key]: { url: URL.createObjectURL(blob), name: file.name, file } }));
      }).catch(() => undefined);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const patch = (change: Partial<Project>) => setP((current) => ({ ...current, ...change }));
  const editPrompt = (kind: "images" | "videos", vi: number, si: number, value: string) => setP((current) => ({
    ...current,
    [kind]: current[kind].map((item, i) => (i === vi ? { ...item, prompts: item.prompts.map((t, j) => (j === si ? value : t)) } : item)),
  }));
  const removeScene = (si: number) => setP((current) => {
    if (current.sceneCount <= 1) return current;
    const drop = <T,>(list: T[]) => list.filter((_, j) => j !== si);
    return { ...current, sceneCount: current.sceneCount - 1, scenes: drop(current.scenes), images: current.images.map((i) => ({ ...i, prompts: drop(i.prompts) })), videos: current.videos.map((i) => ({ ...i, prompts: drop(i.prompts) })), approved: {}, checks: {}, gen: {}, final: {} };
  });
  const removeVideo = (vi: number) => setP((current) => {
    if (current.variations.length <= 1) return current;
    const drop = <T,>(list: T[]) => list.filter((_, j) => j !== vi);
    return { ...current, count: Math.max(1, current.count - 1), variations: drop(current.variations), images: drop(current.images), videos: drop(current.videos), approved: {}, checks: {}, gen: {}, final: {} };
  });
  const keywordOrDefault = p.keyword.trim() || "PALAVRA";

  /** The three spoken lines of video number `vi`, with the CTA that closes the last scene. */
  const linesFor = useCallback((vi: number): string[] => linesOf(p, vi), [p]);

  const startTask = (label: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setTasks((current) => [{ id, label, state: "running" as const, start: Date.now() }, ...current].slice(0, 8));
    return id;
  };
  const endTask = (id: string, state: "done" | "error", note?: string) =>
    setTasks((current) => current.map((task) => (task.id === id ? { ...task, state, note, ms: Date.now() - task.start } : task)));

  const run = useCallback(async (stage: Stage, label: string) => {
    setError(null);
    setBusy(stage);
    const taskId = startTask(label);
    try {
      const data = await callStage(stage, p);
      setP((current) => applyStage(current, stage, data));
      if (stage === "scenes" || stage === "variations" || stage === "images") setImgs({});
      endTask(taskId, "done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível gerar esta etapa. Tente de novo.");
      endTask(taskId, "error", "Falhou. Veja o aviso acima.");
    } finally {
      setBusy(null);
    }
  }, [p]);

  async function readReference(file: File) {
    if (!file.type.startsWith("video/")) { setError("Envie um arquivo de vídeo (mp4, mov ou webm)."); return; }
    setError(null);
    setRefFile(file);
    patch({ reference: "", scenes: [], mix: NO_MIX, variations: [], images: [], videos: [], approved: {} });
    setSpeech("ok");
    setBusy("upload");
    const fingerprint = await videoFingerprint(file);
    const known = cachedTranscript(fingerprint);
    if (known) {
      const done = startTask("Vídeo já conhecido: usando a transcrição guardada");
      patch({ reference: known, scenes: [], mix: NO_MIX, variations: [], images: [], videos: [], approved: {} });
      endTask(done, "done", "Sem enviar de novo");
      setBusy(null);
      return;
    }
    const taskId = startTask("Transcrevendo o vídeo de referência");
    try {
      const form = new FormData();
      form.append("video", file);
      const response = await fetch("/api/multiplier/captions/draft", { method: "POST", body: form });
      const data = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(data?.lines)) throw new Error(ptError(data?.detail, "Não foi possível ler o vídeo. Tente de novo."));
      const heard = (data.lines as { text: string }[]).map((line) => line.text).join(" ").trim();
      rememberTranscript(fingerprint, heard);
      patch({ reference: heard, scenes: [], mix: NO_MIX, variations: [], images: [], videos: [], approved: {} });
      endTask(taskId, "done");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Não foi possível ler o vídeo. Tente de novo.";
      if (/Não encontrei fala/.test(message)) {
        // Vídeo sem fala não é falha: o aviso fica no próprio card e a pessoa descreve o vídeo nas notas.
        setSpeech("nospeech");
        endTask(taskId, "done", "Sem fala nesse vídeo");
      } else {
        setError(message);
        endTask(taskId, "error", "Falhou. Veja o aviso acima.");
      }
    } finally {
      setBusy(null);
    }
  }

  async function copy(key: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      setTimeout(() => setCopied((current) => (current === key ? null : current)), 1600);
    } catch {
      setError("Não foi possível copiar. Selecione o texto e copie manualmente.");
    }
  }

  function attach(key: string, file: File, kind: "video" | "image") {
    if (!file.type.startsWith(`${kind}/`)) { setError(kind === "video" ? "Envie um arquivo de vídeo (mp4, mov ou webm)." : "Envie uma imagem (png, jpg ou webp)."); return; }
    setError(null);
    const url = URL.createObjectURL(file);
    if (kind === "video") {
      setClips((current) => { if (current[key]) URL.revokeObjectURL(current[key].url); return { ...current, [key]: { url, name: file.name, file } }; });
    } else {
      setImgs((current) => { if (current[key]) URL.revokeObjectURL(current[key]); return { ...current, [key]: url }; });
    }
  }

  /** Fotos do produto (até 3): a IA descreve o produto para ele aparecer igual nas cenas. Não bloqueia o resto se falhar. */
  const photoAiError = useRef("");
  async function addProductPhotos(files: File[]): Promise<string> {
    photoAiError.current = "";
    const images = await Promise.all(files.filter(isImageFile).slice(0, 3).map((file) => toJpegFile(file)));
    if (!images.length) { setError("Envie fotos do produto em PNG, JPG ou WebP."); return ""; }
    setError(null);
    setProductPhotos((current) => { current.forEach((photo) => URL.revokeObjectURL(photo.url)); return images.map((file) => ({ url: URL.createObjectURL(file), name: file.name })); });
    setLookState("reading");
    try {
      const form = new FormData();
      images.forEach((file) => form.append("images", file));
      const response = await fetch("/api/multiplier/clone/product-look", { method: "POST", body: form });
      const data = await response.json().catch(() => null);
      if (!response.ok || typeof data?.look !== "string") {
        // Mostra o motivo real (sem créditos, chave recusada, limite da API) em vez de ignorar a foto em silêncio.
        const why = aiErrorText(data?.detail);
        photoAiError.current = why ?? "";
        setError(why ?? "Não consegui ler as fotos agora. Tente de novo.");
        throw new Error("failed");
      }
      patch({ productLook: data.look, videos: [], ctaLocked: false });
      setLookState(data.look.trim() ? "done" : "failed");
      return data.look.trim();
    } catch {
      setLookState("failed");
      return "";
    }
  }

  /** Vários vídeos de uma vez: reconhece Video01_Cena02.mp4 (nome que a ferramenta do Flow já salva) e encaixa cada um no lugar certo. */
  function attachMany(files: File[]) {
    const videos = files.filter((file) => file.type.startsWith("video/"));
    if (!videos.length) { setError("Envie arquivos de vídeo (mp4, mov ou webm)."); return; }
    setError(null);
    const proj = projRef.current;
    const unknown: string[] = [];
    const matched = videos.map((file) => {
      const m = /video\D*(\d+)\D+cena\D*(\d+)/i.exec(file.name);
      const vi = m ? Number(m[1]) - 1 : -1;
      const si = m ? Number(m[2]) - 1 : -1;
      return { file, key: vi >= 0 && vi < proj.variations.length && si >= 0 && si < proj.sceneCount ? `${vi}-${si}` : null };
    });
    // Sem nomes reconhecíveis, mas a quantidade bate: segue a ordem dos arquivos.
    const byOrder = matched.every((item) => !item.key) && videos.length === proj.variations.length * proj.sceneCount;
    const sorted = byOrder ? [...videos].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })) : [];
    matched.forEach((item, i) => {
      const key = byOrder ? `${Math.floor(i / proj.sceneCount)}-${i % proj.sceneCount}` : item.key;
      const file = byOrder ? sorted[i] : item.file;
      if (key) attach(key, file, "video"); else unknown.push(item.file.name);
    });
    if (unknown.length) setError(`Não reconheci o nome de: ${unknown.join(", ")}. Use nomes como Video01_Cena01.mp4.`);
  }

  function toggle(map: "approved" | "checks", key: string, value: boolean) {
    setP((current) => ({ ...current, [map]: { ...current[map], [key]: value } }));
  }

  function downloadOne(vi: number, si: number) {
    const clip = clips[`${vi}-${si}`];
    if (!clip) return;
    const link = document.createElement("a");
    link.href = clip.url;
    link.download = fileName(vi, si, clip.name);
    link.click();
  }

  async function downloadAll() {
    for (let vi = 0; vi < p.variations.length; vi += 1) {
      for (let si = 0; si < p.sceneCount; si += 1) {
        if (clips[`${vi}-${si}`]) {
          downloadOne(vi, si);
          await new Promise((resolve) => setTimeout(resolve, 350));
        }
      }
    }
  }

  function exportAll() {
    const parts = p.variations.map((v, i) => {
      const lines = linesFor(i);
      const scenes = Array.from({ length: p.sceneCount }, (_, s) =>
        [fileName(i, s, "x.mp4"), `Fala: ${lines[s] ?? ""}`, p.images[i]?.prompts[s] && `Imagem: ${p.images[i].prompts[s]}`, p.videos[i]?.prompts[s] && `Animação: ${p.videos[i].prompts[s]}`].filter(Boolean).join("\n"),
      ).join("\n\n");
      return `VÍDEO ${pad(i + 1)} — ${v.title}\nAvatar: ${v.avatar} · ${v.look}\nCenário: ${v.setting}\n\n${scenes}`;
    });
    const blob = new Blob([parts.join("\n\n----------------------------------------\n\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "clonagem-projeto.txt";
    link.click();
    URL.revokeObjectURL(url);
  }

  /** Junta as cenas de um vídeo no servidor (mesmo motor do Multiplicador). Devolve o id da montagem. */
  const assembleWith = useCallback(async (vi: number, files: File[], quiet = false): Promise<string | null> => {
    setError(null);
    setBuilt((current) => ({ ...current, [vi]: { state: "running" } }));
    setAssembling(true);
    const taskId = quiet ? null : startTask(`Montando o vídeo ${pad(vi + 1)}`);
    const fail = (note: string) => {
      setBuilt((current) => ({ ...current, [vi]: { state: "error", note } }));
      if (taskId) endTask(taskId, "error", "Falhou. Veja o aviso no vídeo.");
      return null;
    };
    try {
      const form = new FormData();
      for (const file of files) form.append("scenes", file);
      const created = await fetch(`${RENDER}/assemble-scenes`, { method: "POST", body: form });
      const job = await created.json().catch(() => null);
      if (!created.ok || !job?.id) {
        const detail = String(job?.detail ?? "");
        if (created.status === 409 && /already/i.test(detail)) return fail("Já existe uma montagem em andamento. Aguarde terminar e tente de novo.");
        if (created.status === 409) return fail("Limite de montagens salvas atingido. Apague as antigas na aba Multiplicador.");
        if (created.status === 413) return fail("Um dos arquivos é grande demais (máximo 300 MB por cena).");
        return fail("Não foi possível iniciar a montagem. Tente de novo.");
      }
      for (let attempt = 0; attempt < 300; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, ASSEMBLE_POLL_MS));
        const poll = await fetch(`/api/multiplier/jobs/${job.id}`).then((r) => r.json()).catch(() => null);
        if (poll?.status === "completed") {
          setBuilt((current) => ({ ...current, [vi]: { state: "done", jobId: job.id } }));
          setP((current) => ({ ...current, final: { ...current.final, [vi]: job.id } }));
          if (taskId) endTask(taskId, "done");
          return job.id as string;
        }
        if (poll?.status === "error") return fail("Não foi possível juntar as cenas. Confira se os vídeos abrem normalmente.");
      }
      return fail("A montagem demorou demais. Veja em Multiplicador se ela terminou.");
    } catch {
      return fail("Não foi possível montar agora. Verifique a conexão e tente de novo.");
    } finally {
      setAssembling(false);
    }
  }, []);

  const assemble = useCallback(async (vi: number) => {
    const files = Array.from({ length: p.sceneCount }, (_, si) => clips[`${vi}-${si}`]?.file);
    if (files.some((file) => !file)) return;
    await assembleWith(vi, files as File[]);
  }, [clips, assembleWith, p.sceneCount]);

  async function assembleAll() {
    const todo = p.variations.map((_, vi) => vi).filter((vi) => built[vi]?.state !== "done" && Array.from({ length: p.sceneCount }, (_, si) => clips[`${vi}-${si}`]).every(Boolean));
    for (const [index, vi] of todo.entries()) {
      setBatch({ done: index, total: todo.length });
      await assemble(vi);
    }
    setBatch(null);
  }

  const fileOf = async (id: string, name: string, type: string) => {
    const blob = await fetch(`${RENDER}/${id}/file`).then((r) => (r.ok ? r.blob() : Promise.reject(new Error("Não foi possível baixar a cena gerada."))));
    return { blob, file: new File([blob], name, { type }) };
  };

  /** Gera (e guarda) a imagem de uma cena dentro da ferramenta. */
  const genImage = useCallback(async (vi: number, si: number, proj: Project = projRef.current) => {
    const key = `${vi}-${si}`;
    const prompt = proj.images[vi]?.prompts[si];
    if (!prompt) return;
    const log = `i-${key}`;
    const label = `Vídeo ${pad(vi + 1)} · cena ${si + 1}`;
    setGenLog((cur) => ({ ...cur, [log]: { kind: "image", label, state: "running", start: Date.now() } }));
    let id: string;
    try { id = await renderImage(prompt); } catch (err) {
      setGenLog((cur) => ({ ...cur, [log]: { ...cur[log], state: "error", ms: Date.now() - cur[log].start } }));
      throw err;
    }
    setGenLog((cur) => ({ ...cur, [log]: { ...cur[log], state: "done", ms: Date.now() - cur[log].start } }));
    setImgs((current) => ({ ...current, [key]: `${RENDER}/${id}/file` }));
    setP((current) => ({ ...current, gen: { ...current.gen, [key]: { image: id } }, approved: { ...current.approved, [key]: true }, final: {} }));
  }, []);

  /** Anima uma cena (imagem aprovada + prompt) dentro da ferramenta e guarda o vídeo. */
  const genVideo = useCallback(async (vi: number, si: number, proj: Project = projRef.current): Promise<File | null> => {
    const key = `${vi}-${si}`;
    const prompt = proj.videos[vi]?.prompts[si];
    if (!prompt) return null;
    const log = `v-${key}`;
    setGenLog((cur) => ({ ...cur, [log]: { kind: "video", label: `Vídeo ${pad(vi + 1)} · cena ${si + 1}`, state: "running", start: Date.now() } }));
    let id: string;
    try { id = await renderVideo(prompt, proj.gen[key]?.image, () => stopRef.current); } catch (err) {
      setGenLog((cur) => ({ ...cur, [log]: { ...cur[log], state: "error", ms: Date.now() - cur[log].start } }));
      throw err;
    }
    setGenLog((cur) => ({ ...cur, [log]: { ...cur[log], state: "done", ms: Date.now() - cur[log].start } }));
    const { blob, file } = await fileOf(id, fileName(vi, si, "x.mp4"), "video/mp4");
    setClips((current) => { if (current[key]) URL.revokeObjectURL(current[key].url); return { ...current, [key]: { url: URL.createObjectURL(blob), name: file.name, file } }; });
    setP((current) => ({ ...current, gen: { ...current.gen, [key]: { ...current.gen[key], video: id } }, final: {} }));
    return file;
  }, []);

  async function genOne(kind: "image" | "video", vi: number, si: number) {
    const key = `${kind}-${vi}-${si}`;
    setError(null);
    setGenBusy((current) => ({ ...current, [key]: true }));
    stopRef.current = false;
    const taskId = startTask(kind === "image" ? `Gerando a imagem da cena ${si + 1}` : `Animando a cena ${si + 1}`);
    try {
      if (kind === "image") await genImage(vi, si);
      else await genVideo(vi, si);
      endTask(taskId, "done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível gerar agora. Tente de novo.");
      endTask(taskId, "error", "Falhou. Veja o aviso acima.");
    } finally {
      setGenBusy((current) => ({ ...current, [key]: false }));
    }
  }

  /** Gera de uma vez todas as imagens (ou todas as cenas animadas) que ainda faltam, com a barra de progresso. */
  async function genAll(kind: "image" | "video") {
    stopRef.current = false;
    setError(null);
    const proj = projRef.current;
    const cells = Array.from({ length: proj.variations.length * proj.sceneCount }, (_, i) => ({ vi: Math.floor(i / proj.sceneCount), si: i % proj.sceneCount }))
      .filter(({ vi, si }) => !proj.gen[`${vi}-${si}`]?.[kind]);
    if (!cells.length) return;
    const noun = kind === "image" ? "imagens" : "cenas animadas";
    const taskId = startTask(kind === "image" ? "Gerando as imagens" : "Animando as cenas");
    let done = 0;
    const show = () => setAuto({ label: `${kind === "image" ? "Criando as" : "Animando as"} ${noun} (${Math.min(done + 1, cells.length)} de ${cells.length})`, done, total: cells.length });
    show();
    try {
      await pool(cells, 3, async ({ vi, si }) => {
        if (stopRef.current) throw new Error("STOP");
        if (kind === "image") await genImage(vi, si, projRef.current);
        else await genVideo(vi, si, projRef.current);
        done += 1;
        show();
      });
      endTask(taskId, "done");
    } catch (err) {
      const stopped = err instanceof Error && err.message === "STOP";
      if (!stopped) setError(err instanceof Error ? err.message : "Não foi possível gerar agora. Tente de novo.");
      endTask(taskId, "error", stopped ? "Parado." : "Parou aqui. Clique de novo para continuar.");
    } finally {
      setAuto(null);
    }
  }

  /** Do vídeo de referência até os vídeos finais montados, sem parar no meio. Pode ser retomado. */
  /** `textOnly`: só escreve tudo (cenas, variações, prompts) e para, pronto para enviar ao Flow. Não gera imagens nem vídeos. */
  async function runAll(textOnly = false) {
    stopRef.current = false;
    setError(null);
    setCanResume(false);
    let proj = projRef.current;
    if (proj.reference.trim().length < 20 && proj.notes.trim().length < 20) { setError(ptError("Send the reference")); return; }
    if (!proj.keyword.trim() && textOnly) { proj = { ...proj, keyword: "QUERO" }; projRef.current = proj; setP(proj); }
    if (!proj.keyword.trim()) { setError("Escolha a palavra-chave da CTA antes de começar."); return; }
    const taskId = startTask(textOnly ? "Preparando seus vídeos" : "Criando seus vídeos automaticamente");
    let doneW = 0;
    const missing = (cur: Project) => {
      const n = cur.variations.length || cur.count;
      const keys = Array.from({ length: n * cur.sceneCount }, (_, i) => `${Math.floor(i / cur.sceneCount)}-${i % cur.sceneCount}`);
      const heavy = textOnly ? 0 : keys.filter((k) => !cur.gen[k]?.image).length * AUTO_WEIGHT.image + keys.filter((k) => !cur.gen[k]?.video).length * AUTO_WEIGHT.video
        + Array.from({ length: n }, (_, vi) => vi).filter((vi) => !cur.final[vi]).length * AUTO_WEIGHT.final;
      return (cur.scenes.length === cur.sceneCount ? 0 : AUTO_WEIGHT.text) + (cur.copyMode === "mix" && !isMixReady(cur.mix) ? AUTO_WEIGHT.text : 0)
        + (cur.variations.length ? 0 : AUTO_WEIGHT.text) + (cur.images.length === cur.variations.length && cur.images.length ? 0 : AUTO_WEIGHT.text)
        + (cur.videos.length === cur.variations.length && cur.videos.length ? 0 : AUTO_WEIGHT.text) + heavy;
    };
    const mark = (label: string, cur: Project, weight = 0) => { doneW += weight; setAuto({ label, done: doneW, total: doneW + missing(cur) }); };
    const sync = () => new Promise<void>((resolve) => setTimeout(resolve, 80));
    const check = () => { if (stopRef.current) throw new Error("STOP"); };
    const text = async (stage: Stage, label: string, step: number) => {
      check();
      mark(label, proj);
      patch({ step });
      const data = await callStage(stage, proj);
      proj = { ...applyStage(proj, stage, data), step };
      projRef.current = proj;
      setP(proj);
      if (stage !== "videos" && stage !== "mix") setImgs({});
      mark(label, proj, AUTO_WEIGHT.text);
    };
    try {
      if (proj.scenes.length !== proj.sceneCount) await text("scenes", proj.reference === PHOTO_BRIEF ? "Entendendo a imagem de referência" : "Entendendo o vídeo de referência", 1);
      if (proj.copyMode === "mix" && !isMixReady(proj.mix)) await text("mix", "Escrevendo ganchos, corpos e CTAs diferentes", 1);
      if (!proj.variations.length) await text("variations", "Planejando as variações", 2);
      const needImages = proj.images.length !== proj.variations.length || !proj.images.length;
      const needVideos = proj.videos.length !== proj.variations.length || !proj.videos.length;
      if (textOnly && needImages && needVideos) {
        // Os prompts das imagens e os das animações não dependem um do outro: pede os dois ao mesmo tempo.
        check();
        mark("Escrevendo os prompts das imagens e das animações", proj);
        patch({ step: 3 });
        const [imageData, videoData] = await Promise.all([callStage("images", proj), callStage("videos", { ...proj, ctaLocked: true })]);
        proj = { ...applyStage(applyStage(proj, "images", imageData), "videos", videoData), step: 3 };
        projRef.current = proj;
        setP(proj);
        mark("Escrevendo os prompts das imagens e das animações", proj, AUTO_WEIGHT.text * 2);
      } else if (needImages) await text("images", "Escrevendo os prompts das imagens", 3);
      const n = proj.variations.length;
      const all = Array.from({ length: n * proj.sceneCount }, (_, i) => ({ vi: Math.floor(i / proj.sceneCount), si: i % proj.sceneCount }));

      patch({ step: 3 });
      if (textOnly) patch({ approved: Object.fromEntries(all.map(({ vi, si }) => [`${vi}-${si}`, true])) });
      let imageCount = 0;
      await pool(textOnly ? [] : all.filter(({ vi, si }) => !proj.gen[`${vi}-${si}`]?.image), 3, async ({ vi, si }) => {
        check();
        mark(`Criando as imagens (${imageCount + 1} de ${all.length})`, projRef.current);
        await genImage(vi, si, proj);
        imageCount += 1;
        mark(`Criando as imagens (${imageCount} de ${all.length})`, projRef.current, AUTO_WEIGHT.image);
      });
      await sync();
      patch({ ctaLocked: true, step: 4 });
      proj = { ...projRef.current, ctaLocked: true, step: 4 };
      projRef.current = proj;
      if (proj.videos.length !== n || !proj.videos.length) await text("videos", "Escrevendo os prompts das animações", 5);
      await sync();
      proj = projRef.current;
      if (textOnly) { endTask(taskId, "done"); return; }

      patch({ step: 5 });
      let videoCount = 0;
      const files: Record<string, File> = {};
      for (const [key, clip] of Object.entries(clips)) files[key] = clip.file;
      await pool(all.filter(({ vi, si }) => !proj.gen[`${vi}-${si}`]?.video), 3, async ({ vi, si }) => {
        check();
        mark(`Animando as cenas (${videoCount + 1} de ${all.length}). Pode levar alguns minutos.`, projRef.current);
        const file = await genVideo(vi, si, projRef.current);
        if (file) files[`${vi}-${si}`] = file;
        videoCount += 1;
        mark(`Animando as cenas (${videoCount} de ${all.length})`, projRef.current, AUTO_WEIGHT.video);
      });
      await sync();
      proj = projRef.current;

      patch({ step: 7 });
      for (let vi = 0; vi < n; vi += 1) {
        if (proj.final[vi]) continue;
        check();
        mark(`Montando o vídeo ${vi + 1} de ${n}`, projRef.current);
        const trio = await Promise.all(Array.from({ length: proj.sceneCount }, async (_, si) => {
          const key = `${vi}-${si}`;
          if (files[key]) return files[key];
          const id = projRef.current.gen[key]?.video;
          if (!id) throw new Error("Falta uma cena deste vídeo. Gere a cena e tente de novo.");
          return (await fileOf(id, fileName(vi, si, "x.mp4"), "video/mp4")).file;
        }));
        const job = await assembleWith(vi, trio, true);
        if (!job) throw new Error("Não foi possível montar o vídeo " + pad(vi + 1) + ". Veja o aviso abaixo e tente de novo.");
        mark(`Montando o vídeo ${vi + 1} de ${n}`, projRef.current, AUTO_WEIGHT.final);
      }
      endTask(taskId, "done");
    } catch (err) {
      const stopped = err instanceof Error && err.message === "STOP";
      setCanResume(true);
      if (!stopped) setError(err instanceof Error ? err.message : "Não foi possível continuar. Tente de novo.");
      endTask(taskId, "error", stopped ? "Parado. Clique em continuar para seguir de onde parou." : "Parou aqui. Clique em continuar para seguir de onde parou.");
    } finally {
      setAuto(null);
    }
  }

  const resetRef = useRef<() => void>(() => undefined);
  // Entrega o pacote direto à extensão (sem copiar e colar): ela guarda e guia até o Começar.
  const pushPackage = (raw: string): Promise<boolean> => new Promise((resolve) => {
    const onAck = (event: MessageEvent) => {
      if (event.source !== window || event.data?.source !== "clipgringa-flow" || event.data?.type !== "package-ack") return;
      window.removeEventListener("message", onAck); window.clearTimeout(timer); resolve(event.data.ok === true);
    };
    let timer = 0;
    window.addEventListener("message", onAck);
    const arm = () => { timer = window.setTimeout(() => { window.removeEventListener("message", onAck); resolve(false); }, 6000); };
    // O relógio só começa depois do token de envio ficar pronto (ele pode demorar), para a resposta da extensão não chegar "atrasada".
    void flowUploadInfo("Clonar vídeo").then((upload) => {
      arm();
      try { window.postMessage({ source: "clipgringa-page", type: "flow-package", raw, upload }, window.location.origin); } catch { /* sem janela */ }
    }, () => { arm(); try { window.postMessage({ source: "clipgringa-page", type: "flow-package", raw, upload: null }, window.location.origin); } catch { /* sem janela */ } });
  });
  const extensionGotIt = useRef<Promise<boolean>>(Promise.resolve(false));
  // A extensão (painel do Flow) pode pedir o pacote de novo se não o recebeu: reenvia o último pronto.
  const resendRef = useRef<() => void>(() => undefined);
  useEffect(() => {
    const onAsk = (event: MessageEvent) => {
      if (event.source !== window || event.data?.source !== "clipgringa-ext" || event.data?.type !== "package?") return;
      resendRef.current();
    };
    window.addEventListener("message", onAsk);
    return () => window.removeEventListener("message", onAsk);
  }, []);
  // Quem tem Flow (conta conectada, plano e créditos) e quem não tem: o funil se adapta.
  const { state: flowState, account: flowAccount } = useFlowConnection(true, false);
  const flowStateRef = useRef(flowState);
  flowStateRef.current = flowState;
  const flowBanner = (() => {
    if (flowState === "unknown") return null;
    const base = "rounded-[14px] border p-3 text-sm";
    if (flowState === "connected" && flowAccount.plan) {
      return <p role="status" data-testid="flow-account" className={`${base} border-[#5BD69A]/40 bg-[#5BD69A]/10`}>Conta do Flow conectada · plano {flowAccount.plan}{flowAccount.credits !== null ? ` · ${flowAccount.credits} créditos` : ""}.</p>;
    }
    if (flowState === "connected") return null; // conectada sem plano lido: libera tudo, sem aviso
    if (flowState === "logged-out") {
      return <p role="status" data-testid="flow-account" className={`${base} border-[#F5B454]/40 bg-[#F5B454]/10`}>Sua conta do Flow não está conectada. <a className="underline" href={FLOW_HOME_URL} target="_blank" rel="noopener noreferrer">Abra o Flow</a> e entre com a conta Google que tem o Flow. Enquanto isso você já pode preparar os roteiros e prompts.</p>;
    }
    return <p role="status" data-testid="flow-account" className={`${base} border-[#F5B454]/40 bg-[#F5B454]/10`}>Não encontrei a extensão do Flow neste navegador. <a className="underline" href="/conectar-flow">Conectar ao Flow</a> (leva 2 minutos). Sem ela, você usa os prompts à mão.</p>;
  })();
  resendRef.current = () => { if (p.videos.length > 0) void pushPackage(flowPackage()); };
  const markSent = () => { try { window.localStorage.setItem(SENT_KEY, "1"); } catch { /* storage unavailable */ } };
  function reset() {
    try { window.localStorage.removeItem(SENT_KEY); window.localStorage.removeItem(TOUCH_KEY); } catch { /* storage unavailable */ }
    productPhotos.forEach((photo) => URL.revokeObjectURL(photo.url));
    setProductPhotos([]);
    setLookState("idle");
    Object.values(clips).forEach((clip) => URL.revokeObjectURL(clip.url));
    Object.values(imgs).forEach((url) => URL.revokeObjectURL(url));
    setClips({});
    setGenLog({});
    setGenBusy({});
    setBuilt({});
    setImgs({});
    setTasks([]);
    setError(null);
    setRedirectIn(null);
    setRedirectBlocked(false);
    try { window.sessionStorage.removeItem("gv-flow-redirected"); } catch { /* storage unavailable */ }
    setP(EMPTY);
  }
  resetRef.current = reset;

  const total = p.variations.length * p.sceneCount;
  const approvedCount = Object.entries(p.approved).filter(([key, value]) => value && p.images[Number(key.split("-")[0])]).length;
  const allApproved = p.images.length > 0 && total > 0 && approvedCount >= total;
  const mixReady = p.mix.hooks.length >= 2 && p.mix.bodies.length >= 2 && p.mix.ctas.length >= 2 && p.mix.ctas.every((item) => item.includes("{KEYWORD}"));
  const copyReady = p.copyMode === "same" || mixReady;
  const ctaValid = p.copyMode === "mix" ? mixReady : p.cta.includes("{KEYWORD}");
  const canNext = [p.scenes.length === p.sceneCount && copyReady, p.variations.length > 0, allApproved, p.ctaLocked, p.videos.length > 0, true, false][p.step - 1];
  const working = busy !== null || auto !== null;
  const runningTask = tasks.find((task) => task.state === "running");
  // Ao terminar as escolhas e começar a criar, leva a tela até o andamento para a pessoa acompanhar.
  const progressRef = useRef<HTMLDivElement>(null);
  const creating = !!(auto || runningTask);
  useEffect(() => { if (creating) progressRef.current?.scrollIntoView?.({ behavior: "smooth", block: "center" }); }, [creating]);
  const steps = ["Preparando tudo…", "Trabalhando nisso…", "Quase lá…"];
  const secs = runningTask ? Math.max(0, (now - runningTask.start) / 1000) : 0;
  // Uma só barra: sobe rápido no começo e desacelera, nunca chega a 100% antes de terminar.
  const eased = 95 * (1 - Math.exp(-secs / (assembling ? 60 : 18)));
  const remainingImages = Math.max(0, total - Object.keys(imgs).length);
  const remainingVideos = Math.max(0, total - Object.keys(clips).length);
  const etaMin = Math.max(1, Math.ceil((remainingImages * 15 + remainingVideos * 180) / 3 / 60 + (p.variations.length - Object.keys(p.final).length) * 1.5));
  const nowItems = Object.values(genLog).filter((item) => item.state === "running").map((item) => `${item.kind === "image" ? "imagem" : "animação"} · ${item.label}`).slice(0, 3);
  const autoPct = auto ? Math.min(99, (auto.done / Math.max(1, auto.total)) * 100) : 0;
  const pct = auto ? autoPct : batch ? Math.min(98, ((batch.done + eased / 100) / batch.total) * 100) : eased;

  // Só a conta administradora usa o Lower Priority. Os membros usam a categoria (modelo) que escolheram em
  // "Conectar ao Flow"; ela vira o padrão aqui e pode ser trocada neste projeto.
  // O vídeo anexado fica só nesta sessão (para mostrar os quadros); a copy dele já fica no projeto.
  const [refFile, setRefFile] = useState<File | null>(null);
  const refGender = useReferenceGender(refFile);
  // O vídeo novo muda quem aparece: a escolha volta ao padrão (manter) e passa a ser a pessoa vista no vídeo.
  useEffect(() => { if (refFile) setP((cur) => ((cur.presenter ?? "") === refGender.gender ? cur : { ...cur, presenter: refGender.gender })); }, [refGender.gender, refFile]);
  const [speech, setSpeech] = useState<"ok" | "nospeech">("ok");
  const { data: authSession } = useSession();
  const isAdminUser = Boolean((authSession?.user as { is_admin?: boolean } | undefined)?.is_admin);
  const flowModelId = effectiveFlowId(p.flowModel, flowAccount.plan);
  const lowPriority = flowModelId === "lower";
  useEffect(() => {
    const saved = defaultFlowCategory(isAdminUser);
    setP((cur) => (cur.flowModel === saved ? cur : { ...cur, flowModel: saved }));
  }, [isAdminUser]);
  const chooseModel = (id: string) => {
    saveFlowCategory(id);
    patch({ flowModel: id });
  };

  // Pacote único para a ferramenta ClipGringa dentro do Flow (BETA): tudo o que foi coletado, em um clique.
  const variationsKey = p.variations.map((v) => v.title).join("|");
  useEffect(() => { setSkip((cur) => (Object.keys(cur).length ? {} : cur)); }, [variationsKey]);
  const wantVideo = (vi: number) => !skip[String(vi)];
  const wantScene = (vi: number, si: number) => wantVideo(vi) && !skip[`${vi}-${si}`];
  const chosenScenes = p.variations.reduce((sum, _v, vi) => sum + Array.from({ length: p.sceneCount }, (_x, si) => (wantScene(vi, si) ? 1 : 0)).reduce<number>((a, b) => a + b, 0), 0);
  const chosenVideos = p.variations.filter((_v, vi) => Array.from({ length: p.sceneCount }, (_x, si) => wantScene(vi, si)).some(Boolean)).length;
  const flowPackage = () => JSON.stringify({
    app: "clipgringa-flow",
    version: 1,
    keyword: p.keyword.trim(),
    cta: p.cta,
    language: p.language,
    product: p.product || p.productInfo || p.productLook ? { name: p.product, info: p.productInfo, look: p.productLook } : undefined,
    sceneCount: p.sceneCount,
    model: (FLOW_CHOICES.find((m) => m.id === flowModelId) ?? FLOW_MODELS[0]).name,
    flowModel: (FLOW_CHOICES.find((m) => m.id === flowModelId) ?? FLOW_MODELS[0]).needle,
    lowerPriority: lowPriority,
    videos: Array.from({ length: p.takes ?? 1 }, (_, t) => p.variations.map((variation, vi) => ({
      title: variation.title,
      label: t === 0 ? `Vídeo ${pad(vi + 1)}` : `Vídeo ${pad(vi + 1)} · take ${t + 1}${(p.takeKind ?? "same") === "same" ? "" : ` · ${takeKind(p.takeKind).label.toLowerCase()}`}`,
      base: vi,
      scenes: Array.from({ length: p.sceneCount }, (_, si) => si).filter((si) => wantScene(vi, si)).map((si) => ({
        imagePrompt: t === 0 ? (p.images[vi]?.prompts[si] ?? "") : withTake(p.images[vi]?.prompts[si] ?? "", p.takeKind),
        videoPrompt: t === 0 ? (p.videos[vi]?.prompts[si] ?? "") : withTake(p.videos[vi]?.prompts[si] ?? "", p.takeKind),
        file: fileName(vi, si, "x.mp4").replace(/(\.\w+)$/, t === 0 ? "$1" : `${takeTag(t + 1, p.takeKind)}$1`),
        src: si,
      })),
    })).filter((video) => video.scenes.length > 0)).flat(),
  }, null, 2);

  // Mais um take de uma cena só: manda um pacote de uma cena para a extensão (os outros ficam na biblioteca).
  const retakes = useRef<Record<string, number>>({});
  const retake = (vbase: number, sbase: number, kind: TakeKind = "same") => {
    const key = `${vbase}-${sbase}`;
    const n = (retakes.current[key] ?? (p.takes ?? 1)) + 1;
    retakes.current[key] = n;
    const pkg = JSON.parse(flowPackage()) as { videos: unknown[] };
    pkg.videos = [{
      title: p.variations[vbase]?.title ?? "", label: `Vídeo ${pad(vbase + 1)} · take ${n}${kind === "same" ? "" : ` · ${takeKind(kind).label.toLowerCase()}`}`, base: vbase,
      scenes: [{
        imagePrompt: withTake(p.images[vbase]?.prompts[sbase] ?? "", kind), videoPrompt: withTake(p.videos[vbase]?.prompts[sbase] ?? "", kind),
        file: fileName(vbase, sbase, "x.mp4").replace(/(\.\w+)$/, `${takeTag(n, kind)}$1`), src: sbase, label: `Cena ${pad(sbase + 1)}`,
      }],
    }];
    void pushPackage(JSON.stringify(pkg, null, 2));
  };

  // Só quem NÃO tem Lower Priority escolhe o modelo, vendo quantos créditos cada vídeo gasta.
  const modelChooser = () => {
    const low = lowPriority;
    const model = FLOW_CHOICES.find((m) => m.id === flowModelId) ?? FLOW_MODELS[0];
    const perVideo = model.credits * p.sceneCount;
    const nVideos = p.variations.length || p.count;
    return (
      <div className="space-y-2" data-testid="flow-model-chooser">
        <div className="space-y-2 rounded-[12px] border border-[#F5B454]/40 bg-[#F5B454]/10 p-3">
            <p className="text-xs">{low ? "Lower Priority: não gasta créditos do seu Flow. Se não for o seu caso, escolha outro modelo (ele fica salvo como a sua categoria):" : "Cada cena gasta créditos do seu Flow. Escolha o modelo (ele fica salvo como a sua categoria):"}</p>
            <div className="flex flex-wrap gap-2">
              {visibleFlowChoices(flowAccount.plan).map((m) => (
                <button key={m.id} type="button" aria-pressed={m.id === model.id} onClick={() => chooseModel(m.id)} className={cn("rounded-[12px] border px-3 py-2 text-left text-xs", m.id === model.id ? "border-[#7B3FE4] bg-[#7B3FE4]/20" : "border-border text-muted-foreground")}>
                  <span className="block font-medium text-foreground">{m.name}</span>
                  <span className="block">{m.credits === 0 ? "0 créditos" : `${m.credits} créditos por cena`} · {m.note}</span>
                </button>
              ))}
            </div>
            {!low && <><p className="text-sm font-medium" data-testid="flow-credits">Cada vídeo de {p.sceneCount} {p.sceneCount === 1 ? "cena" : "cenas"} gasta cerca de {perVideo} créditos ({nVideos} {nVideos === 1 ? "vídeo" : "vídeos"}: {perVideo * nVideos} créditos).</p>
            <p className="text-xs text-muted-foreground">Mais as imagens e qualquer cena que você refizer. Valores do Flow podem mudar: confira em Configurações, no topo do campo de prompt.</p></>}
          </div>
      </div>
    );
  };

  const copyButton = (id: string, value: string, label = "Copiar") => (
    <Button key={id} type="button" size="sm" variant="outline" onClick={() => copy(id, value)}>
      {copied === id ? <Check className="size-3.5" /> : <ClipboardCopy className="size-3.5" />}
      {copied === id ? "Copiado" : label}
    </Button>
  );

  const generateButton = (stage: Stage, label: string, regenerate: boolean, runLabel: string, disabled = false) => (
    <Button type="button" onClick={() => run(stage, runLabel)} disabled={working || disabled}>
      {busy === stage ? <Loader2 className="size-4 animate-spin" /> : regenerate ? <RefreshCw className="size-4" /> : null}
      {busy === stage ? "Gerando…" : regenerate ? "Gerar de novo" : label}
    </Button>
  );

  const heading = (text: string) => <h2 className="text-sm font-semibold tracking-wide text-muted-foreground">{text}</h2>;

  const mixList = (kind: keyof Mix, title: string, hint?: string) => (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">{title}</p>
      {p.mix[kind].map((item, i) => (
        <textarea key={i} aria-label={`${title} ${i + 1}`} value={item} rows={2} maxLength={220} className={inputClass}
          onChange={(event) => setP((current) => ({ ...current, mix: { ...current.mix, [kind]: current.mix[kind].map((v, j) => (j === i ? event.target.value : v)) }, videos: [] }))} />
      ))}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );

  // Quando tudo fica pronto (modo simples), leva a pessoa ao Flow sozinho, com uma barra avisando.
  const [redirectIn, setRedirectIn] = useState<number | null>(null);
  const [redirectBlocked, setRedirectBlocked] = useState(false);
  // Chat "Quero mudar algo": ao abrir/escrever, a geração para; ao aplicar, os prompts são refeitos com a mudança e o Flow recebe o pacote novo.
  const [changeText, setChangeText] = useState("");
  const [paused, setPaused] = useState(false);
  const [changeDemo, setChangeDemo] = useState("");
  const [questHold, setQuestHold] = useState(false);
  const [policyOk, setPolicyOk] = useState("");
  const [questDone, setQuestDone] = useState(false);
  const [readDone, setReadDone] = useState(false);
  const [questName, setQuestName] = useState("");
  const [questPhoto, setQuestPhoto] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);
  // Sobe o vídeo, mostra o prompt e o resumo do criativo; só então desce sozinho até as perguntas (cenas, quantidade de vídeos...).
  useEffect(() => {
    if (!questHold || !readDone || questDone) return;
    const timer = window.setTimeout(() => {
      const box = chatRef.current;
      if (!box?.getBoundingClientRect) return;
      const rect = box.getBoundingClientRect();
      if (rect.top > window.innerHeight * 0.55 || rect.bottom < 0) box.scrollIntoView?.({ behavior: "smooth", block: "start" });
    }, 2200);
    return () => window.clearTimeout(timer);
  }, [questHold, readDone, questDone]);
  const [editing, setEditing] = useState<string | null>(null);
  const [manualMode, setManualMode] = useState<"closed" | "open" | "hidden">("closed");
  const [pendingChange, setPendingChange] = useState<string | null>(null);
  const pauseForChange = () => {
    if (paused) return;
    stopRef.current = true;
    setPaused(true);
    try { window.postMessage({ source: "clipgringa-page", type: "flow-stop" }, window.location.origin); } catch { /* sem janela */ }
  };
  const applyChange = () => {
    const text = changeText.trim();
    if (!text) return;
    pauseForChange();
    setPendingChange(text);
  };
  useEffect(() => {
    if (pendingChange === null || busy !== null || auto !== null) return;
    const text = pendingChange;
    setPendingChange(null);
    setChangeText("");
    setPaused(false);
    try { window.sessionStorage.removeItem("gv-flow-redirected"); } catch { /* storage unavailable */ }
    const merged = [projRef.current.changes, text].filter(Boolean).join(" | ").slice(0, 600);
    const next = { ...projRef.current, changes: merged, scenes: [], mix: NO_MIX, variations: [], images: [], videos: [], approved: {}, checks: {}, gen: {}, final: {}, ctaLocked: false };
    projRef.current = next;
    setP(next);
    setImgs({});
    setAutoGo((n) => n + 1);
  }, [pendingChange, busy, auto]);
  const resumeWithoutChange = () => {
    setPaused(false);
    setChangeText("");
    setAutoGo((n) => n + 1);
  };
  useEffect(() => { if (autoGo > 0) void runAll(!paid); }, [autoGo]); // eslint-disable-line react-hooks/exhaustive-deps
  const readyToFlow = simple && p.videos.length > 0 && p.ctaLocked;
  const redirectSig = readyToFlow ? p.variations.map((v) => v.title).join("|") : "";
  useEffect(() => {
    if (!redirectSig || flowStateRef.current === "logged-out") { setRedirectIn(null); return; }
    try { if (window.sessionStorage.getItem("gv-flow-redirected") === redirectSig) return; } catch { /* storage unavailable */ }
    try { void navigator.clipboard.writeText(flowPackage()); } catch { /* o botão Copiar pacote continua disponível */ }
    extensionGotIt.current = pushPackage(flowPackage());
    setRedirectIn(1);
    const timer = window.setInterval(() => {
      setRedirectIn((n) => {
        if (n === null) return null;
        if (n <= 1) {
          window.clearInterval(timer);
          try { window.sessionStorage.setItem("gv-flow-redirected", redirectSig); } catch { /* storage unavailable */ }
          markSent(); // a pessoa vai gerar no Flow: o projeto espera até 2 horas
          // Com a extensão, ela mesma abre o Flow; sem ela, tentamos abrir daqui.
          void extensionGotIt.current.then((ok) => { if (!ok) { const opened = window.open(FLOW_HOME_URL, "_blank"); if (!opened) setRedirectBlocked(true); } });
          return null;
        }
        return n - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [redirectSig]);

  // Exemplos de mudança: digita e apaga, um após o outro, até a pessoa escrever.
  const changeBoxShown = (p.videos.length > 0 && p.ctaLocked) || p.variations.length > 0;
  useEffect(() => {
    if (changeText || !changeBoxShown || typeof window === "undefined") return;
    const texts = ["Troque o cenário para uma cozinha moderna", "A pessoa mais jovem, de cabelo curto", "Fale mais devagar e com um tom mais amigável", "Deixe os vídeos mais curtos, com um gancho mais forte", "Mude o final para chamar para o WhatsApp"];
    let ti = 0; let n = 0; let erasing = false; let timer = 0;
    const tick = () => {
      const full = texts[ti % texts.length];
      if (!erasing) { n += 1; setChangeDemo(full.slice(0, n)); if (n >= full.length) { erasing = true; timer = window.setTimeout(tick, 1600); return; } }
      else { n -= 2; setChangeDemo(full.slice(0, Math.max(n, 0))); if (n <= 0) { erasing = false; n = 0; ti += 1; timer = window.setTimeout(tick, 400); return; } }
      timer = window.setTimeout(tick, erasing ? 18 : 38);
    };
    timer = window.setTimeout(tick, 600);
    return () => window.clearTimeout(timer);
  }, [changeText, changeBoxShown]);

  // Vídeo escolhido primeiro: lê enquanto a pessoa responde a conversa; ao terminar as duas coisas, prepara tudo e abre o Flow.
  useEffect(() => {
    if (!questHold || !readDone) return;
    if (projRef.current.reference.trim().length < 20) { setQuestHold(false); setReadDone(false); return; }
    if (!questDone) return;
    setQuestHold(false); setReadDone(false);
    void runAll(true);
  }, [questHold, questDone, readDone]); // eslint-disable-line react-hooks/exhaustive-deps

  if (simple) {
    const ready = p.videos.length > 0 && p.ctaLocked;
    const sceneTotal = p.variations.length * p.sceneCount;
    const received = Object.keys(clips).length;
    const hasReference = p.reference.trim().length >= 20;
    const productFields = (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">Se quiser que o produto apareça nos vídeos, conte um pouco ou envie fotos. A mensagem do vídeo de referência não muda.</p>
                <Field label="Nome do produto">
                  <input value={p.product} onChange={(event) => patch({ product: event.target.value })} maxLength={120} placeholder="Ex.: Creme Hidratante Sol" className={inputClass} />
                </Field>
                <Field label="Em uma frase: o que ele faz?">
                  <textarea value={p.productInfo} onChange={(event) => patch({ productInfo: event.target.value })} rows={2} maxLength={400} placeholder="Ex.: hidrata a pele por 24 horas, sem deixar oleosa" className={inputClass} />
                </Field>
                <ShopeeImport disabled={lookState === "reading"} onUse={(files, title) => { if (title && !p.product.trim()) patch({ product: title.slice(0, 120) }); void addProductPhotos(files); }} />
                <Group label="Fotos do produto (até 3)">
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-dashed border-border px-4 py-2 text-sm hover:text-foreground">
                    <Upload className="size-4" /> {productPhotos.length ? "Trocar as fotos" : "Escolher fotos"}
                    <input type="file" multiple accept="image/*" aria-label="Fotos do produto" className="sr-only"
                      onChange={(event) => { const files = Array.from(event.target.files ?? []); event.target.value = ""; if (files.length) void addProductPhotos(files); }} />
                  </label>
                  {productPhotos.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-2">
                      {productPhotos.map((photo) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={photo.url} src={photo.url} alt={photo.name} className="size-16 rounded-lg border border-border object-cover" />
                      ))}
                    </div>
                  )}
                  {lookState === "reading" && <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="size-3.5 animate-spin" /> Olhando as fotos do seu produto…</p>}
                  {lookState === "done" && <p className="text-xs text-[#5BD69A]">Produto reconhecido: o ClipGringa vai mostrá-lo igual nas cenas.</p>}
                  {lookState === "failed" && <p className="text-xs text-[#F5B454]">Não consegui ler as fotos agora. Os vídeos saem normalmente, só sem a descrição do produto.</p>}
                </Group>
                {(p.product || p.productInfo || p.productLook) && (
                  <button type="button" className="text-xs underline text-muted-foreground" onClick={() => { productPhotos.forEach((photo) => URL.revokeObjectURL(photo.url)); setProductPhotos([]); setLookState("idle"); patch({ product: "", productInfo: "", productLook: "", videos: [], ctaLocked: false }); }}>
                    Não falar do produto
                  </button>
                )}
              </div>
    );
    const hasProduct = Boolean(p.product.trim() || p.productInfo.trim() || p.productLook.trim());
    const startSimple = async (file: File) => {
      await readReference(file);
      await new Promise((resolve) => setTimeout(resolve, 150));
      if (projRef.current.reference.trim().length >= 20) await runAll(true);
    };
    // Vídeo de referência escolhido (arquivo ou baixado por link): segue o mesmo caminho nos dois casos.
    const chooseVideo = (file: File) => {
      if (questDone) { void startSimple(file); return; }
      setQuestName(file.name); setQuestHold(true); setReadDone(false); void readReference(file).finally(() => setReadDone(true));
    };
    // Sem vídeo de referência: começa pela foto do produto. A IA descreve o produto e o vídeo é criado do zero (avatar apresentando o produto).
    const choosePhotos = (files: File[], title = "") => {
      const images = files.filter(isImageFile);
      if (!images.length) { setError("Envie fotos do produto em PNG, JPG ou WebP."); return; }
      setError(null);
      if (title && !p.product.trim()) patch({ product: title.slice(0, 120) });
      patch({ copySource: "describe", ownCopy: PHOTO_BRIEF, reference: PHOTO_BRIEF, scenes: [], mix: NO_MIX, variations: [], images: [], videos: [], approved: {} });
      setQuestPhoto(true); setQuestName(images.length === 1 ? images[0].name : `${images.length} fotos`); setQuestHold(true); setReadDone(false);
      // A IA olha a foto e descreve o produto; o roteiro é escrito em cima dessa descrição (sem inventar outro produto).
      void addProductPhotos(images).then((look) => {
        const name = (projRef.current.product || title).trim();
        if (!look && !name) {
          // Se a IA recusou por causa da conta/chave, mostra esse motivo em vez do aviso genérico da foto.
          setError(photoAiError.current || "Não consegui entender a foto. Escreva o nome do produto em “Falar sobre o meu produto” ou envie outra foto.");
          setQuestHold(false); setQuestPhoto(false); setReadDone(false);
          patch({ copySource: "video", ownCopy: "", reference: "" });
          return;
        }
        if (!projRef.current.product.trim()) patch({ product: (look.split(/[.,;\n]/)[0] || look).slice(0, 80) });
        const brief = `Vídeo curto de avatar apresentando ESTE produto (não invente outro produto): ${name ? `${name}. ` : ""}${look}. O avatar mostra o produto na mão, explica para que serve e chama para comprar. Escolha o cenário, o avatar e o jeito de falar conforme o tipo do produto e o público dele.`.slice(0, 1500);
        patch({ ownCopy: brief, reference: brief });
      }).finally(() => setReadDone(true));
    };
    const run = async (file: File | null) => {
      setAskProduct(false);
      setPendingFile(null);
      if (file) await startSimple(file); else await runAll(true);
    };
    const policyHits = checkPolicy(p.product, p.productInfo, p.reference, p.ownCopy, p.variations.map((v) => `${v.title} ${v.summary}`).join(" "), [...p.mix.hooks, ...p.mix.bodies, ...p.mix.ctas].join(" "), p.cta, p.images.concat(p.videos).map((item) => item.prompts.join(" ")).join(" "));
    const policyKey = policySignature(policyHits);
    const policyBlocked = policyHits.length > 0 && policyOk !== policyKey;
    const sendToFlow = () => {
      if (policyBlocked) return;
      markSent();
      void copy("flow-send", flowPackage());
      void pushPackage(flowPackage()).then((ok) => { if (!ok) { setError("A extensão não confirmou o recebimento do pacote. Aperte Ctrl+F5 nesta página (e confira se a extensão está ligada e na versão 1.18.1) e clique em Enviar para o Flow de novo."); window.open(FLOW_HOME_URL, "_blank", "noopener"); } });
    };
    const assembling_ = Object.values(built).some((b) => b.state === "running");
    return (
      <div className="space-y-5">
        {flowBanner}
        {(ready || p.variations.length > 0) && (
          <div className="cg-orbit relative" data-testid="change-box">
            <div className="relative rounded-[26px] bg-[#1a191d] p-5 ring-1 ring-white/10 shadow-[0_20px_60px_-30px_#000]">
              <label className="sr-only" htmlFor="change-text">Quer mudar alguma coisa?</label>
              <p className="mb-2 px-1 text-sm font-medium text-[#C9BBFA]">Quer mudar alguma coisa? <span className="font-normal text-muted-foreground">· escreva e eu adapto os prompts</span></p>
              <textarea id="change-text" value={changeText} onFocus={pauseForChange} onChange={(event) => setChangeText(event.target.value)} rows={3} maxLength={400}
                placeholder={changeDemo ? `${changeDemo}▍` : "Ex.: troque o cenário para uma cozinha, a pessoa mais jovem, fale mais devagar"}
                className="min-h-[84px] w-full resize-none bg-transparent px-1 py-1 text-lg outline-none placeholder:text-muted-foreground/70" />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {paused && <Button type="button" size="sm" variant="outline" className="rounded-full" onClick={resumeWithoutChange}>Continuar sem mudar</Button>}
                <span className={`text-xs ${paused ? "text-[#F5B454]" : "text-muted-foreground"}`}>{paused ? "Pausado enquanto você escreve. A extensão para na etapa atual." : "Ao clicar, a geração pausa até você aplicar."}</span>
                <button type="button" aria-label="Aplicar a mudança" title="Aplicar a mudança" onClick={applyChange} disabled={!changeText.trim() || pendingChange !== null}
                  className="ml-auto flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#A98BFF] to-[#7B3FE4] text-white disabled:opacity-40">
                  <ArrowUp className="size-5" />
                </button>
              </div>
            </div>
          </div>
        )}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Clonar um vídeo</h2>
            <p className="text-sm text-muted-foreground">Suba o vídeo ou a foto do produto. O resto é automático.</p>
          </div>
          <div className="flex gap-4 text-xs text-muted-foreground">
            <button type="button" onClick={reset} disabled={working} className="underline disabled:opacity-50">Novo projeto</button>
            <button type="button" onClick={() => chooseView("advanced")} className="underline">Modo avançado</button>
          </div>
        </div>

        {expiredNote && !hasContent && (
          <p role="note" className="rounded-[14px] border border-border bg-card p-3 text-sm text-muted-foreground">
            O projeto anterior ficou parado por mais de 10 minutos e foi apagado. Este é um projeto novo.
          </p>
        )}
        {error && (
          <Alert variant="destructive" ref={errorRef}>
            <AlertDescription>{error}{/tokens acabaram/i.test(error) && <> <a href={ADMIN_WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="font-medium underline">Chamar o administrador no WhatsApp</a></>}</AlertDescription>
          </Alert>
        )}

        {(auto || runningTask) && (
          <div ref={progressRef} data-testid="creation-progress" className="cg-orbit relative scroll-mt-24" style={{ "--cg-r": "20px" } as React.CSSProperties}>
          <div role="status" aria-live="polite" className="relative space-y-2 rounded-[18px] border border-[#A98BFF]/40 bg-[#141316] p-4 shadow-[0_12px_32px_-18px_#7B3FE4]">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="font-medium">{auto ? auto.label : runningTask?.label}</span>
              <span className="tabular-nums text-xs text-muted-foreground">{Math.round(pct)}%</span>
            </div>
            <div role="progressbar" aria-label="Progresso" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} className="h-2 overflow-hidden rounded-full bg-border">
              <div className="cg-shimmer h-full rounded-full bg-gradient-to-r from-[#8B5CF6] to-[#7B3FE4] transition-[width] duration-700" style={{ width: `${pct}%` }} />
            </div>
            <p className="text-xs text-muted-foreground">
              {auto ? <><LoadingTips label={auto.label} /><span className="mt-1 block">Estamos preparando tudo por você. Pode esperar aqui, não precisa clicar em nada.</span></> : `${steps[Math.min(steps.length - 1, Math.floor(secs / 12))]} Pode esperar aqui.`}
              {assembling ? " Montar o vídeo leva de 1 a 3 minutos." : ""}
            </p>
          </div>
          </div>
        )}

        {!ready && (refFile || p.reference.trim()) && <ReferenceSummary file={refFile} transcript={p.reference} reading={busy === "upload"} noSpeech={speech === "nospeech"} />}
        {!ready && refFile && p.avatarMode !== "own" && <PresenterChoice detected={refGender.gender} reading={refGender.reading} value={p.presenter ?? ""} onChange={(value) => patch({ presenter: value })} />}

        {!ready && !working && askProduct && (
          <section aria-label="Produto" className="space-y-4 rounded-[18px] border border-[#A98BFF]/40 bg-card p-5">
            <div>
              <p className="text-lg font-semibold">Quer falar sobre o seu produto?</p>
              <p className="text-sm text-muted-foreground">É opcional. Se quiser que ele apareça nos vídeos, conte um pouco ou envie fotos.</p>
            </div>
            {productFields}
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="lg" className="rounded-full bg-gradient-to-br from-[#8B5CF6] to-[#7B3FE4] text-white" disabled={!hasProduct || lookState === "reading"} onClick={() => void run(pendingFile)}>
                Adicionar e continuar
              </Button>
              <Button type="button" size="lg" variant="outline" className="rounded-full" disabled={lookState === "reading"} onClick={() => void run(pendingFile)}>
                Pular, continuar sem produto
              </Button>
            </div>
          </section>
        )}

        {!ready && !working && !askProduct && (
          <section className="space-y-4 rounded-[18px] border border-border bg-card p-5">
            <input ref={fileRef} type="file" multiple accept="video/*,image/*" className="sr-only" aria-label="Escolher o vídeo ou imagem para clonar ou criar"
              onChange={(event) => { const files = Array.from(event.target.files ?? []); event.target.value = ""; const video = files.find((file) => file.type.startsWith("video/")); if (video) chooseVideo(video); else if (files.length) choosePhotos(files.slice(0, 3)); }} />
            {(hasReference || refFile) && !questHold ? (
              <>
                <p className="text-sm text-muted-foreground">{hasReference ? "O vídeo já foi lido. Falta preparar as cenas, as variações e os prompts." : `Recebi o seu vídeo${refFile ? ` (${refFile.name})` : ""}, mas ainda não consegui ler a fala. Se quiser tentar de novo, escolha outro vídeo.`}</p>
                <div className="flex flex-wrap gap-2">
                  
                  
                  <Button type="button" size="lg" variant="outline" className="rounded-full" onClick={() => fileRef.current?.click()}>Escolher outro vídeo</Button>
                </div>
              </>
            ) : null}
            {(hasReference || refFile) && !questHold ? (
            <div className="space-y-4">
              {!hasReference && (
                <label className="block space-y-2 rounded-[18px] border border-[#F5B454]/40 bg-[#F5B454]/5 p-4 text-sm">
                  <span className="font-medium">Não consegui ouvir a fala do vídeo. Cole aqui o que ele diz (ou escreva um resumo):</span>
                  <textarea value={p.reference} onChange={(event) => patch({ reference: event.target.value })} rows={4} maxLength={4000} aria-label="O que o vídeo diz" className={inputClass} placeholder="Cole o texto do vídeo aqui (mínimo 20 letras)" />
                </label>
              )}
              {!hasReference ? (
                <div className="cg-orbit relative w-full" style={{ "--cg-r": "22px" } as React.CSSProperties}>
                  <button type="button" disabled={!refFile} onClick={() => (refFile ? void run(refFile) : undefined)}
                    className="relative flex w-full items-center justify-center gap-3 rounded-[22px] bg-gradient-to-br from-[#8B5CF6] to-[#7B3FE4] px-6 py-5 text-lg font-semibold text-white shadow-[0_14px_36px_-14px_#7B3FE4] transition-transform hover:-translate-y-0.5 disabled:opacity-60">
                    <Sparkles className="size-5" /> Tentar de novo
                  </button>
                </div>
              ) : (canResume || p.scenes.length > 0) ? (
                <div className="cg-orbit relative w-full" style={{ "--cg-r": "22px" } as React.CSSProperties}>
                  <button type="button" onClick={() => void runAll(true)}
                    className="relative flex w-full items-center justify-center gap-3 rounded-[22px] bg-gradient-to-br from-[#8B5CF6] to-[#7B3FE4] px-6 py-5 text-lg font-semibold text-white shadow-[0_14px_36px_-14px_#7B3FE4] transition-transform hover:-translate-y-0.5">
                    <Sparkles className="size-5" /> Continuar de onde parou
                  </button>
                </div>
              ) : (
                <div className="cg-orbit relative w-full" style={{ "--cg-r": "22px" } as React.CSSProperties}>
                  <button type="button" onClick={() => void run(null)}
                    className="relative flex w-full items-center justify-center gap-3 rounded-[22px] bg-gradient-to-br from-[#8B5CF6] to-[#7B3FE4] px-6 py-5 text-lg font-semibold text-white shadow-[0_14px_36px_-14px_#7B3FE4] transition-transform hover:-translate-y-0.5">
                    <Sparkles className="size-5" /> Preparar meus vídeos
                  </button>
                </div>
              )}
            </div>
            ) : (
              <div className="space-y-4" data-testid="start-quest">
                {(() => {
                  const hasVideoNow = questHold || hasReference || !!refFile;
                  const stage = !hasVideoNow ? 1 : !questDone ? 2 : 3;
                  const labels = ["Escolher vídeo ou imagem", "Responder as perguntas", "Preparar tudo", "Gerar no Flow"];
                  return (
                    <div role="progressbar" aria-label="Passos" aria-valuemin={0} aria-valuemax={4} aria-valuenow={stage - 1} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {labels.map((label, i) => {
                        const state = i + 1 < stage ? "done" : i + 1 === stage ? "now" : "next";
                        return (
                          <div key={label} aria-current={state === "now" ? "step" : undefined}
                            className={`flex items-center gap-2 rounded-[14px] border px-3 py-2 text-xs ${state === "now" ? "border-[#7B3FE4] bg-[#7B3FE4]/20 text-white" : state === "done" ? "border-[#5BD69A]/40 text-[#5BD69A]" : "border-white/10 text-muted-foreground"}`}>
                            <span className={`grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-semibold ${state === "now" ? "bg-[#7B3FE4] text-white" : state === "done" ? "bg-[#5BD69A]/20" : "bg-white/10"}`}>{state === "done" ? "✓" : i + 1}</span>
                            <span>{label}</span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
                <div className="gt-pop space-y-3">
                  <div className="cg-orbit relative w-full" style={{ "--cg-r": "22px" } as React.CSSProperties}>
                    <button type="button" onClick={() => fileRef.current?.click()}
                      className="relative flex w-full items-center gap-4 rounded-[22px] border border-transparent bg-gradient-to-br from-[#8B5CF6] to-[#7B3FE4] px-6 py-6 text-left text-white shadow-[0_14px_36px_-14px_#7B3FE4] transition-transform hover:-translate-y-0.5">
                      <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-full bg-white/20"><Upload className="size-6" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2 text-lg font-semibold">Escolher o vídeo ou imagem que quero clonar ou criar <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold">BETA</span></span>
                        <span className="block text-sm opacity-90">suba o vídeo ou a foto do produto e o resto é automático</span>
                      </span>
                    </button>
                  </div>
                  {!questHold && !hasReference && !refFile && <LinkVideo onFile={chooseVideo} onPhotos={(files, title) => choosePhotos(files, title)} photoLabel="Criar o vídeo com essas fotos" />}
                  {questHold && <p role="status" className="rounded-[14px] border border-[#5BD69A]/40 bg-[#5BD69A]/10 p-3 text-sm">✓ {questPhoto ? "Foto escolhida" : "Vídeo escolhido"}{questName ? `: ${questName}` : ""}. {readDone ? "Já li. Responda as perguntas e eu sigo." : "Lendo a fala enquanto você responde…"}</p>}
                  {questHold && readDone && !questDone && (
                    <div data-testid="next-step" className="flex flex-wrap items-center gap-3 rounded-[14px] border border-[#7B3FE4]/50 bg-[#7B3FE4]/10 p-3 text-sm">
                      <span className="min-w-0 flex-1"><b>Próximo passo:</b> o prompt e o resumo do criativo já estão prontos. Agora escolha a quantidade de vídeos, as cenas e o resto nas perguntas logo abaixo.</span>
                      <button type="button" onClick={() => chatRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" })} className="rounded-full bg-gradient-to-br from-[#8B5CF6] to-[#7B3FE4] px-4 py-2 text-xs font-medium text-white">Ir para as perguntas ↓</button>
                    </div>
                  )}
                  {(questHold || hasReference || !!refFile) ? (
                  <div ref={chatRef} className="scroll-mt-4">
                  <QuestChat
                    values={{ cta: p.cta, product: p.product, count: p.count, sceneCount: p.sceneCount, takes: p.takes ?? 1, takeKind: p.takeKind ?? "same", language: p.language, copySource: p.copySource ?? "video", ownCopy: p.ownCopy ?? "", keyword: p.keyword, flowModel: flowModelId }}
                    languages={LANGUAGES.map((l) => ({ value: l.value, text: l.text }))}
                    models={visibleFlowChoices(flowAccount.plan).map((m) => ({ id: m.id, name: m.id === "lower" ? "Lower Priority" : m.name, credits: m.credits }))}
                    onCount={(n) => patch({ count: n })}
                    onScenes={(n) => patch({ sceneCount: n })}
                    onTakes={(n) => patch({ takes: n })}
                    onTakeKind={(kind) => patch({ takeKind: kind as TakeKind })}
                    onLanguage={(value) => chooseLanguage(value)}
                    onCopy={(source, text) => patch({ copySource: source, ownCopy: text })}
                    onKeyword={(value) => patch({ keyword: value })}
                    onModel={(id) => chooseModel(id)}
                    onCta={(value) => patch({ cta: value || (LANGUAGES.find((l) => l.value === p.language)?.cta ?? p.cta) })}
                    onProduct={(value) => patch({ product: value })}
                    onExtra={(value) => setP((cur) => ({ ...cur, changes: [cur.changes, value].filter(Boolean).join(" | ").slice(0, 600) }))}
                   onFinish={() => { setQuestDone(true); setP((cur) => (cur.keyword.trim() ? cur : { ...cur, keyword: "QUERO" })); }} hasVideo={questHold || hasReference || !!refFile} />
                  </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Escolha o vídeo ou a imagem acima. Depois eu faço as perguntas e o resto é automático.</p>
                  )}
                </div>
              </div>
            )}
            <div className="space-y-3 rounded-[22px] border border-dashed border-[#7B3FE4]/40 bg-[#7B3FE4]/[0.05] p-4" data-testid="quest-extras">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#A98BFF]">Complementos · opcional</p>
                <p className="mt-1 text-sm text-muted-foreground">Não precisa para clonar. Abra só se quiser deixar o vídeo mais com a sua cara.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <details className="group rounded-[18px] border border-white/10 bg-card p-4 text-sm open:sm:col-span-2 open:border-[#7B3FE4]/50">
                  <summary className="flex cursor-pointer list-none items-center gap-3 [&::-webkit-details-marker]:hidden">
                    <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-[#7B3FE4]/20 text-lg">🛍️</span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">Falar sobre o meu produto (opcional)</span>
                      <span className="block text-xs text-muted-foreground">Nome, o que ele faz e fotos</span>
                    </span>
                  </summary>
                  <div className="mt-4 border-t border-white/10 pt-4">{productFields}</div>
                </details>
              </div>
            </div>
          </section>
        )}

        {ready && <FlowRunPanel onRetake={retake} onVariations={(n) => { patch({ count: n, variations: [], images: [], videos: [], gen: {}, final: {}, approved: {}, ctaLocked: false }); void new Promise((resolve) => setTimeout(resolve, 150)).then(() => runAll(true)); }} />}

        {ready && (redirectIn !== null || redirectBlocked) && (
          <section role="status" className="space-y-2 rounded-[18px] border border-[#7B3FE4]/60 bg-[#7B3FE4]/15 p-4" data-testid="flow-redirect">
            <p className="text-sm font-semibold">{redirectBlocked ? "A extensão não respondeu. Recarregue esta página (F5) e confira se a extensão 1.18.1 está ligada; ou abra o Flow pelo botão abaixo." : `Abrindo o Flow e enviando tudo em ${redirectIn}s…`}</p>
            <div className="h-1.5 overflow-hidden rounded-full bg-border"><div className="h-full rounded-full bg-gradient-to-r from-[#8B5CF6] to-[#A98BFF] transition-all duration-1000" style={{ width: `${redirectBlocked ? 100 : ((1 - (redirectIn ?? 1)) / 1) * 100}%` }} /></div>
            <p className="text-xs text-muted-foreground">Tudo pronto. A extensão recebe o pacote, abre um projeto novo e gera as imagens e os vídeos sozinha. Você não precisa copiar nem colar nada.</p>
            <div className="flex gap-2">
              <a href={FLOW_HOME_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center rounded-full border border-border px-3 py-1.5 text-xs hover:text-foreground" onClick={() => { markSent(); setRedirectIn(null); setRedirectBlocked(false); }}>Abrir o Flow agora</a>
              {redirectIn !== null && <button type="button" className="text-xs underline" onClick={() => setRedirectIn(null)}>Cancelar</button>}
            </div>
          </section>
        )}

        {ready && (
          <>
            <section className="space-y-4 rounded-[18px] border border-[#5BD69A]/40 bg-[#5BD69A]/10 p-5">
              <p className="text-lg font-semibold">Tudo pronto: {chosenVideos} {chosenVideos === 1 ? "vídeo" : "vídeos"} · {chosenScenes} {chosenScenes === 1 ? "cena" : "cenas"}{(p.takes ?? 1) > 1 ? ` × ${p.takes} takes` : ""}</p>
              <div data-testid="pick-scenes" className="space-y-2 rounded-[14px] border border-border bg-background/40 p-3">
                <p className="text-xs text-muted-foreground">Não quer tudo isso? Desmarque o vídeo ou a cena que não quer gerar. Só o que ficar marcado vai para o Flow.</p>
                <ul className="space-y-2 text-sm">
                  {p.variations.map((variation, vi) => (
                    <li key={vi} className="flex flex-wrap items-center gap-2">
                      <label className="flex min-w-0 items-center gap-2">
                        <input type="checkbox" checked={wantVideo(vi)} onChange={(event) => setSkip((cur) => ({ ...cur, [String(vi)]: !event.target.checked }))} aria-label={`Gerar o vídeo ${pad(vi + 1)}`} />
                        <span className="min-w-0">Vídeo {pad(vi + 1)} · {variation.title}</span>
                      </label>
                      {wantVideo(vi) && Array.from({ length: p.sceneCount }, (_, si) => (
                        <button key={si} type="button" aria-pressed={wantScene(vi, si)} aria-label={`Cena ${si + 1} do vídeo ${pad(vi + 1)}`}
                          onClick={() => setSkip((cur) => ({ ...cur, [`${vi}-${si}`]: !cur[`${vi}-${si}`] }))}
                          className={cn("rounded-full border px-2.5 py-0.5 text-xs", wantScene(vi, si) ? "border-[#7B3FE4] bg-[#7B3FE4]/25 text-foreground" : "border-border text-muted-foreground line-through")}>
                          Cena {si + 1}
                        </button>
                      ))}
                    </li>
                  ))}
                </ul>
              </div>
              <PolicyNotice hits={policyHits} confirmed={policyOk === policyKey} onConfirm={(value) => setPolicyOk(value ? policyKey : "")} />
              <Button type="button" size="lg" disabled={policyBlocked || chosenScenes === 0} className="rounded-full bg-gradient-to-br from-[#8B5CF6] to-[#7B3FE4] text-white disabled:opacity-50" onClick={sendToFlow}>
                <ExternalLink className="size-4" /> Enviar para o Flow
              </Button>
              {copied === "flow-send" && <p className="text-xs text-[#5BD69A]">Enviado.</p>}
            </section>

            {manualMode === "hidden" ? (
              <button type="button" onClick={() => setManualMode("closed")} className="text-xs text-muted-foreground underline">Mostrar a geração manual no Flow</button>
            ) : (
            <details open={manualMode === "open"} onToggle={(event) => { const o = (event.currentTarget as HTMLDetailsElement).open; setManualMode((m) => (m === "hidden" ? m : o ? "open" : "closed")); }} className="rounded-[18px] border border-[#7B3FE4]/50 bg-[#7B3FE4]/10 p-5 text-sm" data-testid="guided-flow">
              <summary className="flex cursor-pointer items-center gap-2 text-base font-semibold">
                <span>{lowPriority ? "Gerar no Flow · Lower Priority (sem custo)" : "Gerar no Flow"}</span>
                <span className="ml-auto flex items-center gap-1">
                  <button type="button" aria-label="Editar a geração no Flow" title="Editar" onClick={(event) => { event.preventDefault(); const t = document.getElementById("change-text"); t?.scrollIntoView?.({ behavior: "smooth", block: "center" }); t?.focus(); }} className="grid size-8 place-items-center rounded-full border border-border text-muted-foreground hover:text-foreground"><Pencil className="size-4" /></button>
                  <button type="button" aria-label="Remover a geração no Flow" title="Remover" onClick={(event) => { event.preventDefault(); setManualMode("hidden"); }} className="grid size-8 place-items-center rounded-full border border-border text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
                </span>
              </summary>
              <div className="mt-3 rounded-[12px] border border-border bg-card p-3">{modelChooser()}</div>
              <div className="mt-4 rounded-[12px] border border-border bg-card p-3" data-testid="flow-extension">
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {copyButton("flow-package", flowPackage(), "Copiar pacote")}
                  <a href="/extensao/clipgringa-flow.zip" download className="inline-flex items-center rounded-full border border-border px-3 py-1.5 text-xs hover:text-foreground">Baixar extensão</a>
                </div>
              </div>
              <div className="mt-4 space-y-3">
                {p.variations.map((variation, vi) => (
                  <div key={vi} className="space-y-2">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">Vídeo {pad(vi + 1)} · {variation.title}</p>
                      {p.variations.length > 1 && <button type="button" aria-label={`Remover o vídeo ${pad(vi + 1)}`} title="Remover este vídeo" onClick={() => removeVideo(vi)} className="ml-auto grid size-7 place-items-center rounded-full border border-border text-muted-foreground hover:text-foreground"><X className="size-3.5" /></button>}
                    </div>
                    {Array.from({ length: p.sceneCount }, (_, si) => (
                      <div key={si} className="space-y-2 rounded-[12px] border border-border bg-card px-3 py-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="min-w-28 text-xs tabular-nums text-muted-foreground">Cena {pad(si + 1)} · {fileName(vi, si, "x.mp4")}</span>
                          {copyButton(`g-img-${vi}-${si}`, p.images[vi]?.prompts[si] ?? "", "Copiar prompt da imagem")}
                          {copyButton(`g-vid-${vi}-${si}`, p.videos[vi]?.prompts[si] ?? "", "Copiar prompt da animação")}
                          <span className="ml-auto flex items-center gap-1">
                            <button type="button" aria-label={`Editar a cena ${pad(si + 1)} do vídeo ${pad(vi + 1)}`} title="Editar os prompts" onClick={() => setEditing((e) => (e === `${vi}-${si}` ? null : `${vi}-${si}`))} className="grid size-8 place-items-center rounded-full border border-border text-muted-foreground hover:text-foreground"><Pencil className="size-4" /></button>
                            {p.sceneCount > 1 && <button type="button" aria-label={`Remover a cena ${pad(si + 1)}`} title="Remover esta cena de todos os vídeos" onClick={() => removeScene(si)} className="grid size-8 place-items-center rounded-full border border-border text-muted-foreground hover:text-foreground"><X className="size-4" /></button>}
                          </span>
                        </div>
                        {editing === `${vi}-${si}` && (
                          <div className="space-y-2">
                            <label className="block text-xs text-muted-foreground">Prompt da imagem
                              <textarea value={p.images[vi]?.prompts[si] ?? ""} onChange={(event) => editPrompt("images", vi, si, event.target.value)} rows={3} className={`${inputClass} mt-1`} />
                            </label>
                            <label className="block text-xs text-muted-foreground">Prompt da animação
                              <textarea value={p.videos[vi]?.prompts[si] ?? ""} onChange={(event) => editPrompt("videos", vi, si, event.target.value)} rows={3} className={`${inputClass} mt-1`} />
                            </label>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </details>
            )}

            <section className="space-y-3 rounded-[18px] border border-border bg-card p-5">
              <p className="font-medium">Já gerou no Flow? Envie os vídeos aqui</p>
              <p className="text-xs text-muted-foreground">Escolha todos de uma vez. Os arquivos que o Flow baixa (Video01_Cena01.mp4…) já se encaixam sozinhos.</p>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-dashed border-border px-5 py-3 text-sm hover:text-foreground">
                <Upload className="size-4" /> Escolher os vídeos
                <input type="file" multiple accept="video/*" aria-label="Enviar os vídeos gerados no Flow" className="sr-only"
                  onChange={(event) => { const files = Array.from(event.target.files ?? []); event.target.value = ""; if (files.length) attachMany(files); }} />
              </label>
              <p className="text-sm tabular-nums">{received} de {sceneTotal} cenas recebidas</p>
              {received > 0 && (
                <ul className="grid gap-1 text-xs sm:grid-cols-2">
                  {p.variations.flatMap((_, vi) => Array.from({ length: p.sceneCount }, (__, si) => ({ vi, si }))).map(({ vi, si }) => (
                    <li key={`${vi}-${si}`} className="flex items-center gap-2">
                      {clips[`${vi}-${si}`] ? <Check className="size-3.5 text-[#5BD69A]" /> : <span className="size-3.5 rounded-full border border-border" />}
                      <span className="font-mono">{fileName(vi, si, "x.mp4")}</span>
                    </li>
                  ))}
                </ul>
              )}
              {received === sceneTotal && sceneTotal > 0 && (
                <Button type="button" size="lg" className="rounded-full bg-gradient-to-br from-[#8B5CF6] to-[#7B3FE4] text-white" onClick={() => void assembleAll()} disabled={assembling_}>
                  Montar todos os vídeos
                </Button>
              )}
            </section>

            {p.variations.map((variation, vi) => {
              const b = built[vi];
              const jobId = b?.jobId ?? p.final[vi];
              const isDone = Boolean(jobId) && b?.state !== "running" && b?.state !== "error";
              if (!b && !jobId) return null;
              return (
                <section key={vi} className="space-y-2 rounded-[18px] border border-border bg-card p-5">
                  <p className="font-medium">Vídeo {pad(vi + 1)} · {variation.title}</p>
                  {b?.state === "running" && <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="size-3.5 animate-spin" /> Montando…</p>}
                  {b?.state === "error" && <p role="alert" className="text-xs text-[#F0466B]">{b.note}</p>}
                  {isDone && jobId && (
                    <div className="space-y-2">
                      <video controls src={`/api/multiplier/jobs/${jobId}/outputs/1`} className="max-h-80 rounded-[12px] border border-border" />
                      <a href={`/api/multiplier/jobs/${jobId}/outputs/1?download=true`} className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-1.5 text-sm hover:text-foreground">
                        <Download className="size-3.5" /> Baixar vídeo {pad(vi + 1)}
                      </a>
                    </div>
                  )}
                </section>
              );
            })}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div aria-hidden className="h-1.5 overflow-hidden rounded-full bg-border">
        <div className="h-full rounded-full bg-gradient-to-r from-[#8B5CF6] to-[#7B3FE4] transition-[width] duration-500" style={{ width: `${(p.step / STEPS.length) * 100}%` }} />
      </div>
      <ol aria-label="Etapas da clonagem" className="flex flex-wrap items-center gap-2 text-xs">
        {STEPS.map((name, index) => {
          const number = index + 1;
          const done = number < p.step;
          const active = number === p.step;
          return (
            <li key={name} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => number <= p.step && patch({ step: number })}
                disabled={number > p.step}
                aria-current={active ? "step" : undefined}
                className={cn("flex items-center gap-2 rounded-full border px-3 py-1.5 transition-colors",
                  active ? "border-transparent bg-primary text-primary-foreground" : done ? "border-border text-foreground" : "border-border text-muted-foreground opacity-70")}
              >
                <span className={cn("flex size-5 items-center justify-center rounded-full text-[10px] font-semibold", active ? "bg-background/25" : "bg-muted")}>
                  {done ? <Check className="size-3" /> : number}
                </span>
                {name}
              </button>
              {number < STEPS.length && <span className="h-px w-4 bg-border" />}
            </li>
          );
        })}
      </ol>

      {error && (
        <Alert variant="destructive" ref={errorRef}>
          <AlertDescription>{error}{/tokens acabaram/i.test(error) && <> <a href={ADMIN_WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="font-medium underline">Chamar o administrador no WhatsApp</a></>}</AlertDescription>
        </Alert>
      )}
      {canResume && !auto && paid && (
        <Button type="button" variant="outline" onClick={() => void runAll()}>Continuar de onde parou</Button>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_260px]">
        <section className="space-y-4 rounded-[18px] border border-border bg-card p-5">
          <p className="text-sm font-medium text-primary">Passo {p.step} de {STEPS.length}: <span className="font-normal text-foreground">{HINTS[p.step - 1]}</span></p>
          {(auto || runningTask) && (
            <div ref={progressRef} data-testid="creation-progress" className="cg-orbit sticky top-2 z-10" style={{ "--cg-r": "20px" } as React.CSSProperties}>
            <div role="status" aria-live="polite" className="relative space-y-2 rounded-[18px] border border-[#A98BFF]/40 bg-[#141316] p-4 shadow-[0_12px_32px_-18px_#7B3FE4]">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="font-medium">{auto ? auto.label : runningTask?.label}{!auto && batch ? ` (${Math.min(batch.done + 1, batch.total)} de ${batch.total})` : ""}</span>
                <span className="tabular-nums text-xs text-muted-foreground">{Math.round(pct)}%</span>
              </div>
              <div role="progressbar" aria-label="Progresso" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} className="h-2 overflow-hidden rounded-full bg-border">
                <div className="h-full rounded-full bg-gradient-to-r from-[#8B5CF6] to-[#7B3FE4] transition-[width] duration-700" style={{ width: `${pct}%` }} />
              </div>
              {nowItems.length > 0 && (
                <p className="text-xs">
                  <span className="text-muted-foreground">Agora: </span>
                  {nowItems.join(" · ")}
                </p>
              )}
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  {auto ? `Estamos fazendo tudo por você. Tempo estimado: cerca de ${etaMin} min. Pode esperar aqui, não precisa fazer nada.` : `${steps[Math.min(steps.length - 1, Math.floor(secs / 12))]} Pode esperar aqui, não precisa fazer nada.`}
                  {assembling ? " Montar o vídeo leva de 1 a 3 minutos." : ""}
                </p>
                {auto && <button type="button" onClick={() => { stopRef.current = true; }} className="shrink-0 text-xs underline text-muted-foreground">Parar</button>}
              </div>
            </div>
            </div>
          )}
          {p.step === 1 && (
            <>
              {heading("1 · REFERÊNCIA — A COPY VALIDADA É O TRONCO")}
              <p className="text-sm text-muted-foreground">
                Escolha o vídeo que vai modelar e confira a copy, o mecanismo e a sequência. Por padrão as variações preservam essa mensagem: só mudam o avatar e a apresentação.
              </p>
              <input ref={fileRef} type="file" accept="video/*" className="sr-only" aria-label="Escolher vídeo de referência"
                onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void readReference(file); }} />
              <Button type="button" onClick={() => fileRef.current?.click()} disabled={working} className="w-full">
                {busy === "upload" ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                {busy === "upload" ? "Transcrevendo o vídeo…" : "Escolher vídeo"}
              </Button>
              <LinkVideo onFile={(file) => void readReference(file)} disabled={working} />
              {(refFile || p.reference.trim()) && <ReferenceSummary file={refFile} transcript={p.reference} reading={busy === "upload"} noSpeech={speech === "nospeech"} />}
              {refFile && p.avatarMode !== "own" && <PresenterChoice detected={refGender.gender} reading={refGender.reading} value={p.presenter ?? ""} onChange={(value) => patch({ presenter: value })} />}
              <Field label="Transcrição do vídeo (ou descreva o que acontece)" hint="Preenchida sozinha ao escolher o vídeo. Você pode editar ou colar o texto direto.">
                <textarea value={p.reference} onChange={(event) => patch({ reference: event.target.value })} rows={5} maxLength={4000} className={inputClass} />
              </Field>
              <Field label="Notas sobre o vídeo (opcional)" hint="Ritmo, estilo, o que funcionou nele. A IA lê a transcrição e as notas, não as imagens do vídeo.">
                <textarea value={p.notes} onChange={(event) => patch({ notes: event.target.value })} rows={2} maxLength={600} className={inputClass} />
              </Field>
              {render?.enabled && flowAccount.plan && /ultra/i.test(flowAccount.plan) && (
                <Group label="Como gerar as imagens e as cenas" hint={mode === "free" ? "Você gera no Flow com Veo 3.1 Lite [Lower Priority]. O Flow mostra “A geração vai usar 0 créditos”." : "A ferramenta gera sozinha pela API do Google. Esse modo é cobrado por uso."}>
                  <Chips label="Como gerar" value={mode} onPick={chooseMode} options={[{ value: "free" as const, text: "Flow · Lower Priority (sem custo)" }]} />
                </Group>
              )}
              <Group label="Modelo do Flow" hint="Escolha o modelo que a extensão usa. Fica salvo para os próximos vídeos.">
                {modelChooser()}
              </Group>
              <Group label="Idioma da fala" hint="A voz e os textos do vídeo saem neste idioma.">
                <Chips label="Idioma da fala" value={p.language} onPick={chooseLanguage} disabled={working} options={LANGUAGES.map((l) => ({ value: l.value, text: l.text }))} />
              </Group>
              <Group label="Quantas cenas" hint="Cada cena tem cerca de 8 segundos. Com 4 cenas o vídeo fica com cerca de 32 segundos, tempo de sobra para mostrar e falar do produto.">
                <Chips label="Quantas cenas" value={p.sceneCount} onPick={chooseScenes} disabled={working} options={[1, 2, 3, 4, 5, 6].map((n) => ({ value: n, text: n === 1 ? "1 cena" : `${n} cenas` }))} />
              </Group>
              <Group label="Quantos vídeos" hint="Escolha a quantidade e depois clique em “Gerar com essas opções”. Nada é gerado até você clicar.">
                <Chips label="Quantos vídeos" value={p.count} onPick={chooseCount} disabled={working} options={COUNT_OPTIONS.map((n) => ({ value: n, text: String(n) }))} />
                {optionsChanged && (
                  <Button type="button" className="mt-2 rounded-full bg-gradient-to-br from-[#8B5CF6] to-[#7B3FE4] text-white" disabled={working || (p.reference.trim().length < 20 && p.notes.trim().length < 20)} onClick={() => startAuto()}>Gerar com essas opções</Button>
                )}
              </Group>
              {paid && (
                <div className="space-y-4 rounded-[18px] border border-[#A98BFF]/40 bg-gradient-to-br from-[#7B3FE4]/25 via-[#7B3FE4]/10 to-transparent p-5 shadow-[0_18px_40px_-24px_#7B3FE4]">
                  <p className="text-lg font-semibold">Criar tudo automaticamente</p>
                  <p className="text-xs text-muted-foreground">Escolha as opções e clique. A ferramenta escreve, gera as imagens, anima as cenas e monta os vídeos prontos.</p>
                  <Group label="Quantos vídeos">
                    <Chips label="Quantos vídeos" value={p.count} onPick={(count) => patch({ count })} options={COUNT_OPTIONS.map((n) => ({ value: n, text: String(n) }))} />
                    <p className="text-xs text-muted-foreground">{p.count} {p.count === 1 ? "vídeo" : "vídeos"} × {p.sceneCount} {p.sceneCount === 1 ? "cena" : "cenas"} = {p.count * p.sceneCount} cenas para animar. Tempo estimado: cerca de {Math.max(2, Math.ceil((p.count * p.sceneCount * (15 + 180)) / 3 / 60))} min, e o app avisa cada etapa.</p>
                  </Group>
                  <Group label="Palavra-chave da CTA">
                    <KeywordPicker keyword={p.keyword} keepCase={p.keepCase} placeholder="Ou escreva outra palavra" onChange={(keyword) => patch({ keyword })} onKeepCase={(keepCase) => patch({ keepCase, keyword: keepCase ? p.keyword : p.keyword.toUpperCase() })} />
                  </Group>
                  <Button type="button" size="lg" className="w-full rounded-full bg-gradient-to-br from-[#8B5CF6] to-[#7B3FE4] text-white sm:w-auto" onClick={() => void runAll()} disabled={working || (p.reference.trim().length < 20 && p.notes.trim().length < 20) || !p.keyword.trim()}>
                    {Object.keys(p.gen).length > 0 || p.scenes.length > 0 ? "Continuar de onde parou" : "Criar meus vídeos automaticamente"}
                  </Button>
                </div>
              )}
              <div>{generateButton("scenes", "Separar em cenas", p.scenes.length > 0, "Separando as cenas da referência", p.reference.trim().length < 20 && p.notes.trim().length < 20)}</div>
              {p.scenes.length > 0 && (
                <div className="space-y-3">
                  {p.scenes.map((scene, i) => (
                    <div key={i} className="space-y-1 rounded-[14px] border border-border p-3">
                      <p className="text-xs text-muted-foreground">Cena {i + 1} · {scene.what}</p>
                      <textarea aria-label={`Fala da cena ${i + 1}`} value={scene.line} rows={2} maxLength={300} className={inputClass}
                        onChange={(event) => setP((current) => ({ ...current, scenes: current.scenes.map((s, j) => (j === i ? { ...s, line: event.target.value } : s)), videos: [] }))} />
                    </div>
                  ))}
                  <p className="text-xs text-muted-foreground">A CTA entra no fim da última cena, na etapa 4. Não a escreva aqui.</p>

                  <div role="radiogroup" aria-label="Copy das variações" className="flex flex-wrap gap-2 pt-2">
                    {([["same", "Manter a mesma copy (método Árvore)"], ["mix", "Variar ganchos, corpos e CTAs"]] as const).map(([value, label]) => (
                      <button key={value} type="button" role="radio" aria-checked={p.copyMode === value} onClick={() => patch({ copyMode: value, videos: [], ctaLocked: false })}
                        className={cn("rounded-full border px-4 py-1.5 text-sm", p.copyMode === value ? "border-transparent bg-primary text-primary-foreground" : "border-border text-muted-foreground")}>
                        {label}
                      </button>
                    ))}
                  </div>
                  {p.copyMode === "mix" && (
                    <div className="space-y-3 rounded-[14px] border border-border p-3">
                      <p className="text-sm text-muted-foreground">
                        A IA escreve ganchos, corpos e CTAs alternativos, com a mesma oferta e o mesmo mecanismo. Cada vídeo usa uma combinação diferente: cena 1 = gancho, cena 2 = corpo, cena 3 = CTA.
                      </p>
                      <div>{generateButton("mix", "Gerar ganchos, corpos e CTAs", mixReady, "Escrevendo ganchos, corpos e CTAs")}</div>
                      {p.mix.hooks.length > 0 && (
                        <div className="space-y-4">
                          {mixList("hooks", "Ganchos")}
                          {mixList("bodies", "Corpos")}
                          {mixList("ctas", "CTAs", "Cada CTA precisa ter {KEYWORD}, que vira a palavra-chave na etapa 4.")}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {p.step === 2 && (
            <>
              {heading("2 · AGENTE E AVATARES")}
              <p className="text-sm text-muted-foreground">Escolha quem vai apresentar a mensagem. Cada avatar fica igual em todas as cenas do seu vídeo.</p>
              <div role="radiogroup" aria-label="Avatares" className="flex flex-wrap gap-2">
                {([["own", "Meus avatares"], ["random", "Avatares aleatórios"]] as const).map(([value, label]) => (
                  <button key={value} type="button" role="radio" aria-checked={p.avatarMode === value} onClick={() => patch({ avatarMode: value })}
                    className={cn("rounded-full border px-4 py-1.5 text-sm", p.avatarMode === value ? "border-transparent bg-primary text-primary-foreground" : "border-border text-muted-foreground")}>
                    {label}
                  </button>
                ))}
              </div>
              {p.avatarMode === "own" && (
                <div className="space-y-3">
                  {p.avatars.map((avatar) => (
                    <div key={avatar.id} className="grid gap-3 rounded-[14px] border border-border p-3 sm:grid-cols-[160px_minmax(0,1fr)_auto]">
                      <input value={avatar.name} maxLength={40} placeholder="Nome (Ana)" aria-label="Nome do avatar" className={inputClass}
                        onChange={(event) => patch({ avatars: p.avatars.map((a) => (a.id === avatar.id ? { ...a, name: event.target.value } : a)) })} />
                      <input value={avatar.look} maxLength={300} placeholder="Mulher de 30 anos, cabelo castanho, camiseta branca" aria-label="Aparência do avatar" className={inputClass}
                        onChange={(event) => patch({ avatars: p.avatars.map((a) => (a.id === avatar.id ? { ...a, look: event.target.value } : a)) })} />
                      <div className="flex flex-wrap gap-1.5 sm:col-span-3">
                        {LOOK_PRESETS.map(([text, look]) => (
                          <button key={text} type="button" onClick={() => patch({ avatars: p.avatars.map((a) => (a.id === avatar.id ? { ...a, look, name: a.name || text } : a)) })}
                            className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:text-foreground">{text}</button>
                        ))}
                      </div>
                      <Button type="button" variant="ghost" size="icon" aria-label="Remover avatar" onClick={() => patch({ avatars: p.avatars.filter((a) => a.id !== avatar.id) })}>
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  ))}
                  {p.avatars.length < 4 && (
                    <Button type="button" variant="outline" onClick={() => patch({ avatars: [...p.avatars, { id: `${Date.now()}`, name: "", look: "" }] })}>
                      <Plus className="size-4" /> Adicionar avatar
                    </Button>
                  )}
                  <p className="text-xs text-muted-foreground">No Flow, gere ou envie a imagem de cada avatar e use como referência nas cenas.</p>
                </div>
              )}
              <div className="space-y-3 rounded-[14px] border border-border p-4">
                <div>
                  <p className="font-medium">Objeto em todo take <span className="rounded-full bg-[#7B3FE4]/20 px-2 py-0.5 text-[10px] font-semibold text-[#A98BFF]">BETA</span></p>
                  <p className="text-xs text-muted-foreground">Escreva o objeto (ex.: bandeira dos EUA). Ele entra no prompt de todas as cenas para o Flow inserir na imagem e no vídeo.</p>
                </div>
                {(p.objects ?? []).map((obj) => (
                  <div key={obj.id} className="space-y-2 rounded-lg bg-muted/30 p-3">
                    <div className="flex gap-2">
                      <input value={obj.name} maxLength={80} placeholder="Ex.: bandeira dos EUA" aria-label="Nome do objeto" className={inputClass}
                        onChange={(event) => patch({ objects: p.objects.map((o) => (o.id === obj.id ? { ...o, name: event.target.value } : o)), images: [], videos: [] })} />
                      <Button type="button" variant="ghost" size="icon" aria-label="Remover objeto" onClick={() => patch({ objects: p.objects.filter((o) => o.id !== obj.id), images: [], videos: [] })}>
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                    <Chips label="Onde fica o objeto" value={obj.place} onPick={(place) => patch({ objects: p.objects.map((o) => (o.id === obj.id ? { ...o, place: o.place === place ? "" : place } : o)), images: [], videos: [] })} options={OBJECT_PLACES.map((v) => ({ value: v, text: v }))} />
                    <Chips label="Posição no quadro" value={obj.position} onPick={(position) => patch({ objects: p.objects.map((o) => (o.id === obj.id ? { ...o, position } : o)), images: [], videos: [] })} options={OBJECT_POSITIONS} />
                  </div>
                ))}
                {(p.objects ?? []).length < 3 && (
                  <Button type="button" variant="outline" onClick={() => patch({ objects: [...(p.objects ?? []), { id: `${Date.now()}`, name: "", place: "", position: "any" }] })}>
                    <Plus className="size-4" /> Adicionar objeto
                  </Button>
                )}
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <Group label="Quantos vídeos">
                  <Chips label="Quantos vídeos" value={p.count} onPick={(count) => patch({ count })} options={COUNT_OPTIONS.map((n) => ({ value: n, text: String(n) }))} />
                </Group>
                {generateButton("variations", "Gerar variações", p.variations.length > 0, "Planejando as variações", p.avatarMode === "own" && !p.avatars.some((a) => a.name.trim()))}
              </div>
              {p.variations.length > 0 && (
                <ul className="grid gap-3 sm:grid-cols-2">
                  {p.variations.map((v, i) => {
                    const pick = mixPick(p.mix, i);
                    return (
                      <li key={`${v.title}-${i}`} className="space-y-1 rounded-[14px] border border-border p-4">
                        <p className="font-medium">Vídeo {pad(i + 1)} · {v.title}</p>
                        <p className="text-xs text-muted-foreground">Avatar: {v.avatar} · {v.setting}</p>
                        <p className="text-sm">{v.summary}</p>
                        {p.copyMode === "mix" && mixReady && (
                          <p className="text-xs text-muted-foreground">Gancho {pick.hook.index + 1} · Corpo {pick.body.index + 1} · CTA {pick.cta.index + 1}</p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}

          {p.step === 3 && (
            <>
              {heading("3 · APROVAR IMAGENS")}
              <p className="text-sm text-muted-foreground">
                Copie cada prompt para o Flow (Nano Banana) e gere a imagem. Confira rosto, cenário e ação e aprove só as boas. A imagem aprovada é a base da animação. Não avance com uma imagem que você não aprovou.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                {generateButton("images", "Gerar prompts de imagem", p.images.length > 0, "Criando os prompts de imagem")}
                {paid && p.images.length > 0 && (
                  <Button type="button" onClick={() => void genAll("image")} disabled={working || p.variations.every((_, vi) => Array.from({ length: p.sceneCount }, (__, si) => p.gen[`${vi}-${si}`]?.image).every(Boolean))}>
                    Gerar todas as imagens
                  </Button>
                )}
                {p.images.length > 0 && <span className="text-sm text-muted-foreground tabular-nums">{approvedCount} de {total} aprovadas</span>}
              </div>
              {p.images.map((set, vi) => (
                <div key={vi} className="space-y-3 rounded-[14px] border border-border p-4">
                  <p className="font-medium">Vídeo {pad(vi + 1)} · {p.variations[vi]?.title}</p>
                  {set.prompts.map((prompt, si) => {
                    const key = `${vi}-${si}`;
                    return (
                      <div key={si} className="space-y-2">
                        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                          <span>Cena {si + 1}</span>
                          {copyButton(`i-${key}`, prompt)}
                        </div>
                        <p className="rounded-lg bg-muted/40 p-3 text-sm">{prompt}</p>
                        <div className="flex flex-wrap items-center gap-3">
                          {imgs[key] ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={imgs[key]} alt={`Imagem da cena ${si + 1} do vídeo ${pad(vi + 1)}`} className="h-32 rounded-lg bg-black object-cover" />
                          ) : (
                            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground hover:text-foreground">
                              <Upload className="size-3.5" /> Enviar a imagem para conferir
                              <input type="file" accept="image/*" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) attach(key, file, "image"); }} />
                            </label>
                          )}
                          {paid && (
                            <Button type="button" size="sm" variant="outline" disabled={working || genBusy[`image-${key}`]} onClick={() => void genOne("image", vi, si)}>
                              {genBusy[`image-${key}`] ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                              {genBusy[`image-${key}`] ? "Gerando…" : imgs[key] ? "Gerar outra imagem" : "Gerar a imagem aqui"}
                            </Button>
                          )}
                          <label className="flex items-center gap-2 text-sm">
                            <input type="checkbox" checked={Boolean(p.approved[key])} onChange={(event) => toggle("approved", key, event.target.checked)} className="size-4" />
                            Aprovada
                          </label>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </>
          )}

          {p.step === 4 && (
            <>
              {heading("4 · AJUSTAR A CTA PARA O SEU PRODUTO")}
              <p className="text-sm text-muted-foreground">
                {p.copyMode === "mix"
                  ? "Defina o produto e a palavra-chave do funil. Cada vídeo fecha com a sua CTA, e todas pedem para comentar a mesma palavra-chave."
                  : "Adapte o fechamento ao produto e à palavra-chave do funil. Depois de travada, a CTA fica igual em todas as variações. A ação continua sendo comentar a palavra-chave."}
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Produto (opcional)">
                  <input value={p.product} onChange={(event) => patch({ product: event.target.value })} disabled={p.ctaLocked} maxLength={120} className={inputClass} />
                </Field>
                <Group label="Palavra-chave">
                  <KeywordPicker keyword={p.keyword} keepCase={p.keepCase} disabled={p.ctaLocked} placeholder="LIMON" onChange={(keyword) => patch({ keyword })} onKeepCase={(keepCase) => patch({ keepCase, keyword: keepCase ? p.keyword : p.keyword.toUpperCase() })} />
                </Group>
              </div>
              {p.copyMode === "same" && (
                <Group label="Frase da CTA" hint="Use {KEYWORD} onde a palavra-chave deve aparecer.">
                  <div className="space-y-2">
                    <Chips label="Frases prontas" disabled={p.ctaLocked} value={p.cta} onPick={(cta) => patch({ cta })} options={CTA_PRESETS.map((c) => ({ value: c, text: c.replace("{KEYWORD}", "…") }))} />
                    <input value={p.cta} onChange={(event) => patch({ cta: event.target.value })} disabled={p.ctaLocked} maxLength={200} aria-label="Ou escreva a sua frase" className={inputClass} />
                  </div>
                </Group>
              )}
              <div className="space-y-2 rounded-[14px] border border-border p-3 text-sm">
                <p className="text-xs text-muted-foreground">{p.copyMode === "mix" ? "Fala final de cada vídeo" : "Fala final, igual em todos os vídeos"}</p>
                {(p.copyMode === "mix" ? p.variations.map((_, i) => i) : [0]).map((vi) => (
                  <p key={vi}>{p.copyMode === "mix" && <span className="text-xs text-muted-foreground">Vídeo {pad(vi + 1)} · </span>}“{linesFor(vi)[p.sceneCount - 1]}”</p>
                ))}
              </div>
              {p.ctaLocked ? (
                <Button type="button" variant="outline" onClick={() => patch({ ctaLocked: false, videos: [] })}><Unlock className="size-4" /> Destravar a CTA</Button>
              ) : (
                <Button type="button" onClick={() => patch({ ctaLocked: true })} disabled={!p.keyword.trim() || !ctaValid}><Lock className="size-4" /> Travar a CTA</Button>
              )}
              {!p.ctaLocked && !ctaValid && <p className="text-xs text-[#F5B454]">{p.copyMode === "mix" ? "Gere os ganchos, corpos e CTAs na etapa 1." : "A frase precisa ter {KEYWORD}."}</p>}
              <p className="text-xs text-muted-foreground">Confira se a palavra-chave {keywordOrDefault} está configurada na automação de comentários.</p>
            </>
          )}

          {p.step === 5 && (
            <>
              {heading("5 · ANIMAÇÕES")}
              <p className="text-sm text-muted-foreground">
                As imagens aprovadas viram cenas animadas. No Flow, use a imagem aprovada como primeiro quadro, no modo de menor prioridade (lower priority), cole o prompt e gere. Assista e confira a fala, os movimentos e a continuidade antes de baixar.
              </p>
              <div className="flex flex-wrap gap-2">
                {generateButton("videos", "Gerar prompts de animação", p.videos.length > 0, "Criando os prompts de animação", !p.ctaLocked)}
                {paid && p.videos.length > 0 && (
                  <Button type="button" onClick={() => void genAll("video")} disabled={working || p.variations.every((_, vi) => Array.from({ length: p.sceneCount }, (__, si) => p.gen[`${vi}-${si}`]?.video).every(Boolean))}>
                    Gerar todas as cenas animadas
                  </Button>
                )}
              </div>
              {p.videos.length > 0 && (
                <div className="space-y-2 rounded-[14px] border border-[#5BD69A]/40 bg-[#5BD69A]/10 p-3 text-sm" data-testid="flow-lower-priority">
                  <p className="font-medium">{lowPriority ? "Gerar no Flow, sem gastar créditos (Lower Priority)" : "Gerar no Flow"}</p>
                  {modelChooser()}
                  <p className="text-xs text-muted-foreground">{lowPriority ? "No Flow, use o modelo “Veo 3.1 - Lite [Lower Priority]”, 8s e x1. O Flow mostra “A geração vai usar 0 créditos”. " : "No Flow, use o modelo escolhido acima, 8s e x1. "}Com a extensão, isso é feito sozinho: clique em “Enviar para o Flow”. O pacote vai direto para a extensão, sem copiar e colar.</p>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" className="rounded-full bg-gradient-to-br from-[#8B5CF6] to-[#7B3FE4] text-white" onClick={() => { markSent(); void copy("flow-send", flowPackage()); void pushPackage(flowPackage()).then((ok) => { if (!ok) window.open(FLOW_HOME_URL, "_blank", "noopener"); }); }}>
                      <ExternalLink className="size-3.5" /> Enviar para o Flow
                    </Button>
                    {copyButton("flow-pack", flowPackage(), "Copiar pacote para o Flow")}
                  </div>
                </div>
              )}
              {p.videos.map((set, vi) => (
                <div key={vi} className="space-y-3 rounded-[14px] border border-border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">Vídeo {pad(vi + 1)} · {p.variations[vi]?.title}</p>
                    {copyButton(`all-${vi}`, set.prompts.join("\n\n"), "Copiar os 3 prompts")}
                  </div>
                  {set.prompts.map((prompt, si) => {
                    const key = `${vi}-${si}`;
                    const clip = clips[key];
                    return (
                      <div key={si} className="space-y-2">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>Cena {si + 1} · {fileName(vi, si, "x.mp4")}</span>
                          {copyButton(`v-${key}`, prompt)}
                        </div>
                        <p className="rounded-lg bg-muted/40 p-3 text-sm">{prompt}</p>
                        {si === p.sceneCount - 1 && <p className="text-xs text-[#F5B454]">Revise a CTA e a palavra-chave na cena final.</p>}
                        {paid && (
                          <Button type="button" size="sm" variant="outline" disabled={working || genBusy[`video-${key}`]} onClick={() => void genOne("video", vi, si)}>
                            {genBusy[`video-${key}`] ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                            {genBusy[`video-${key}`] ? "Animando… leva alguns minutos" : clip ? "Gerar outra vez" : "Gerar a cena aqui"}
                          </Button>
                        )}
                        {clip ? (
                          <div className="flex items-start gap-3">
                            <video src={clip.url} controls playsInline className="h-40 rounded-lg bg-black" />
                            <div className="space-y-2 text-xs text-muted-foreground">
                              <p className="break-all">{clip.name}</p>
                              <label className="flex items-center gap-2 text-sm text-foreground">
                                <input type="checkbox" checked={Boolean(p.checks[`rev-${key}`])} onChange={(event) => toggle("checks", `rev-${key}`, event.target.checked)} className="size-4" />
                                Conferi fala, movimento e continuidade
                              </label>
                              <button type="button" className="flex items-center gap-1" onClick={() => setClips((current) => { const next = { ...current }; URL.revokeObjectURL(next[key].url); delete next[key]; return next; })}>
                                <X className="size-3.5" /> Remover
                              </button>
                            </div>
                          </div>
                        ) : (
                          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground hover:text-foreground">
                            <Upload className="size-3.5" /> Enviar o vídeo desta cena
                            <input type="file" accept="video/*" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) attach(key, file, "video"); }} />
                          </label>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </>
          )}

          {p.step === 6 && (
            <>
              {heading("6 · BAIXAR AS CENAS COM OS NOMES CERTOS")}
              <p className="text-sm text-muted-foreground">
                Baixe todas as cenas aprovadas. Os arquivos saem com o nome e a numeração em ordem. Separe uma pasta para cada vídeo.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={() => void downloadAll()} disabled={Object.keys(clips).length === 0}><Download className="size-4" /> Baixar todas as cenas enviadas</Button>
                <Button type="button" variant="outline" onClick={exportAll} disabled={p.variations.length === 0}><Download className="size-4" /> Baixar projeto (.txt)</Button>
              </div>
              {p.variations.map((v, vi) => (
                <div key={vi} className="space-y-2 rounded-[14px] border border-border p-4">
                  <p className="font-medium">Pasta Video{pad(vi + 1)} · {v.title}</p>
                  <ul className="space-y-1 text-sm">
                    {Array.from({ length: p.sceneCount }, (_, si) => {
                      const clip = clips[`${vi}-${si}`];
                      return (
                        <li key={si} className="flex items-center justify-between gap-2">
                          <span className="font-mono text-xs">{fileName(vi, si, clip?.name ?? "x.mp4")}</span>
                          {clip ? (
                            <Button type="button" size="sm" variant="outline" onClick={() => downloadOne(vi, si)}><Download className="size-3.5" /> Baixar</Button>
                          ) : (
                            <span className="text-xs text-[#F5B454]">falta enviar na etapa 5</span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
              <p className="text-xs text-muted-foreground">Os vídeos enviados ficam só nesta página: se você atualizar, envie de novo.</p>
            </>
          )}

          {p.step === 7 && (
            <>
              {heading("7 · MONTAGEM FINAL DOS VÍDEOS")}
              <p className="text-sm text-muted-foreground">
                O ClipGringa junta todas as cenas (Cena 01 + Cena 02 + …) em um vídeo 9:16 pronto, sem precisar do CapCut. Os vídeos precisam ter sido enviados na etapa 5.
              </p>
              <Button type="button" onClick={() => void assembleAll()} disabled={Object.values(built).some((b) => b.state === "running") || p.variations.every((_, vi) => Array.from({ length: p.sceneCount }, (__, si) => clips[`${vi}-${si}`]).some((c) => !c))}>
                Montar todos os vídeos
              </Button>
              {p.variations.map((v, vi) => {
                const complete = Array.from({ length: p.sceneCount }, (_, si) => clips[`${vi}-${si}`]).every(Boolean);
                const b = built[vi];
                const jobId = b?.jobId ?? p.final[vi];
                const isDone = Boolean(jobId) && b?.state !== "running" && b?.state !== "error";
                return (
                  <div key={vi} className="space-y-2 rounded-[14px] border border-border p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium">Vídeo {pad(vi + 1)} · {v.title}</p>
                      {b?.state === "running" ? (
                        <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="size-3.5 animate-spin" /> Montando…</span>
                      ) : (
                        <Button type="button" size="sm" variant="outline" onClick={() => void assemble(vi)} disabled={!complete}>
                          {isDone ? "Montar de novo" : "Montar este vídeo"}
                        </Button>
                      )}
                    </div>
                    {!complete && <p className="text-xs text-[#F5B454]">Faltam cenas: envie todas as cenas na etapa 5.</p>}
                    {b?.state === "error" && <p role="alert" className="text-xs text-[#F0466B]">{b.note}</p>}
                    {isDone && jobId && (
                      <div className="space-y-2">
                        <video controls src={`/api/multiplier/jobs/${jobId}/outputs/1`} className="max-h-80 rounded-[12px] border border-border" />
                        <a href={`/api/multiplier/jobs/${jobId}/outputs/1?download=true`} className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-1.5 text-sm hover:text-foreground">
                          <Download className="size-3.5" /> Baixar vídeo {pad(vi + 1)}
                        </a>
                      </div>
                    )}
                  </div>
                );
              })}
              <details className="rounded-[14px] border border-border p-4 text-sm">
                <summary className="cursor-pointer text-muted-foreground">Prefere ajustar à mão no CapCut?</summary>
                <div className="mt-3 space-y-3">
                  <a href="https://www.capcut.com/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-1.5 text-sm hover:text-foreground">
                    Abrir o CapCut <ExternalLink className="size-3.5" />
                  </a>
                  {p.variations.map((v, vi) => (
                    <div key={vi} className="space-y-1">
                      <p className="font-medium">Vídeo {pad(vi + 1)} · {v.title}</p>
                      {CAPCUT_STEPS.map((label, ci) => (
                        <label key={ci} className="flex items-center gap-2">
                          <input type="checkbox" checked={Boolean(p.checks[`cap-${vi}-${ci}`])} onChange={(event) => toggle("checks", `cap-${vi}-${ci}`, event.target.checked)} className="size-4" />
                          {label}
                        </label>
                      ))}
                    </div>
                  ))}
                </div>
              </details>
            </>
          )}

          {p.step < STEPS.length && !canNext && !working && (
            <p role="note" className="rounded-[14px] border border-[#F5B454]/40 bg-[#F5B454]/10 p-3 text-sm text-[#F5B454]">
              Para liberar o Próximo: {NEXT_HINTS[p.step - 1]}
            </p>
          )}
          <div className="flex items-center justify-between border-t border-border pt-4">
            <Button type="button" variant="ghost" onClick={() => patch({ step: Math.max(1, p.step - 1) })} disabled={p.step === 1 || working}>Voltar</Button>
            {p.step < STEPS.length && <Button type="button" onClick={() => patch({ step: p.step + 1 })} disabled={!canNext || working}>Próximo</Button>}
          </div>
        </section>

        <aside aria-label="Painel de execução" className="h-fit space-y-3 rounded-[18px] border border-border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-semibold tracking-wide text-muted-foreground">PAINEL DE EXECUÇÃO</h3>
            <button type="button" onClick={reset} disabled={working} className="text-[11px] text-muted-foreground underline disabled:opacity-50">Novo projeto</button>
            <button type="button" onClick={() => chooseView("simple")} className="text-[11px] text-[#A98BFF] underline">Voltar ao modo simples</button>
          </div>
          {tasks.length === 0 ? (
            <p className="text-xs italic text-muted-foreground">Nenhuma tarefa em execução.</p>
          ) : (
            <ul className="space-y-2">
              {tasks.map((task) => (
                <li key={task.id} className="space-y-0.5 text-xs">
                  <div className="flex items-center gap-2">
                    {task.state === "running" && <Loader2 className="size-3.5 animate-spin text-primary" />}
                    {task.state === "done" && <Check className="size-3.5 text-[#5BD69A]" />}
                    {task.state === "error" && <X className="size-3.5 text-[#F0466B]" />}
                    <span className="flex-1">{task.label}</span>
                    <span className="tabular-nums text-muted-foreground">{Math.max(0, Math.round((task.ms ?? now - task.start) / 1000))}s</span>
                  </div>
                  {task.note && <p className="pl-5 text-[#F0466B]">{task.note}</p>}
                </li>
              ))}
            </ul>
          )}
          {total > 0 && (
            <div className="space-y-2 border-t border-border pt-3 text-xs" aria-label="Gerações">
              <h3 className="font-semibold tracking-wide text-muted-foreground">GERAÇÕES</h3>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-border p-2"><p className="text-muted-foreground">Imagens</p><p className="text-base font-semibold tabular-nums">{Object.keys(imgs).length} de {total}</p></div>
                <div className="rounded-lg border border-border p-2"><p className="text-muted-foreground">Vídeos</p><p className="text-base font-semibold tabular-nums">{Object.keys(clips).length} de {total}</p></div>
              </div>
              <p className="text-muted-foreground">Tempo de cada uma: imagem cerca de 15 segundos; cena animada de 1 a 6 minutos.</p>
              <ul className="space-y-1">
                {Object.entries(genLog).sort((x, y) => y[1].start - x[1].start).slice(0, 8).map(([id, item]) => {
                  const secs = Math.max(0, Math.round((item.ms ?? now - item.start) / 1000));
                  const time = secs >= 60 ? `${Math.floor(secs / 60)} min ${secs % 60}s` : `${secs}s`;
                  return (
                    <li key={id} className="flex items-center gap-2">
                      {item.state === "running" && <Loader2 className="size-3.5 animate-spin text-primary" />}
                      {item.state === "done" && <Check className="size-3.5 text-[#5BD69A]" />}
                      {item.state === "error" && <X className="size-3.5 text-[#F0466B]" />}
                      <span className="flex-1">{item.kind === "image" ? "Imagem" : "Cena animada"} · {item.label}</span>
                      <span className="tabular-nums text-muted-foreground">{item.state === "running" ? `gerando ${time}` : item.state === "error" ? "falhou" : `pronta em ${time}`}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          <p className="border-t border-border pt-3 text-[11px] text-muted-foreground">Seu projeto é salvo neste navegador. Imagens e vídeos enviados não ficam salvos se você atualizar a página.</p>
        </aside>
      </div>
    </div>
  );
}
