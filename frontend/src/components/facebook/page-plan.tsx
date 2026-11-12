"use client";

import { Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { fb, organicVideoUrl, type FbIdea, type FbPage } from "@/lib/facebook";
import { cn } from "@/lib/utils";
import { Modal, primary, secondary } from "./ui";

// ---------- sugestão de passo a passo: muda de página para página ----------
// A sugestão sai do id da página + plan_seed (o botão "Outra sugestão" troca o seed),
// para as páginas não seguirem todas a mesma ordem, o mesmo ritmo e o mesmo visual.

export type Palette = { name: string; bg: string; accent: string; text: string; muted: string };
export const PALETTES: Palette[] = [
  { name: "Noite e âmbar", bg: "#10192E", accent: "#F2B33D", text: "#F5EFE3", muted: "#A8B2C7" },
  { name: "Verde-água", bg: "#0B2422", accent: "#62D8A4", text: "#F4F0E6", muted: "#A0BEB6" },
  { name: "Ameixa e rosa", bg: "#2A1230", accent: "#F28DB2", text: "#FBEFF4", muted: "#C9A6BA" },
  { name: "Grafite e laranja", bg: "#1C1C1E", accent: "#FF8A3D", text: "#F7F3EE", muted: "#ABA59D" },
  { name: "Floresta e limão", bg: "#13261A", accent: "#C6E35B", text: "#F2F5EA", muted: "#A7B79B" },
  { name: "Índigo e ciano", bg: "#171A3D", accent: "#52D3F2", text: "#EEF3FB", muted: "#A2AACB" },
];

const FIRST_CONTENT = [
  { key: "imagens", title: "Comece com posts de imagem", text: "Faça 3 posts de imagem com curiosidades antes do primeiro vídeo, para a página não começar vazia." },
  { key: "video", title: "Abra com um vídeo", text: "O primeiro post é um vídeo curto apresentando o assunto da página; depois alterne com imagens." },
  { key: "perguntas", title: "Comece puxando conversa", text: "Abra com 2 posts só de texto fazendo uma pergunta ao público, para gerar comentários." },
];
const MIX = [
  { images: 70, videos: 30 },
  { images: 50, videos: 50 },
  { images: 30, videos: 70 },
];
const RHYTHM = [
  { text: "Semana 1 com 1 post por dia, semana 2 com 2 e depois 3 por dia.", perDay: 3 },
  { text: "2 posts por dia desde o início, almoço e noite.", perDay: 2 },
  { text: "3 posts por dia: manhã, tarde e noite.", perDay: 3 },
  { text: "1 post por dia na primeira semana e depois 2 por dia.", perDay: 2 },
];

export type PagePlan = {
  palette: Palette;
  coverFirst: boolean;
  videosFirst: boolean;
  first: (typeof FIRST_CONTENT)[number];
  mix: (typeof MIX)[number];
  rhythm: (typeof RHYTHM)[number];
};

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function planFor(page: Pick<FbPage, "id" | "plan_seed">): PagePlan {
  let s = hash(`${page.id}|${page.plan_seed || 0}`) || 1;
  const pick = <T,>(list: T[]): T => { s = Math.imul(s ^ (s >>> 15), 2246822507) >>> 0; return list[s % list.length]; };
  return {
    palette: pick(PALETTES),
    coverFirst: pick([true, false]),
    videosFirst: pick([true, false]),
    first: pick(FIRST_CONTENT),
    mix: pick(MIX),
    rhythm: pick(RHYTHM),
  };
}

type Step = { key: string; title: string; text: string; done: boolean; action?: React.ReactNode };

export function PagePlanSteps({ page: p, onChange, onVideos, onMeta }: { page: FbPage; onChange: () => Promise<void>; onVideos: () => void; onMeta: () => void }) {
  const plan = planFor(p);
  const [visual, setVisual] = useState(false);
  const [ideasOpen, setIdeasOpen] = useState(false);
  const usedIdeas = p.ideas.filter((i) => i.used).length;
  const visualDone = p.has_photo && p.has_cover;

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    try { await fn(); if (ok) toast.success(ok); await onChange(); } catch (problem) { toast.error((problem as Error).message); }
  };

  const visualStep: Step = {
    key: "visual", done: visualDone,
    title: plan.coverFirst ? "Capa e foto do perfil" : "Foto do perfil e capa",
    text: `Visual sugerido: ${plan.palette.name.toLowerCase()}. ${plan.coverFirst ? "Coloque a capa primeiro e depois a foto." : "Coloque a foto primeiro e depois a capa."}`,
    action: <button type="button" className={secondary} onClick={() => setVisual(true)}>{visualDone ? "Ver de novo" : "Gerar foto e capa"}</button>,
  };
  const contentStep: Step = {
    key: "conteudo", done: usedIdeas > 0 || p.published + p.upcoming > 0,
    title: plan.first.title,
    text: `${plan.first.text} Mistura sugerida: ${plan.mix.images}% imagem e ${plan.mix.videos}% vídeo.`,
    action: <button type="button" className={secondary} onClick={() => setIdeasOpen(true)}>{p.ideas.length ? `Ideias de temas (${p.ideas.length - usedIdeas})` : "Gerar ideias de temas"}</button>,
  };
  const videoStep: Step = {
    key: "videos", done: p.published + p.upcoming > 0,
    title: "Vídeos pelo Vídeo orgânico",
    text: "Escolha um tema e crie o vídeo. Quando ficar pronto, adicione na agenda da página.",
    action: (
      <div className="flex flex-wrap gap-2">
        <button type="button" className={secondary} onClick={() => setIdeasOpen(true)}>Criar vídeo de um tema</button>
        <button type="button" className={secondary} onClick={onVideos}>Adicionar vídeos prontos</button>
      </div>
    ),
  };
  const rhythmStep: Step = {
    key: "ritmo", done: p.posts_per_day === plan.rhythm.perDay,
    title: "Ritmo de postagem",
    text: plan.rhythm.text,
    action: p.posts_per_day === plan.rhythm.perDay ? undefined
      : <button type="button" className={secondary} onClick={() => void run(() => fb.updatePage(p.id, { posts_per_day: plan.rhythm.perDay }), "Ritmo aplicado")}>Usar {plan.rhythm.perDay} por dia</button>,
  };
  const metaStep: Step = {
    key: "meta", done: p.meta_connected,
    title: "Postar sozinho",
    text: "Entre com o Facebook para o ClipGringa agendar os vídeos no horário. Sem conectar, use Postar à mão na Agenda.",
    action: p.meta_connected ? undefined : <button type="button" className={secondary} onClick={onMeta}>Conectar o Facebook</button>,
  };
  const steps: Step[] = [
    { key: "pagina", title: "Página criada", text: p.link ? "Página cadastrada com o link." : "Cole o link da página para abrir direto daqui.", done: true },
    visualStep,
    ...(plan.videosFirst ? [videoStep, contentStep] : [contentStep, videoStep]),
    rhythmStep,
    metaStep,
  ];
  const current = steps.findIndex((st) => !st.done);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-white/80">Passo a passo sugerido para esta página</p>
        <button type="button" className="text-xs text-white/50 hover:text-white" onClick={() => void run(() => fb.updatePage(p.id, { plan_seed: (p.plan_seed || 0) + 1 }), "Nova sugestão")}>Outra sugestão</button>
      </div>
      <ol className="space-y-1.5">
        {steps.map((st, i) => (
          <li key={st.key} className={cn("flex gap-3 rounded-[12px] px-3 py-2.5", i === current ? "bg-white/[0.06]" : "")}>
            <span aria-hidden className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-[11px]", st.done ? "bg-emerald-400/20 text-emerald-300" : i === current ? "bg-white/15 text-white" : "bg-white/5 text-white/40")}>
              {st.done ? <Check className="size-3" /> : i + 1}
            </span>
            <div className="min-w-0 flex-1 space-y-1.5">
              <p className={cn("text-sm", st.done ? "text-white/50" : "text-white")}>{st.title}</p>
              {i === current || (!st.done && i < current + 2) ? <p className="text-xs text-white/60">{st.text}</p> : null}
              {!st.done && st.action && i <= current + 1 ? st.action : null}
            </div>
          </li>
        ))}
      </ol>
      {visual ? <VisualDialog page={p} palette={plan.palette} onClose={() => setVisual(false)} onDone={onChange} /> : null}
      {ideasOpen ? <IdeasDialog page={p} onClose={() => setIdeasOpen(false)} onChange={onChange} /> : null}
    </div>
  );
}

