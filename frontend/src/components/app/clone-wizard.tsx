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
};
type Task = { id: string; label: string; state: "running" | "done" | "error"; start: number; ms?: number; note?: string };

const KEY = "gv-clonagem-v2";
const STEPS = ["Referência", "Avatares", "Imagens", "CTA", "Animações", "Download", "CapCut"];
const SCENES = 3;
const NO_MIX: Mix = { hooks: [], bodies: [], ctas: [] };
const EMPTY: Project = {
  step: 1,
  reference: "",
  notes: "",
  product: "",
  keyword: "",
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
};
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

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

export function CloneWizard() {
  const [ready, setReady] = useState(false);
  const [p, setP] = useState<Project>(EMPTY);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [busy, setBusy] = useState<Stage | "upload" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [clips, setClips] = useState<Record<string, { url: string; name: string }>>({});
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
    if (!busy) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [busy]);

  const patch = (change: Partial<Project>) => setP((current) => ({ ...current, ...change }));
  const keywordOrDefault = p.keyword.trim() || "PALAVRA";

  /** The three spoken lines of video number `vi`, with the CTA that closes the last scene. */
  const linesFor = useCallback((vi: number): string[] => {
    const kw = p.keyword.trim() || "PALAVRA";
    if (p.copyMode === "mix") {
      const pick = mixPick(p.mix, vi);
      return [pick.hook.text, pick.body.text, pick.cta.text.replace("{KEYWORD}", kw)];
    }
    const lines = p.scenes.map((scene) => scene.line);
    if (lines.length) lines[lines.length - 1] = `${lines[lines.length - 1]} ${p.cta.replace("{KEYWORD}", kw)}`.trim();
    return lines;
  }, [p.copyMode, p.mix, p.scenes, p.keyword, p.cta]);

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
      const response = await fetch("/api/multiplier/clone/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage,
          reference: p.reference,
          notes: p.notes,
          product: p.product,
          keyword: p.keyword,
          cta: p.cta,
          avatar_mode: p.avatarMode,
          avatars: p.avatars.filter((a) => a.name.trim()).map(({ name, look }) => ({ name, look })),
          count: p.count,
          scenes: p.scenes,
          variations: p.variations,
          ...(p.copyMode === "mix" && (stage === "images" || stage === "videos") ? { lines: p.variations.map((_, i) => linesFor(i)) } : {}),
        }),
      });
      const data = await response.json().catch(() => null);
      const valid = stage === "mix" ? Array.isArray(data?.hooks) && Array.isArray(data?.bodies) && Array.isArray(data?.ctas) : Array.isArray(data?.items);
      if (!response.ok || !valid) throw new Error(ptError(data?.detail));
      setP((current) => {
        if (stage === "scenes") return { ...current, scenes: data.items, mix: NO_MIX, variations: [], images: [], videos: [], approved: {} };
        if (stage === "mix") return { ...current, mix: { hooks: data.hooks, bodies: data.bodies, ctas: data.ctas }, videos: [] };
        if (stage === "variations") return { ...current, variations: data.items, images: [], videos: [], approved: {} };
        if (stage === "images") return { ...current, images: data.items, videos: [], approved: {} };
        return { ...current, videos: data.items };
      });
      if (stage === "scenes" || stage === "variations" || stage === "images") setImgs({});
      endTask(taskId, "done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível gerar esta etapa. Tente de novo.");
      endTask(taskId, "error", "Falhou. Veja o aviso acima.");
    } finally {
      setBusy(null);
    }
  }, [p, linesFor]);

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
      setClips((current) => { if (current[key]) URL.revokeObjectURL(current[key].url); return { ...current, [key]: { url, name: file.name } }; });
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
      for (let si = 0; si < SCENES; si += 1) {
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
      const scenes = Array.from({ length: SCENES }, (_, s) =>
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

  function reset() {
    Object.values(clips).forEach((clip) => URL.revokeObjectURL(clip.url));
    Object.values(imgs).forEach((url) => URL.revokeObjectURL(url));
    setClips({});
    setImgs({});
    setTasks([]);
    setError(null);
    setP(EMPTY);
  }

  const total = p.variations.length * SCENES;
  const approvedCount = Object.entries(p.approved).filter(([key, value]) => value && p.images[Number(key.split("-")[0])]).length;
  const allApproved = p.images.length > 0 && total > 0 && approvedCount >= total;
  const mixReady = p.mix.hooks.length >= 2 && p.mix.bodies.length >= 2 && p.mix.ctas.length >= 2 && p.mix.ctas.every((item) => item.includes("{KEYWORD}"));
  const copyReady = p.copyMode === "same" || mixReady;
  const ctaValid = p.copyMode === "mix" ? mixReady : p.cta.includes("{KEYWORD}");
  const canNext = [p.scenes.length === SCENES && copyReady, p.variations.length > 0, allApproved, p.ctaLocked, p.videos.length > 0, true, false][p.step - 1];
  const working = busy !== null;

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

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_260px]">
        <section className="space-y-4 rounded-[18px] border border-border bg-card p-5">
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
                <Field label="Quantos vídeos (galhos)">
                  <select value={p.count} onChange={(event) => patch({ count: Number(event.target.value) })} className={cn(inputClass, "w-28")}>
                    {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </Field>
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
                <Field label="Palavra-chave">
                  <input value={p.keyword} onChange={(event) => patch({ keyword: event.target.value.toUpperCase() })} disabled={p.ctaLocked} maxLength={30} placeholder="LIMON" className={inputClass} />
                </Field>
              </div>
              {p.copyMode === "same" && (
                <Field label="Frase da CTA" hint="Use {KEYWORD} onde a palavra-chave deve aparecer.">
                  <input value={p.cta} onChange={(event) => patch({ cta: event.target.value })} disabled={p.ctaLocked} maxLength={200} className={inputClass} />
                </Field>
              )}
              <div className="space-y-2 rounded-[14px] border border-border p-3 text-sm">
                <p className="text-xs text-muted-foreground">{p.copyMode === "mix" ? "Fala final de cada vídeo" : "Fala final, igual em todos os vídeos"}</p>
                {(p.copyMode === "mix" ? p.variations.map((_, i) => i) : [0]).map((vi) => (
                  <p key={vi}>{p.copyMode === "mix" && <span className="text-xs text-muted-foreground">Vídeo {pad(vi + 1)} · </span>}“{linesFor(vi)[SCENES - 1]}”</p>
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
              <div className="flex flex-wrap gap-2">{generateButton("videos", "Gerar prompts de animação", p.videos.length > 0, "Criando os prompts de animação", !p.ctaLocked)}</div>
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
                        {si === SCENES - 1 && <p className="text-xs text-[#F5B454]">Revise a CTA e a palavra-chave na cena final.</p>}
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
                    {Array.from({ length: SCENES }, (_, si) => {
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
              {heading("7 · LEVE PARA O CAPCUT E JUNTE AS CENAS")}
              <p className="text-sm text-muted-foreground">O agente prepara as peças. Você finaliza a montagem: Cena 01 + Cena 02 + Cena 03 = vídeo montado.</p>
              <a href="https://www.capcut.com/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-1.5 text-sm hover:text-foreground">
                Abrir o CapCut <ExternalLink className="size-3.5" />
              </a>
              {p.variations.map((v, vi) => (
                <div key={vi} className="space-y-2 rounded-[14px] border border-border p-4">
                  <p className="font-medium">Vídeo {pad(vi + 1)} · {v.title}</p>
                  {CAPCUT_STEPS.map((label, ci) => (
                    <label key={ci} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={Boolean(p.checks[`cap-${vi}-${ci}`])} onChange={(event) => toggle("checks", `cap-${vi}-${ci}`, event.target.checked)} className="size-4" />
                      {label}
                    </label>
                  ))}
                </div>
              ))}
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
          <p className="border-t border-border pt-3 text-[11px] text-muted-foreground">Seu projeto é salvo neste navegador. Imagens e vídeos enviados não ficam salvos se você atualizar a página.</p>
        </aside>
      </div>
    </div>
  );
}
