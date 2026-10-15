"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, Layers, Loader2, Play, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

type Output = { index: number; label: string; status: "pending" | "ready" | "error" };
type Job = {
  id: string; status: "processing" | "completed" | "error"; aspect: string;
  total: number; done: number; error: string | null; created_at: string; outputs?: Output[];
};

const LIMITS = { hooks: 10, bodies: 10, ctas: 3 } as const;
const MAX_COMBOS = 60;
const ASPECTS = ["9:16", "16:9", "1:1"] as const;

async function readError(response: Response, fallback: string) {
  try {
    const data = await response.json();
    if (typeof data?.detail === "string") return data.detail;
  } catch { /* ignore */ }
  return fallback;
}

function Group({ title, hint, files, max, onChange }: {
  title: string; hint: string; files: File[]; max: number; onChange: (files: File[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="rounded-[18px] border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="font-medium">{title} <span className="text-xs text-muted-foreground">({files.length}/{max})</span></p>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
        <Button type="button" size="sm" variant="outline" disabled={files.length >= max} onClick={() => input.current?.click()}>
          <Upload className="size-4" /> Adicionar
        </Button>
      </div>
      <input
        ref={input} type="file" accept="video/*" multiple hidden
        onChange={(event) => {
          const picked = Array.from(event.target.files || []);
          onChange([...files, ...picked].slice(0, max));
          event.target.value = "";
        }}
      />
      {files.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {files.map((file, index) => (
            <li key={`${file.name}-${index}`} className="flex items-center justify-between gap-2 rounded-lg bg-muted/50 px-3 py-1.5 text-sm">
              <span className="truncate">{index + 1}. {file.name}</span>
              <button type="button" aria-label="Remover" className="text-muted-foreground hover:text-destructive"
                onClick={() => onChange(files.filter((_, i) => i !== index))}>
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function MultiplierPage() {
  const [hooks, setHooks] = useState<File[]>([]);
  const [bodies, setBodies] = useState<File[]>([]);
  const [ctas, setCtas] = useState<File[]>([]);
  const [aspect, setAspect] = useState<(typeof ASPECTS)[number]>("9:16");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [openJob, setOpenJob] = useState<Job | null>(null);

  const combos = hooks.length * bodies.length * ctas.length;
  const tooMany = combos > MAX_COMBOS;
  const ready = hooks.length > 0 && bodies.length > 0 && ctas.length > 0 && !tooMany;

  const loadJobs = useCallback(async () => {
    const response = await fetch("/api/multiplier/jobs", { cache: "no-store" });
    if (response.ok) setJobs(((await response.json()).jobs || []) as Job[]);
  }, []);

  const loadOpen = useCallback(async (id: string) => {
    const response = await fetch(`/api/multiplier/jobs/${id}`, { cache: "no-store" });
    if (response.ok) setOpenJob((await response.json()) as Job);
  }, []);

  useEffect(() => { void loadJobs(); }, [loadJobs]);

  const processing = useMemo(
    () => jobs.some((job) => job.status === "processing") || openJob?.status === "processing",
    [jobs, openJob],
  );

  useEffect(() => {
    if (!processing) return;
    const timer = setInterval(() => {
      void loadJobs();
      if (openId) void loadOpen(openId);
    }, 4000);
    return () => clearInterval(timer);
  }, [processing, openId, loadJobs, loadOpen]);

  async function start() {
    setError(null);
    setSending(true);
    try {
      const form = new FormData();
      hooks.forEach((file) => form.append("hooks", file));
      bodies.forEach((file) => form.append("bodies", file));
      ctas.forEach((file) => form.append("ctas", file));
      form.append("aspect", aspect);
      const response = await fetch("/api/multiplier/jobs", { method: "POST", body: form });
      if (!response.ok) throw new Error(await readError(response, "Não foi possível iniciar. Tente de novo."));
      const data = await response.json();
      setHooks([]); setBodies([]); setCtas([]);
      await loadJobs();
      setOpenId(data.id);
      await loadOpen(data.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível iniciar. Tente de novo.");
    } finally {
      setSending(false);
    }
  }

  async function remove(id: string) {
    const response = await fetch(`/api/multiplier/jobs/${id}`, { method: "DELETE" });
    if (!response.ok) { setError(await readError(response, "Não foi possível excluir.")); return; }
    if (openId === id) { setOpenId(null); setOpenJob(null); }
    await loadJobs();
  }

  return (
    <div data-no-translate className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8">
      <div>
        <div className="flex items-center gap-2">
          <Layers className="size-6" />
          <h1 className="text-2xl font-semibold">Multiplicador de Vídeos</h1>
          <span className="rounded-full bg-gradient-to-br from-[#8b5cf6] to-[#7b3fe4] px-2.5 py-0.5 text-[11px] font-semibold tracking-wide text-white">BETA</span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Envie ganchos, corpos e CTAs. Cada combinação vira um vídeo pronto para testar nos anúncios.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Group title="Ganchos" hint="Início do vídeo" files={hooks} max={LIMITS.hooks} onChange={setHooks} />
        <Group title="Corpos" hint="Meio do vídeo" files={bodies} max={LIMITS.bodies} onChange={setBodies} />
        <Group title="CTAs" hint="Final (chamada para ação)" files={ctas} max={LIMITS.ctas} onChange={setCtas} />
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-[18px] border border-border bg-card p-4">
        <div className="flex gap-1.5">
          {ASPECTS.map((value) => (
            <button key={value} type="button" onClick={() => setAspect(value)}
              className={cn("rounded-full border px-3 py-1 text-sm", aspect === value ? "border-transparent bg-primary text-primary-foreground" : "border-border text-muted-foreground")}>
              {value}
            </button>
          ))}
        </div>
        <p className={cn("text-sm", tooMany ? "text-destructive" : "text-muted-foreground")}>
          {combos > 0 ? `${combos} vídeo${combos === 1 ? "" : "s"}` : "0 vídeos"}
          {tooMany ? ` (máximo ${MAX_COMBOS} por vez)` : ""}
        </p>
        <Button className="ml-auto" disabled={!ready || sending || processing} onClick={start}>
          {sending ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
          {sending ? "Enviando…" : "Gerar combinações"}
        </Button>
      </div>

      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Suas multiplicações</h2>
        {jobs.length === 0 && <p className="text-sm text-muted-foreground">Nada por aqui ainda.</p>}
        {jobs.map((job) => (
          <div key={job.id} className="rounded-[18px] border border-border bg-card p-4">
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" className="text-left" onClick={() => { setOpenId(job.id); void loadOpen(job.id); }}>
                <p className="font-medium">{job.total} vídeos · {job.aspect}</p>
                <p className="text-xs text-muted-foreground">
                  {job.status === "processing" ? `Gerando… ${job.done}/${job.total}` : job.status === "completed" ? "Pronto" : (job.error || "Erro")}
                </p>
              </button>
              <div className="ml-auto flex gap-2">
                {job.status === "completed" && (
                  <Button asChild size="sm" variant="outline">
                    <a href={`/api/multiplier/jobs/${job.id}/zip`}><Download className="size-4" /> ZIP</a>
                  </Button>
                )}
                <Button size="sm" variant="outline" disabled={job.status === "processing"} onClick={() => remove(job.id)} aria-label="Excluir">
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
            {openId === job.id && openJob?.id === job.id && (
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {(openJob.outputs || []).map((output) => (
                  <div key={output.index} className="space-y-1.5">
                    {output.status === "ready" ? (
                      <video src={`/api/multiplier/jobs/${job.id}/outputs/${output.index}`} controls preload="metadata" className="w-full rounded-lg bg-black" />
                    ) : (
                      <div className="flex aspect-[9/16] items-center justify-center rounded-lg bg-muted/50 text-xs text-muted-foreground">
                        {output.status === "error" ? "Falhou" : "Aguardando…"}
                      </div>
                    )}
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{output.label}</span>
                      {output.status === "ready" && (
                        <a className="underline" href={`/api/multiplier/jobs/${job.id}/outputs/${output.index}?download=true`}>Baixar</a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