// ---------- gerador de foto e capa (no navegador) ----------
const initials = (name: string) => name.split(/\s+/).filter((w) => w && !/^(the|a|o|de|da|do)$/i.test(w)).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";

function drawDots(x: CanvasRenderingContext2D, w: number, h: number, color: string, seed: number, avoid?: [number, number, number, number]) {
  let s = seed || 1;
  const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < Math.round((w * h) / 9000); i++) {
    const a = r() * w, b = r() * h;
    if (avoid && a > avoid[0] && a < avoid[2] && b > avoid[1] && b < avoid[3]) continue;
    x.globalAlpha = 0.15 + r() * 0.35; x.fillStyle = color; x.beginPath(); x.arc(a, b, 1.5 + r() * 2.5, 0, 7); x.fill();
  }
  x.globalAlpha = 1;
}

function drawMark(x: CanvasRenderingContext2D, cx: number, cy: number, r: number, page: FbPage, pal: Palette) {
  x.strokeStyle = pal.accent; x.lineWidth = r * 0.075; x.beginPath(); x.arc(cx, cy, r, 0, 7); x.stroke();
  x.fillStyle = pal.text; x.textAlign = "center"; x.textBaseline = "middle";
  x.font = `800 ${r * 0.85}px "Segoe UI", system-ui, sans-serif`; x.fillText(initials(page.name), cx, cy + r * 0.04);
  x.textAlign = "left"; x.textBaseline = "alphabetic";
}

