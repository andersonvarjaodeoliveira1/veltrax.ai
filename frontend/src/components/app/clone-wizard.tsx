"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ClipboardCopy, Download, Loader2, Plus, RefreshCw, Trash2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

// BETA — Clonagem de Vídeo. Isolated from the rest of Automação: own storage key, own API calls.

type Stage = "variations" | "scripts" | "images" | "videos";
type Avatar = { id: string; name: string; look: string };
type Variation = { title: string; angle: string; avatar: string; summary: string };
type Lines = { lines: string[] };
type Prompts = { prompts: string[] };
type Project = {
  step: number;
  reference: string;
  notes: string;
  keyword: string;
  cta: string;
  avatars: Avatar[];
  count: number;
  variations: Variation[];
  scripts: Lines[];
  images: Prompts[];
  videos: Prompts[];
};
type Task = { id: string; label: string; state: "running" | "done" | "error"; start: number; ms?: number; note?: string };

const KEY = "gv-clonagem-v1";
const STEPS = ["Referência", "Avatares", "Variações", "Roteiro", "Imagens", "Vídeos"];
const SCENES = 3;
const EMPTY: Project = {
  step: 1,
  reference: "",
  notes: "",
  keyword: "",
  cta: "Comente {KEYWORD} para assistir o vídeo completo",
  avatars: [],
  count: 3,
  variations: [],
  scripts: [],
  images: [],
  videos: [],
};

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

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

const inputClass = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm";

