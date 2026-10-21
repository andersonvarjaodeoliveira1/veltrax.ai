"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ClipboardCopy, Download, ExternalLink, Loader2, Lock, Plus, RefreshCw, Trash2, Unlock, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

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
  product: string;
  keyword: string;
  keepCase: boolean;
  sceneCount: number;
  cta: string;
  ctaLocked: boolean;
  copyMode: "same" | "mix";
  mix: Mix;
  avatarMode: "own" | "random";
  avatars: Avatar[];
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

const KEY = "gv-clonagem-v2";
const MODE_KEY = "gv-clonagem-mode";
const STEPS = ["Referência", "Avatares", "Imagens", "CTA", "Animações", "Download", "Montagem"];
const NO_MIX: Mix = { hooks: [], bodies: [], ctas: [] };
const EMPTY: Project = {
  step: 1,
  reference: "",
  notes: "",
  product: "",
  keyword: "",
  keepCase: false,
  sceneCount: 3,
  cta: "Comente {KEYWORD} para assistir o vídeo completo",
  ctaLocked: false,
  copyMode: "same",
  mix: NO_MIX,
  avatarMode: "random",
  avatars: [],
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
const KEYWORDS = ["QUERO", "EU QUERO", "LINK", "INFO", "GUIA", "AULA"];
const CTA_PRESETS = [
  "Comente {KEYWORD} para assistir o vídeo completo",
  "Comente {KEYWORD} que eu te mando o link",
  "Escreva {KEYWORD} nos comentários e receba o passo a passo",
  "Comente {KEYWORD} agora e veja como funciona",
];
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
  if (/Send the reference/i.test(detail)) return "Envie um vídeo ou descreva a referência (mínimo 20 caracteres).";
  if (/Keyword is required/i.test(detail)) return "Digite a palavra-chave.";
  if (/Too many (AI|caption)/i.test(detail)) return "Muitos pedidos em pouco tempo. Tente de novo daqui a pouco.";
  if (/not configured/i.test(detail)) return "A IA não está disponível agora.";
  if (/took too long/i.test(detail)) return "A IA demorou demais. Tente de novo.";
  if (/Generate the/i.test(detail)) return "Gere a etapa anterior primeiro.";
  if (/too long \(max/i.test(detail)) return "O vídeo é longo demais (máximo 10 minutos).";
  if (/No speech/i.test(detail)) return "Não encontrei fala nesse vídeo. Descreva o vídeo no campo de notas.";
  if (/Could not read/i.test(detail)) return "Não foi possível ler esse vídeo.";
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
    return [pick.hook.text, pick.body.text, cta];
  }
  const lines = proj.scenes.map((scene) => scene.line);
  if (lines.length) lines[lines.length - 1] = `${lines[lines.length - 1]} ${proj.cta.replace("{KEYWORD}", kw)}`.trim();
  return lines;
}

const isMixReady = (m: Mix) => m.hooks.length >= 2 && m.bodies.length >= 2 && m.ctas.length >= 2 && m.ctas.every((item) => item.includes("{KEYWORD}"));

