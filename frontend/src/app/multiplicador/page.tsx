"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, Film, Layers, Loader2, Play, Sparkles, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { ProgressPanel } from "@/components/app/progress-panel";

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

/** POST multipart with upload progress (fetch cannot report it). */
function postWithProgress(url: string, form: FormData, onProgress: (percent: number) => void) {
  return new Promise<{ ok: boolean; status: number; data: { id?: string; total?: number; detail?: unknown } | null }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress((event.loaded / event.total) * 100);
    };
    xhr.onerror = () => reject(new Error("Falha de conexão. Tente de novo."));
    xhr.onload = () => {
      let data: { id?: string; total?: number; detail?: unknown } | null = null;
      try { data = JSON.parse(xhr.responseText); } catch { /* not json */ }
      resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, data });
    };
    xhr.send(form);
  });
}

const MAX_CREATIVE_SECONDS = 180;

/** Backend errors are in English; show them in Portuguese. */
function ptError(detail: unknown, fallback: string) {
  if (typeof detail !== "string") return fallback;
  const map: [RegExp, string][] = [
    [/too long \(max 3 minutes\)/i, "Esse criativo tem mais de 3 minutos. Corte o vídeo e envie de novo."],
    [/too large/i, "Um dos arquivos é grande demais (máximo 300 MB)."],
    [/Only video files/i, "Envie só arquivos de vídeo (mp4, mov, webm ou mkv)."],
    [/Could not read this video/i, "Não foi possível ler esse vídeo. Tente outro arquivo."],
    [/already have a job running/i, "Você já tem uma criação em andamento. Espere terminar."],
    [/Job limit reached/i, "Limite de multiplicações atingido. Exclua as mais antigas."],
    [/combinations is too many/i, "Combinações demais. O máximo é 60 vídeos por vez."],
    [/at least 1 hook, 1 body and 1 CTA/i, "Envie pelo menos 1 gancho, 1 corpo e 1 CTA."],
    [/text card/i, "Não foi possível criar o cartão de texto. Tente de novo."],
  ];
  for (const [pattern, message] of map) if (pattern.test(detail)) return message;
  return fallback;
}