export function CloneWizard() {
  const [ready, setReady] = useState(false);
  const [p, setP] = useState<Project>(EMPTY);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [busy, setBusy] = useState<Stage | "upload" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [clips, setClips] = useState<Record<string, { url: string; name: string }>>({});
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
          keyword: p.keyword,
          cta: p.cta,
          avatars: p.avatars.filter((a) => a.name.trim()).map(({ name, look }) => ({ name, look })),
          count: p.count,
          variations: p.variations,
          scripts: p.scripts,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(data?.items)) throw new Error(ptError(data?.detail));
      setP((current) => {
        if (stage === "variations") return { ...current, variations: data.items, scripts: [], images: [], videos: [] };
        if (stage === "scripts") return { ...current, scripts: data.items, images: [], videos: [] };
        if (stage === "images") return { ...current, images: data.items };
        return { ...current, videos: data.items };
      });
      endTask(taskId, "done");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Não foi possível gerar esta etapa. Tente de novo.";
      setError(message);
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
      const text = (data.lines as { text: string }[]).map((line) => line.text).join(" ").trim();
      patch({ reference: text });
      endTask(taskId, "done");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Não foi possível ler o vídeo. Tente de novo.";
      setError(message);
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

  function attach(key: string, file: File) {
    if (!file.type.startsWith("video/")) { setError("Envie um arquivo de vídeo (mp4, mov ou webm)."); return; }
    setError(null);
    setClips((current) => {
      if (current[key]) URL.revokeObjectURL(current[key].url);
      return { ...current, [key]: { url: URL.createObjectURL(file), name: file.name } };
    });
  }

  function exportAll() {
    const parts = p.variations.map((v, i) => {
      const lines = p.scripts[i]?.lines ?? [];
      const images = p.images[i]?.prompts ?? [];
      const videos = p.videos[i]?.prompts ?? [];
      const scenes = Array.from({ length: SCENES }, (_, s) =>
        [`Cena ${s + 1}`, lines[s] && `Fala: ${lines[s]}`, images[s] && `Imagem: ${images[s]}`, videos[s] && `Vídeo: ${videos[s]}`].filter(Boolean).join("\n"),
      ).join("\n\n");
      return `VARIAÇÃO ${i + 1} — ${v.title}\nÂngulo: ${v.angle}\nAvatar: ${v.avatar}\n\n${scenes}`;
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
    setClips({});
    setTasks([]);
    setError(null);
    setP(EMPTY);
  }

  const referenceOk = (p.reference.trim().length >= 20 || p.notes.trim().length >= 20) && p.keyword.trim().length > 0;
  const canNext = [referenceOk, true, p.variations.length > 0, p.scripts.length > 0, p.images.length > 0, false][p.step - 1];
  const working = busy !== null;
  const ctaPreview = p.cta.replace("{KEYWORD}", p.keyword.trim() || "PALAVRA");

  const copyButton = (id: string, value: string, label = "Copiar") => (
    <Button key={id} type="button" size="sm" variant="outline" onClick={() => copy(id, value)}>
      {copied === id ? <Check className="size-3.5" /> : <ClipboardCopy className="size-3.5" />}
      {copied === id ? "Copiado" : label}
    </Button>
  );

  const generateButton = (stage: Stage, label: string, regenerate: boolean, runLabel: string) => (
    <Button type="button" onClick={() => run(stage, runLabel)} disabled={working}>
      {busy === stage ? <Loader2 className="size-4 animate-spin" /> : regenerate ? <RefreshCw className="size-4" /> : null}
      {busy === stage ? "Gerando…" : regenerate ? "Gerar de novo" : label}
    </Button>
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
              <h2 className="text-sm font-semibold tracking-wide text-muted-foreground">1 · REFERÊNCIA ORIGINAL</h2>
              <input ref={fileRef} type="file" accept="video/*" className="sr-only" aria-label="Escolher vídeo de referência"
                onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void readReference(file); }} />
              <Button type="button" onClick={() => fileRef.current?.click()} disabled={working} className="w-full">
                {busy === "upload" ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                {busy === "upload" ? "Transcrevendo o vídeo…" : "Escolher vídeo"}
              </Button>
              <Field label="Transcrição do vídeo (ou descreva o que acontece)" hint="Preenchida sozinha ao escolher o vídeo. Você pode editar ou colar o texto direto.">
                <textarea value={p.reference} onChange={(event) => patch({ reference: event.target.value })} rows={6} maxLength={4000} className={inputClass} />
              </Field>
              <Field label="Notas sobre o vídeo (opcional)" hint="Ritmo, estilo, o que funcionou nele.">
                <textarea value={p.notes} onChange={(event) => patch({ notes: event.target.value })} rows={2} maxLength={600} className={inputClass} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Palavra-chave">
                  <input value={p.keyword} onChange={(event) => patch({ keyword: event.target.value.toUpperCase() })} maxLength={30} placeholder="LIMON" className={inputClass} />
                </Field>
                <Field label="Frase da CTA" hint={`Fica assim: “${ctaPreview}”`}>
                  <input value={p.cta} onChange={(event) => patch({ cta: event.target.value })} maxLength={200} className={inputClass} />
                </Field>
              </div>
            </>
          )}

          {p.step === 2 && (
            <>
              <h2 className="text-sm font-semibold tracking-wide text-muted-foreground">2 · AVATARES</h2>
              <p className="text-sm text-muted-foreground">
                Descreva quem aparece nos vídeos. A mesma descrição entra em todos os prompts, para o personagem ficar igual nas cenas. Pode pular: sem avatar, usamos uma pessoa comum.
              </p>
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
              <p className="text-xs text-muted-foreground">Dica: no Flow, gere a imagem do avatar uma vez e use como referência em todas as cenas.</p>
            </>
          )}

          {p.step === 3 && (
            <>
              <h2 className="text-sm font-semibold tracking-wide text-muted-foreground">3 · VARIAÇÕES</h2>
              <div className="flex flex-wrap items-end gap-3">
                <Field label="Quantas variações">
                  <select value={p.count} onChange={(event) => patch({ count: Number(event.target.value) })} className={cn(inputClass, "w-28")}>
                    {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </Field>
                {generateButton("variations", "Gerar variações", p.variations.length > 0, "Planejando as variações")}
              </div>
              {p.variations.length > 0 && (
                <ul className="grid gap-3 sm:grid-cols-2">
                  {p.variations.map((v, i) => (
                    <li key={`${v.title}-${i}`} className="space-y-1 rounded-[14px] border border-border p-4">
                      <p className="font-medium">{i + 1}. {v.title}</p>
                      <p className="text-xs text-muted-foreground">Avatar: {v.avatar} · {v.angle}</p>
                      <p className="text-sm">{v.summary}</p>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          {p.step === 4 && (
            <>
              <h2 className="text-sm font-semibold tracking-wide text-muted-foreground">4 · ROTEIRO</h2>
              <div>{generateButton("scripts", "Gerar roteiros", p.scripts.length > 0, "Escrevendo os roteiros")}</div>
              {p.scripts.map((script, vi) => (
                <div key={vi} className="space-y-2 rounded-[14px] border border-border p-4">
                  <p className="font-medium">{vi + 1}. {p.variations[vi]?.title}</p>
                  {script.lines.map((line, si) => (
                    <label key={si} className="block space-y-1 text-xs text-muted-foreground">
                      Cena {si + 1}
                      <textarea value={line} rows={2} maxLength={260} className={cn(inputClass, "text-foreground")}
                        onChange={(event) => setP((current) => ({
                          ...current,
                          scripts: current.scripts.map((s, i) => (i === vi ? { lines: s.lines.map((l, j) => (j === si ? event.target.value : l)) } : s)),
                          images: [],
                          videos: [],
                        }))} />
                    </label>
                  ))}
                </div>
              ))}
            </>
          )}

          {p.step === 5 && (
            <>
              <h2 className="text-sm font-semibold tracking-wide text-muted-foreground">5 · IMAGENS</h2>
              <p className="text-sm text-muted-foreground">Prompts do primeiro quadro de cada cena. Cole no Flow (Nano Banana) para criar as imagens.</p>
              <div>{generateButton("images", "Gerar prompts de imagem", p.images.length > 0, "Criando os prompts de imagem")}</div>
              {p.images.map((set, vi) => (
                <div key={vi} className="space-y-2 rounded-[14px] border border-border p-4">
                  <p className="font-medium">{vi + 1}. {p.variations[vi]?.title}</p>
                  {set.prompts.map((prompt, si) => (
                    <div key={si} className="space-y-1">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Cena {si + 1}</span>
                        {copyButton(`i-${vi}-${si}`, prompt)}
                      </div>
                      <p className="rounded-lg bg-muted/40 p-3 text-sm">{prompt}</p>
                    </div>
                  ))}
                </div>
              ))}
            </>
          )}

          {p.step === 6 && (
            <>
              <h2 className="text-sm font-semibold tracking-wide text-muted-foreground">6 · VÍDEOS</h2>
              <p className="text-sm text-muted-foreground">
                Cole cada prompt no Flow, com o modo de menor prioridade (lower priority). Depois baixe o vídeo e envie aqui na cena certa. Os vídeos ficam só nesta página.
              </p>
              <div className="flex flex-wrap gap-2">
                {generateButton("videos", "Gerar prompts de vídeo", p.videos.length > 0, "Criando os prompts de vídeo")}
                {p.videos.length > 0 && (
                  <Button type="button" variant="outline" onClick={exportAll}><Download className="size-4" /> Baixar projeto (.txt)</Button>
                )}
              </div>
              {p.videos.map((set, vi) => (
                <div key={vi} className="space-y-3 rounded-[14px] border border-border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">{vi + 1}. {p.variations[vi]?.title}</p>
                    {copyButton(`all-${vi}`, set.prompts.join("\n\n"), "Copiar os 3 prompts")}
                  </div>
                  {set.prompts.map((prompt, si) => {
                    const key = `${vi}-${si}`;
                    const clip = clips[key];
                    return (
                      <div key={si} className="space-y-2">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>Cena {si + 1}</span>
                          {copyButton(`v-${key}`, prompt)}
                        </div>
                        <p className="rounded-lg bg-muted/40 p-3 text-sm">{prompt}</p>
                        {clip ? (
                          <div className="flex items-start gap-3">
                            <video src={clip.url} controls playsInline className="h-40 rounded-lg bg-black" />
                            <div className="space-y-2 text-xs text-muted-foreground">
                              <p className="break-all">{clip.name}</p>
                              <a href={clip.url} download={clip.name} className="inline-flex items-center gap-1 text-foreground underline"><Download className="size-3.5" /> Baixar</a>
                              <button type="button" className="flex items-center gap-1" onClick={() => setClips((current) => { const next = { ...current }; URL.revokeObjectURL(next[key].url); delete next[key]; return next; })}>
                                <X className="size-3.5" /> Remover
                              </button>
                            </div>
                          </div>
                        ) : (
                          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground hover:text-foreground">
                            <Upload className="size-3.5" /> Enviar o vídeo desta cena
                            <input type="file" accept="video/*" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) attach(key, file); }} />
                          </label>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </>
          )}

          <div className="flex items-center justify-between border-t border-border pt-4">
            <Button type="button" variant="ghost" onClick={() => patch({ step: Math.max(1, p.step - 1) })} disabled={p.step === 1 || working}>Voltar</Button>
            {p.step < 6 && <Button type="button" onClick={() => patch({ step: p.step + 1 })} disabled={!canNext || working}>Próximo</Button>}
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
                    <span className="tabular-nums text-muted-foreground">
                      {Math.max(0, Math.round(((task.ms ?? now - task.start) / 1000)))}s
                    </span>
                  </div>
                  {task.note && <p className="pl-5 text-[#F0466B]">{task.note}</p>}
                </li>
              ))}
            </ul>
          )}
          <p className="border-t border-border pt-3 text-[11px] text-muted-foreground">Seu projeto é salvo neste navegador. Os vídeos enviados não ficam salvos se você atualizar a página.</p>
        </aside>
      </div>
    </div>
  );
}