export function renderProfile(canvas: HTMLCanvasElement, page: FbPage, pal: Palette) {
  canvas.width = 720; canvas.height = 720;
  const x = canvas.getContext("2d"); if (!x) return;
  x.fillStyle = pal.bg; x.fillRect(0, 0, 720, 720);
  drawDots(x, 720, 720, pal.accent, page.id.length * 31 + 7, [140, 140, 580, 580]);
  drawMark(x, 360, 360, 210, page, pal);
}

export function renderCover(canvas: HTMLCanvasElement, page: FbPage, pal: Palette, tagline: string) {
  canvas.width = 1640; canvas.height = 624;
  const x = canvas.getContext("2d"); if (!x) return;
  x.fillStyle = pal.bg; x.fillRect(0, 0, 1640, 624);
  drawDots(x, 1640, 624, pal.accent, page.id.length * 17 + 3, [360, 150, 1460, 480]);
  drawMark(x, 500, 312, 96, page, pal);
  x.fillStyle = pal.text; x.font = `800 84px "Segoe UI", system-ui, sans-serif`; x.fillText(page.name, 640, 300);
  x.fillStyle = pal.accent; x.font = `600 36px "Segoe UI", system-ui, sans-serif`; x.fillText(tagline, 644, 360);
  if (page.niche) { x.fillStyle = pal.muted; x.font = `400 28px "Segoe UI", system-ui, sans-serif`; x.fillText(page.niche, 644, 410); }
}

const TAGLINES: Record<string, string[]> = {
  en: ["One fascinating fact a day.", "Learn something new every day.", "Simple answers to big questions.", "The world, explained simply."],
  "pt-BR": ["Uma curiosidade por dia.", "Aprenda algo novo todo dia.", "Respostas simples para grandes perguntas.", "O mundo, explicado de um jeito simples."],
  es: ["Un dato fascinante al día.", "Aprende algo nuevo cada día.", "Respuestas simples a grandes preguntas.", "El mundo, explicado fácil."],
};