function readDuration(file: File) {
  return new Promise<number | null>((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    const done = (value: number | null) => { URL.revokeObjectURL(url); resolve(value); };
    video.preload = "metadata";
    video.onloadedmetadata = () => done(Number.isFinite(video.duration) ? video.duration : null);
    video.onerror = () => done(null);
    video.src = url;
  });
}

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m} min ${s} s` : `${s} s`;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
  const [cardsEnabled, setCardsEnabled] = useState(false);
  const [hookText, setHookText] = useState("");
  const [ctaText, setCtaText] = useState("");
  const [ctaButton, setCtaButton] = useState("");
  const [tab, setTab] = useState<"combine" | "variations">("combine");
  const [sending, setSending] = useState(false);
  const [phase, setPhase] = useState<"idle" | "upload" | "render">("idle");
  const [uploadPct, setUploadPct] = useState(0);
  const [renderInfo, setRenderInfo] = useState<{ done: number; total: number } | null>(null);
  const [creative, setCreative] = useState<File | null>(null);
  const [variationCount, setVariationCount] = useState(6);
  const [mirror, setMirror] = useState(false);
  const creativeInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [openJob, setOpenJob] = useState<Job | null>(null);

  const hookCount = hooks.length + (cardsEnabled && hookText.trim() ? 1 : 0);
  const ctaCount = ctas.length + (cardsEnabled && ctaText.trim() ? 1 : 0);
  const combos = hookCount * bodies.length * ctaCount;
  const tooMany = combos > MAX_COMBOS || hookCount > LIMITS.hooks || ctaCount > LIMITS.ctas;
  const ready = hookCount > 0 && bodies.length > 0 && ctaCount > 0 && !tooMany;

  const loadJobs = useCallback(async () => {
    const response = await fetch("/api/multiplier/jobs", { cache: "no-store" });
    if (response.ok) setJobs(((await response.json()).jobs || []) as Job[]);
  }, []);

  const loadOpen = useCallback(async (id: string) => {
    const response = await fetch(`/api/multiplier/jobs/${id}`, { cache: "no-store" });
    if (response.ok) setOpenJob((await response.json()) as Job);
  }, []);

  useEffect(() => { void loadJobs(); }, [loadJobs]);

  useEffect(() => {
    (async () => {
      try {
        const response = await fetch("/api/multiplier/features", { cache: "no-store" });
        if (response.ok) setCardsEnabled(Boolean((await response.json()).cards));
      } catch { /* cards stay hidden */ }
    })();
  }, []);

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

  /** Sends the form with an upload bar, then follows the job with a render bar until it ends. */
  async function runJob(endpoint: string, form: FormData, onStarted?: () => void) {
    setError(null);
    setSending(true);
    setUploadPct(0);
    setRenderInfo(null);
    setPhase("upload");
    try {
      const response = await postWithProgress(endpoint, form, setUploadPct);
      if (!response.ok) {
        throw new Error(ptError(response.data?.detail, "Não foi possível iniciar. Tente de novo."));
      }
      setUploadPct(100);
      onStarted?.();
      const id = String(response.data?.id);
      setPhase("render");
      setRenderInfo({ done: 0, total: response.data?.total ?? 0 });
      await sleep(600);
      for (;;) {
        const poll = await fetch(`/api/multiplier/jobs/${id}`, { cache: "no-store" });
        if (poll.ok) {
          const job = (await poll.json()) as Job;
          setRenderInfo({ done: job.done, total: job.total });
          if (job.status !== "processing") {
            setRenderInfo({ done: job.total, total: job.total });
            await sleep(700);
            await loadJobs();
            setOpenId(id);
            setOpenJob(job);
            if (job.status === "error") setError(job.error || "Não foi possível criar os vídeos.");
            break;
          }
        }
        await sleep(2000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível iniciar. Tente de novo.");
    } finally {
      setPhase("idle");
      setSending(false);
    }
  }

  async function start() {
    const form = new FormData();
    hooks.forEach((file) => form.append("hooks", file));
    bodies.forEach((file) => form.append("bodies", file));
    ctas.forEach((file) => form.append("ctas", file));
    form.append("aspect", aspect);
    if (cardsEnabled) {
      if (hookText.trim()) form.append("hook_text", hookText.trim());
      if (ctaText.trim()) {
        form.append("cta_text", ctaText.trim());
        if (ctaButton.trim()) form.append("cta_button", ctaButton.trim());
      }
    }
    await runJob("/api/multiplier/jobs", form, () => {
      setHooks([]); setBodies([]); setCtas([]); setHookText(""); setCtaText(""); setCtaButton("");
    });
  }

  async function startVariations() {
    if (!creative) return;
    const form = new FormData();
    form.append("video", creative);
    form.append("aspect", aspect);
    form.append("count", String(variationCount));
    if (mirror) form.append("mirror", "true");
    await runJob("/api/multiplier/variations", form, () => setCreative(null));
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

      <div className="inline-flex rounded-full border border-border bg-card p-1 text-sm" role="tablist">
        {([["combine", "Combinar", Layers], ["variations", "Variações", Sparkles]] as const).map(([key, label, Icon]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} disabled={sending}
            onClick={() => setTab(key)}
            className={cn("flex items-center gap-1.5 rounded-full px-4 py-1.5 font-medium transition-colors",
              tab === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
            <Icon className="size-4" /> {label}
          </button>
        ))}
      </div>

      {phase !== "idle" && (
        <ProgressPanel
          stage={phase}
          percent={phase === "upload" ? uploadPct : renderInfo && renderInfo.total ? (renderInfo.done / renderInfo.total) * 100 : null}
          detail={phase === "render" && renderInfo?.total ? `${renderInfo.done} de ${renderInfo.total} vídeos prontos` : undefined}
        />
      )}

      {phase === "idle" && tab === "variations" && (
      <div className="space-y-4">
        <div className="rounded-[18px] border border-border bg-card p-4">
          <p className="font-medium">Seu criativo</p>
          <p className="text-xs text-muted-foreground">Envie um vídeo (até 3 minutos). O sistema cria sozinho versões com zoom, tom de cor, velocidade e início diferentes para você testar.</p>
          <input ref={creativeInput} type="file" accept="video/*" hidden
            onChange={async (event) => {
              const file = event.target.files?.[0] || null;
              event.target.value = "";
              if (!file) return;
              setError(null);
              const duration = await readDuration(file);
              if (duration !== null && duration > MAX_CREATIVE_SECONDS) {
                setCreative(null);
                setError(`Esse vídeo tem ${formatDuration(duration)}. O limite é de 3 minutos. Corte o vídeo e envie de novo.`);
                return;
              }
              setCreative(file);
            }} />
          <button type="button" disabled={sending} onClick={() => creativeInput.current?.click()}
            className="mt-3 flex w-full flex-col items-center justify-center gap-2 rounded-[18px] border border-dashed border-border px-4 py-8 text-sm text-muted-foreground hover:border-brand hover:text-foreground disabled:opacity-60">
            {creative ? (
              <>
                <Film className="size-6 text-brand" />
                <span className="max-w-full truncate font-medium text-foreground">{creative.name}</span>
                <span className="text-xs">{(creative.size / 1024 / 1024).toFixed(1)} MB · toque para trocar</span>
              </>
            ) : (
              <>
                <Upload className="size-6" />
                <span>Adicionar criativo</span>
              </>
            )}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3 rounded-[18px] border border-border bg-card p-4">
          <div className="flex items-center gap-1.5">
            <span className="mr-1 text-sm text-muted-foreground">Quantidade</span>
            {[3, 6, 9, 12].map((value) => (
              <button key={value} type="button" onClick={() => setVariationCount(value)} disabled={sending}
                className={cn("rounded-full border px-3 py-1 text-sm", variationCount === value ? "border-transparent bg-primary text-primary-foreground" : "border-border text-muted-foreground")}>
                {value}
              </button>
            ))}
          </div>
        <div className="flex gap-1.5">
          {ASPECTS.map((value) => (
            <button key={value} type="button" onClick={() => setAspect(value)} disabled={sending}
              className={cn("rounded-full border px-3 py-1 text-sm", aspect === value ? "border-transparent bg-primary text-primary-foreground" : "border-border text-muted-foreground")}>
              {value}
            </button>
          ))}
        </div>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" checked={mirror} onChange={(e) => setMirror(e.target.checked)} disabled={sending} />
            Espelhar (inverte textos no vídeo)
          </label>
          <Button className="ml-auto" disabled={!creative || sending} onClick={startVariations}>
            {sending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {sending ? "Aguarde…" : "Criar variações"}
          </Button>
        </div>
      </div>

      )}

      {phase === "idle" && tab === "combine" && (
        <>
      <div className="grid gap-4 md:grid-cols-3">
        <Group title="Ganchos" hint="Início do vídeo" files={hooks} max={LIMITS.hooks} onChange={setHooks} />
        <Group title="Corpos" hint="Meio do vídeo" files={bodies} max={LIMITS.bodies} onChange={setBodies} />
        <Group title="CTAs" hint="Final (chamada para ação)" files={ctas} max={LIMITS.ctas} onChange={setCtas} />
      </div>

      {cardsEnabled && (
        <div className="rounded-[18px] border border-border bg-card p-4">
          <p className="font-medium">Cartões de texto <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold">BETA</span></p>
          <p className="text-xs text-muted-foreground">Sem vídeo para o gancho ou o CTA? Escreva o texto e o sistema cria um cartão animado de 3 segundos.</p>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Texto do gancho</span>
              <input value={hookText} maxLength={140} onChange={(e) => setHookText(e.target.value)}
                className="h-10 w-full rounded-lg border border-border bg-background px-3" />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Texto do CTA</span>
              <input value={ctaText} maxLength={140} onChange={(e) => setCtaText(e.target.value)}
                className="h-10 w-full rounded-lg border border-border bg-background px-3" />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Botão do CTA</span>
              <input value={ctaButton} maxLength={40} onChange={(e) => setCtaButton(e.target.value)}
                className="h-10 w-full rounded-lg border border-border bg-background px-3" />
            </label>
          </div>
        </div>
      )}

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


        </>
      )}

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