/** Chama uma etapa da IA e devolve os dados. Lança um erro já em português. */
async function callStage(stage: Stage, proj: Project): Promise<{ items?: unknown[]; hooks?: string[]; bodies?: string[]; ctas?: string[] }> {
  const response = await fetch("/api/multiplier/clone/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      stage,
      reference: proj.reference,
      notes: proj.notes,
      product: proj.product,
      keyword: proj.keyword,
      keep_case: proj.keepCase,
      scene_count: proj.sceneCount,
      cta: proj.cta,
      avatar_mode: proj.avatarMode,
      avatars: proj.avatars.filter((a) => a.name.trim()).map(({ name, look }) => ({ name, look })),
      count: proj.count,
      scenes: proj.scenes,
      variations: proj.variations,
      ...(proj.copyMode === "mix" && (stage === "images" || stage === "videos") ? { lines: proj.variations.map((_, i) => linesOf(proj, i)) } : {}),
    }),
  });
  const data = await response.json().catch(() => null);
  const valid = stage === "mix" ? Array.isArray(data?.hooks) && Array.isArray(data?.bodies) && Array.isArray(data?.ctas) : Array.isArray(data?.items);
  if (!response.ok || !valid) throw new Error(ptError(data?.detail));
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
          className={cn("rounded-full border px-3.5 py-1.5 text-sm disabled:opacity-50", value === option.value ? "border-transparent bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:text-foreground")}>
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
    <div className="space-y-1 text-sm">
      <span className="block text-muted-foreground">{label}</span>
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
  const [genLog, setGenLog] = useState<Record<string, { kind: "image" | "video"; label: string; state: "running" | "done" | "error"; start: number; ms?: number }>>({});
  const paid = Boolean(render?.enabled) && mode === "auto";
  const stopRef = useRef(false);
  const projRef = useRef<Project>(EMPTY);
  const [built, setBuilt] = useState<Record<number, Built>>({});
  const [imgs, setImgs] = useState<Record<string, string>>({});
  const [now, setNow] = useState(() => Date.now());
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setP(load());
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    try { window.localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* storage unavailable */ }
  }, [ready, p]);
  useEffect(() => {
    if (!busy && !tasks.some((task) => task.state === "running") && !Object.values(genLog).some((item) => item.state === "running")) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [busy, tasks, genLog]);

  useEffect(() => { projRef.current = p; }, [p]);
  useEffect(() => {
    try { if (window.localStorage.getItem(MODE_KEY) === "auto") setMode("auto"); } catch { /* storage unavailable */ }
  }, []);
  const chooseScenes = (count: number) => {
    if (count === p.sceneCount) return;
    setClips((current) => { Object.values(current).forEach((clip) => URL.revokeObjectURL(clip.url)); return {}; });
    setImgs({});
    setBuilt({});
    setP((cur) => ({ ...cur, sceneCount: count, scenes: [], mix: NO_MIX, variations: [], images: [], videos: [], approved: {}, checks: {}, gen: {}, final: {} }));
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
    setBusy("upload");
    const taskId = startTask("Transcrevendo o vídeo de referência");
    try {
      const form = new FormData();
      form.append("video", file);
      const response = await fetch("/api/multiplier/captions/draft", { method: "POST", body: form });
      const data = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(data?.lines)) throw new Error(ptError(data?.detail, "Não foi possível ler o vídeo. Tente de novo."));
      patch({ reference: (data.lines as { text: string }[]).map((line) => line.text).join(" ").trim(), scenes: [], mix: NO_MIX, variations: [], images: [], videos: [], approved: {} });
      endTask(taskId, "done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível ler o vídeo. Tente de novo.");
      endTask(taskId, "error", "Falhou. Veja o aviso acima.");
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

  /** Junta as 3 cenas de um vídeo no servidor (mesmo motor do Multiplicador). Devolve o id da montagem. */
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
  async function runAll() {
    stopRef.current = false;
    setError(null);
    setCanResume(false);
    let proj = projRef.current;
    if (proj.reference.trim().length < 20 && proj.notes.trim().length < 20) { setError(ptError("Send the reference")); return; }
    if (!proj.keyword.trim()) { setError("Escolha a palavra-chave da CTA antes de começar."); return; }
    const taskId = startTask("Criando seus vídeos automaticamente");
    let doneW = 0;
    const missing = (cur: Project) => {
      const n = cur.variations.length || cur.count;
      const keys = Array.from({ length: n * cur.sceneCount }, (_, i) => `${Math.floor(i / cur.sceneCount)}-${i % cur.sceneCount}`);
      return (cur.scenes.length === cur.sceneCount ? 0 : AUTO_WEIGHT.text) + (cur.copyMode === "mix" && !isMixReady(cur.mix) ? AUTO_WEIGHT.text : 0)
        + (cur.variations.length ? 0 : AUTO_WEIGHT.text) + (cur.images.length === cur.variations.length && cur.images.length ? 0 : AUTO_WEIGHT.text)
        + keys.filter((k) => !cur.gen[k]?.image).length * AUTO_WEIGHT.image + (cur.videos.length === cur.variations.length && cur.videos.length ? 0 : AUTO_WEIGHT.text)
        + keys.filter((k) => !cur.gen[k]?.video).length * AUTO_WEIGHT.video + Array.from({ length: n }, (_, vi) => vi).filter((vi) => !cur.final[vi]).length * AUTO_WEIGHT.final;
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
      if (proj.scenes.length !== proj.sceneCount) await text("scenes", "Entendendo o vídeo de referência", 1);
      if (proj.copyMode === "mix" && !isMixReady(proj.mix)) await text("mix", "Escrevendo ganchos, corpos e CTAs diferentes", 1);
      if (!proj.variations.length) await text("variations", "Planejando as variações", 2);
      if (proj.images.length !== proj.variations.length || !proj.images.length) await text("images", "Escrevendo os prompts das imagens", 3);
      const n = proj.variations.length;
      const all = Array.from({ length: n * proj.sceneCount }, (_, i) => ({ vi: Math.floor(i / proj.sceneCount), si: i % proj.sceneCount }));

      patch({ step: 3 });
      let imageCount = 0;
      await pool(all.filter(({ vi, si }) => !proj.gen[`${vi}-${si}`]?.image), 3, async ({ vi, si }) => {
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

  function reset() {
    Object.values(clips).forEach((clip) => URL.revokeObjectURL(clip.url));
    Object.values(imgs).forEach((url) => URL.revokeObjectURL(url));
    setClips({});
    setGenLog({});
    setGenBusy({});
    setBuilt({});
    setImgs({});
    setTasks([]);
    setError(null);
    setP(EMPTY);
  }

  const total = p.variations.length * p.sceneCount;
  const approvedCount = Object.entries(p.approved).filter(([key, value]) => value && p.images[Number(key.split("-")[0])]).length;
  const allApproved = p.images.length > 0 && total > 0 && approvedCount >= total;
  const mixReady = p.mix.hooks.length >= 2 && p.mix.bodies.length >= 2 && p.mix.ctas.length >= 2 && p.mix.ctas.every((item) => item.includes("{KEYWORD}"));
  const copyReady = p.copyMode === "same" || mixReady;
  const ctaValid = p.copyMode === "mix" ? mixReady : p.cta.includes("{KEYWORD}");
  const canNext = [p.scenes.length === p.sceneCount && copyReady, p.variations.length > 0, allApproved, p.ctaLocked, p.videos.length > 0, true, false][p.step - 1];
  const working = busy !== null || auto !== null;
  const runningTask = tasks.find((task) => task.state === "running");
  const steps = ["Preparando tudo…", "Trabalhando nisso…", "Quase lá…"];
  const secs = runningTask ? Math.max(0, (now - runningTask.start) / 1000) : 0;
  // Uma só barra: sobe rápido no começo e desacelera, nunca chega a 100% antes de terminar.
  const eased = 95 * (1 - Math.exp(-secs / (assembling ? 60 : 18)));
  const remainingImages = Math.max(0, total - Object.keys(imgs).length);
  const remainingVideos = Math.max(0, total - Object.keys(clips).length);
  const etaMin = Math.max(1, Math.ceil((remainingImages * 15 + remainingVideos * 180) / 3 / 60 + (p.variations.length - Object.keys(p.final).length) * 1.5));
  const autoPct = auto ? Math.min(99, (auto.done / Math.max(1, auto.total)) * 100) : 0;
  const pct = auto ? autoPct : batch ? Math.min(98, ((batch.done + eased / 100) / batch.total) * 100) : eased;

  // Pacote único para a ferramenta ClipGringa dentro do Flow (BETA): tudo o que foi coletado, em um clique.
  const flowPackage = () => JSON.stringify({
    app: "clipgringa-flow",
    version: 1,
    keyword: p.keyword.trim(),
    cta: p.cta,
    sceneCount: p.sceneCount,
    model: "Veo 3.1 - Lite [Lower Priority]",
    videos: p.variations.map((variation, vi) => ({
      title: variation.title,
      scenes: Array.from({ length: p.sceneCount }, (_, si) => ({
        imagePrompt: p.images[vi]?.prompts[si] ?? "",
        videoPrompt: p.videos[vi]?.prompts[si] ?? "",
        file: fileName(vi, si, "x.mp4"),
      })),
    })),
  }, null, 2);

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

  return (
    <div className="space-y-5">
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
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {canResume && !auto && paid && (
        <Button type="button" variant="outline" onClick={() => void runAll()}>Continuar de onde parou</Button>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_260px]">
        <section className="space-y-4 rounded-[18px] border border-border bg-card p-5">
          <p className="text-sm font-medium text-primary">Passo {p.step} de {STEPS.length}: <span className="font-normal text-foreground">{HINTS[p.step - 1]}</span></p>
          {(auto || runningTask) && (
            <div role="status" aria-live="polite" className="space-y-1.5 rounded-[14px] border border-primary/40 bg-primary/10 p-3">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="font-medium">{auto ? auto.label : runningTask?.label}{!auto && batch ? ` (${Math.min(batch.done + 1, batch.total)} de ${batch.total})` : ""}</span>
                <span className="tabular-nums text-xs text-muted-foreground">{Math.round(pct)}%</span>
              </div>
              <div role="progressbar" aria-label="Progresso" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} className="h-2 overflow-hidden rounded-full bg-border">
                <div className="h-full rounded-full bg-gradient-to-r from-[#8B5CF6] to-[#7B3FE4] transition-[width] duration-700" style={{ width: `${pct}%` }} />
              </div>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  {auto ? `Estamos fazendo tudo por você. Tempo estimado: cerca de ${etaMin} min. Pode esperar aqui, não precisa fazer nada.` : `${steps[Math.min(steps.length - 1, Math.floor(secs / 12))]} Pode esperar aqui, não precisa fazer nada.`}
                  {assembling ? " Montar o vídeo leva de 1 a 3 minutos." : ""}
                </p>
                {auto && <button type="button" onClick={() => { stopRef.current = true; }} className="shrink-0 text-xs underline text-muted-foreground">Parar</button>}
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
              <Field label="Transcrição do vídeo (ou descreva o que acontece)" hint="Preenchida sozinha ao escolher o vídeo. Você pode editar ou colar o texto direto.">
                <textarea value={p.reference} onChange={(event) => patch({ reference: event.target.value })} rows={5} maxLength={4000} className={inputClass} />
              </Field>
              <Field label="Notas sobre o vídeo (opcional)" hint="Ritmo, estilo, o que funcionou nele. A IA lê a transcrição e as notas, não as imagens do vídeo.">
                <textarea value={p.notes} onChange={(event) => patch({ notes: event.target.value })} rows={2} maxLength={600} className={inputClass} />
              </Field>
              {render?.enabled && (
                <Group label="Como gerar as imagens e as cenas" hint={mode === "free" ? "Você gera no Flow com Veo 3.1 Lite [Lower Priority]. O Flow mostra “A geração vai usar 0 créditos”." : "A ferramenta gera sozinha pela API do Google. Esse modo é cobrado por uso."}>
                  <Chips label="Como gerar" value={mode} onPick={chooseMode} options={[{ value: "free" as const, text: "Flow · Lower Priority (sem custo)" }, { value: "auto" as const, text: "Automático (pago)" }]} />
                </Group>
              )}
              <Group label="Quantas cenas" hint="Cada cena tem cerca de 8 segundos. Com 3 cenas o vídeo fica com cerca de 24 segundos.">
                <Chips label="Quantas cenas" value={p.sceneCount} onPick={chooseScenes} disabled={working} options={[1, 2, 3].map((n) => ({ value: n, text: n === 1 ? "1 cena" : `${n} cenas` }))} />
              </Group>
              {paid && (
                <div className="space-y-3 rounded-[14px] border border-primary/40 bg-primary/10 p-4">
                  <p className="font-medium">Criar tudo automaticamente</p>
                  <p className="text-xs text-muted-foreground">Escolha as opções e clique. A ferramenta escreve, gera as imagens, anima as cenas e monta os vídeos prontos.</p>
                  <Group label="Quantos vídeos">
                    <Chips label="Quantos vídeos" value={p.count} onPick={(count) => patch({ count })} options={[1, 2, 3].map((n) => ({ value: n, text: String(n) }))} />
                  </Group>
                  <Group label="Palavra-chave da CTA">
                    <KeywordPicker keyword={p.keyword} keepCase={p.keepCase} placeholder="Ou escreva outra palavra" onChange={(keyword) => patch({ keyword })} onKeepCase={(keepCase) => patch({ keepCase, keyword: keepCase ? p.keyword : p.keyword.toUpperCase() })} />
                  </Group>
                  <Button type="button" onClick={() => void runAll()} disabled={working || (p.reference.trim().length < 20 && p.notes.trim().length < 20) || !p.keyword.trim()}>
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
              <div className="flex flex-wrap items-end gap-3">
                <Group label="Quantos vídeos">
                  <Chips label="Quantos vídeos" value={p.count} onPick={(count) => patch({ count })} options={[1, 2, 3, 4, 5].map((n) => ({ value: n, text: String(n) }))} />
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
              <details open={!paid} className="rounded-[14px] border border-border p-3 text-sm">
                <summary className="cursor-pointer text-muted-foreground">Prefere gerar no Flow, sem gastar créditos?</summary>
                <div className="mt-3">
              <div className="space-y-2 rounded-[14px] border border-[#5BD69A]/40 bg-[#5BD69A]/10 p-3 text-sm">
                <p className="font-medium">Sem gastar créditos: use o modo de baixa prioridade do Flow</p>
                <p className="text-xs text-muted-foreground">No Flow, escolha a imagem (Nano Banana, x1), cole o prompt e gere. Se aparecer a opção [Lower Priority], escolha ela.</p>
                <a href="https://labs.google/fx/tools/flow" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-1.5 text-sm hover:text-foreground">
                  Abrir o Flow <ExternalLink className="size-3.5" />
                </a>
              </div>
                </div>
              </details>
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
              <details open={!paid} className="rounded-[14px] border border-border p-3 text-sm">
                <summary className="cursor-pointer text-muted-foreground">Prefere gerar no Flow, sem gastar créditos?</summary>
                <div className="mt-3">
              <div className="space-y-2 rounded-[14px] border border-[#5BD69A]/40 bg-[#5BD69A]/10 p-3 text-sm">
                <p className="font-medium">Sem gastar créditos: use o modo de baixa prioridade do Flow</p>
                <p className="text-xs text-muted-foreground">No Flow, escolha o modelo “Veo 3.1 - Lite [Lower Priority]”, 8s e x1. O Flow mostra “A geração vai usar 0 créditos”. Use a imagem aprovada como primeiro quadro, cole o prompt, gere e depois envie o vídeo aqui.</p>
                <a href="https://labs.google/fx/tools/flow" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-1.5 text-sm hover:text-foreground">
                  Abrir o Flow <ExternalLink className="size-3.5" />
                </a>
              </div>
                </div>
              </details>
              <div className="flex flex-wrap gap-2">
                {generateButton("videos", "Gerar prompts de animação", p.videos.length > 0, "Criando os prompts de animação", !p.ctaLocked)}
                {paid && p.videos.length > 0 && (
                  <Button type="button" onClick={() => void genAll("video")} disabled={working || p.variations.every((_, vi) => Array.from({ length: p.sceneCount }, (__, si) => p.gen[`${vi}-${si}`]?.video).every(Boolean))}>
                    Gerar todas as cenas animadas
                  </Button>
                )}
              </div>
              {p.videos.length > 0 && (
                <div className="space-y-2 rounded-[14px] border border-border p-3 text-sm">
                  <p className="font-medium">Ferramenta ClipGringa no Flow <span className="ml-1 rounded-full bg-[#7B3FE4]/20 px-2 py-0.5 text-[10px] font-semibold text-[#A98BFF]">BETA</span></p>
                  <p className="text-xs text-muted-foreground">Copia tudo de uma vez (prompts de imagem e de animação de todos os vídeos). Cole na ferramenta ClipGringa dentro do Flow e gere no Lower Priority.</p>
                  {copyButton("flow-pack", flowPackage(), "Copiar pacote para o Flow")}
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
                O ClipGringa junta Cena 01 + Cena 02 + Cena 03 em um vídeo 9:16 pronto, sem precisar do CapCut. Os vídeos precisam ter sido enviados na etapa 5.
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
                    {!complete && <p className="text-xs text-[#F5B454]">Faltam cenas: envie as 3 na etapa 5.</p>}
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

          <div className="flex items-center justify-between border-t border-border pt-4">
            <Button type="button" variant="ghost" onClick={() => patch({ step: Math.max(1, p.step - 1) })} disabled={p.step === 1 || working}>Voltar</Button>
            {p.step < STEPS.length && <Button type="button" onClick={() => patch({ step: p.step + 1 })} disabled={!canNext || working}>Próximo</Button>}
          </div>
        </section>

        <aside aria-label="Painel de execução" className="h-fit space-y-3 rounded-[18px] border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold tracking-wide text-muted-foreground">PAINEL DE EXECUÇÃO</h3>
            <button type="button" onClick={reset} disabled={working} className="text-[11px] text-muted-foreground underline disabled:opacity-50">Novo projeto</button>
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