function VisualDialog({ page, palette, onClose, onDone }: { page: FbPage; palette: Palette; onClose: () => void; onDone: () => Promise<void> }) {
  const [pal, setPal] = useState(palette);
  const lines = TAGLINES[page.language] ?? TAGLINES.en;
  const [tagline, setTagline] = useState(lines[page.id.length % lines.length]);
  const profileRef = useRef<HTMLCanvasElement>(null);
  const coverRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (profileRef.current) renderProfile(profileRef.current, page, pal);
    if (coverRef.current) renderCover(coverRef.current, page, pal, tagline);
  }, [page, pal, tagline]);
  const download = (canvas: HTMLCanvasElement | null, name: string) => {
    if (!canvas) return;
    const a = document.createElement("a"); a.href = canvas.toDataURL("image/png"); a.download = name; a.click();
  };
  const slug = page.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const done = async () => {
    try { await fb.updatePage(page.id, { has_photo: true, has_cover: true }); toast.success("Foto e capa marcadas como colocadas"); onClose(); await onDone(); }
    catch (problem) { toast.error((problem as Error).message); }
  };
  return (
    <Modal open onClose={onClose} title={`Foto e capa, ${page.name}`} description="Baixe as duas imagens e coloque na página do Facebook. Cada página recebe um visual diferente.">
      <div className="flex flex-wrap gap-1.5">
        {PALETTES.map((pl) => (
          <button key={pl.name} type="button" onClick={() => setPal(pl)} aria-pressed={pl.name === pal.name} title={pl.name}
            className={cn("size-7 rounded-full border-2", pl.name === pal.name ? "border-white" : "border-transparent")} style={{ background: `linear-gradient(135deg, ${pl.bg} 55%, ${pl.accent} 55%)` }} />
        ))}
      </div>
      <label className="block space-y-1.5"><span className="text-xs font-medium text-white/80">Frase da capa</span>
        <select className="block w-full rounded-[12px] border border-white/15 bg-black/30 px-3 py-2.5 text-sm text-white" value={tagline} onChange={(e) => setTagline(e.target.value)}>
          {lines.map((l) => <option key={l}>{l}</option>)}
        </select></label>
      <canvas ref={coverRef} className="w-full rounded-[10px]" aria-label="Capa" />
      <div className="flex items-center gap-3">
        <canvas ref={profileRef} className="size-24 rounded-full" aria-label="Foto do perfil" />
        <div className="flex flex-wrap gap-2">
          <button type="button" className={secondary} onClick={() => download(profileRef.current, `${slug}-perfil.png`)}>Baixar foto</button>
          <button type="button" className={secondary} onClick={() => download(coverRef.current, `${slug}-capa.png`)}>Baixar capa</button>
        </div>
      </div>
      <div className="flex justify-end"><button type="button" className={primary} onClick={() => void done()}>Já coloquei na página</button></div>
    </Modal>
  );
}

// ---------- ideias de temas ----------
function IdeasDialog({ page, onClose, onChange }: { page: FbPage; onClose: () => void; onChange: () => Promise<void> }) {
  const [ideas, setIdeas] = useState<FbIdea[]>(page.ideas);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const generate = async () => {
    setBusy(true);
    try { setIdeas(await fb.ideas(page.id)); await onChange(); } catch (problem) { toast.error((problem as Error).message); } finally { setBusy(false); }
  };
  const mark = async (idea: FbIdea, body: { used?: boolean; remove?: boolean }) => {
    try { setIdeas(await fb.markIdea(page.id, idea.id, body)); } catch (problem) { toast.error((problem as Error).message); }
  };
  const createVideo = async (idea: FbIdea) => {
    await mark(idea, { used: true });
    window.location.href = organicVideoUrl(page, idea);
  };
  const fresh = ideas.filter((i) => !i.used);
  return (
    <Modal open onClose={() => { onClose(); void onChange(); }} title={`Ideias de temas, ${page.name}`} description={`Temas para ${page.niche || "a página"}, no idioma da página. Criar vídeo abre o Vídeo orgânico já com o texto do tema.`}>
      <button type="button" className={primary} disabled={busy} onClick={() => void generate()}>{busy ? "Pensando em temas…" : ideas.length ? "Gerar mais ideias" : "Gerar ideias"}</button>
      {fresh.length === 0 && !busy ? <p className="text-sm text-white/60">{ideas.length ? "Você já usou todas as ideias. Gere mais." : "Ainda não tem ideias para esta página."}</p> : null}
      <ul className="max-h-[50dvh] space-y-1.5 overflow-y-auto pr-1">
        {fresh.map((idea) => (
          <li key={idea.id} className="rounded-[12px] border border-white/10 px-3 py-2.5">
            <button type="button" className="w-full text-left text-sm text-white" onClick={() => setOpen(open === idea.id ? null : idea.id)}>{idea.title}</button>
            {open === idea.id ? <p className="mt-1.5 whitespace-pre-wrap text-xs text-white/60">{idea.script}</p> : null}
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" className={secondary} onClick={() => void createVideo(idea)}>Criar vídeo</button>
              <button type="button" className={secondary} onClick={() => { void navigator.clipboard.writeText(idea.caption).then(() => toast.success("Legenda copiada")); }}>Copiar legenda</button>
              <button type="button" className="text-xs text-white/40 hover:text-white" onClick={() => void mark(idea, { remove: true })}>Descartar</button>
            </div>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
