"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { brDateTime, fb, TIER_ONE_COUNTRIES, type FbAccount, type FbClip, type FbPage, type FbPost, type FbVideo } from "@/lib/facebook";
import { ManualPostDialog, RegisterPostsDialog } from "./manual-post";
import { goToFacebookLogin, MetaCard, MetaSetupDialog, useMetaStatus } from "./meta-connect";
import { PagePlanSteps } from "./page-plan";
import { PageReading } from "./page-reading";
import { PhotoSwap } from "./photo-swap";
import { ProfileStandardize } from "./profile-standardize";
import { cn } from "@/lib/utils";
import { ACTOR, card, field, Modal, Pill, primary, secondary } from "./ui";

export function PagesPanel({ pages, accounts, onChange }: { pages: FbPage[]; accounts: FbAccount[]; onChange: () => Promise<void> }) {
  const [creating, setCreating] = useState(false);
  const [clipsFor, setClipsFor] = useState<FbPage | null>(null);
  const [metaFor, setMetaFor] = useState<FbPage | null>(null);
  const [sending, setSending] = useState(false);

  const sendNow = async () => {
    setSending(true);
    try { const r = await fb.publish(); toast.success(r.enviados ? `${r.enviados} ${r.enviados === 1 ? "post foi" : "posts foram"} para o Facebook` : "Nada pendente para enviar agora"); await onChange(); }
    catch (problem) { toast.error((problem as Error).message); } finally { setSending(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button type="button" className={primary} onClick={() => setCreating((v) => !v)}>{creating ? "Fechar" : "Nova página"}</button>
        <PhotoSwap pages={pages} onChange={onChange} />
        <ProfileStandardize pages={pages} onChange={onChange} />
        {pages.some((p) => p.meta_connected) ? <button type="button" className={secondary} disabled={sending} onClick={() => void sendNow()}>{sending ? "Enviando…" : "Enviar agora para o Facebook"}</button> : null}
      </div>
      <MetaCard onChange={onChange} />
      {creating ? <NewPage accounts={accounts} onDone={async () => { setCreating(false); await onChange(); }} /> : null}

      <ReadingSummary pages={pages} />
      {pages.length === 0 && !creating ? <p className="rounded-[16px] border border-dashed border-white/15 p-4 text-sm text-white/70">Nenhuma página ainda. Clique em Nova página e cadastre a primeira.</p> : null}
      {pages.map((p) => <PageCard key={p.id} page={p} onClips={() => setClipsFor(p)} onMeta={() => setMetaFor(p)} onChange={onChange} />)}

      {clipsFor ? <ClipsDialog page={clipsFor} pages={pages} onClose={() => setClipsFor(null)} onDone={onChange} /> : null}
      {metaFor ? <MetaDialog page={metaFor} onClose={() => setMetaFor(null)} onDone={onChange} /> : null}
    </div>
  );
}

function NewPage({ accounts, onDone }: { accounts: FbAccount[]; onDone: () => Promise<void> }) {
  const [form, setForm] = useState({ name: "", account_id: "", niche: "", language: "en", posts_per_day: 3, link: "" });
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    try { await fb.addPage({ ...form, account_id: form.account_id || null }); toast.success("Página cadastrada"); await onDone(); }
    catch (problem) { toast.error((problem as Error).message); }
  };
  return (
    <form onSubmit={submit} className={cn(card, "space-y-3")} aria-label="Nova página">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1.5"><span className="text-xs font-medium text-white/80">Nome da página</span>
          <input className={field} required value={form.name} maxLength={160} onChange={(e) => set({ name: e.target.value })} placeholder="Ex.: Body Explained" /></label>
        <label className="block space-y-1.5"><span className="text-xs font-medium text-white/80">Conta dona da página</span>
          <select className={field} value={form.account_id} onChange={(e) => set({ account_id: e.target.value })}>
            <option value="">Sem conta</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select></label>
        <label className="block space-y-1.5"><span className="text-xs font-medium text-white/80">Nicho</span>
          <input className={field} value={form.niche} maxLength={80} onChange={(e) => set({ niche: e.target.value })} placeholder="Ex.: Saúde" /></label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block space-y-1.5"><span className="text-xs font-medium text-white/80">Idioma</span>
            <select className={field} value={form.language} onChange={(e) => set({ language: e.target.value })}><option value="en">Inglês</option><option value="pt-BR">Português</option><option value="es">Espanhol</option></select></label>
          <label className="block space-y-1.5"><span className="text-xs font-medium text-white/80">Posts por dia</span>
            <select className={field} value={form.posts_per_day} onChange={(e) => set({ posts_per_day: Number(e.target.value) })}>{[1, 2, 3, 4].map((n) => <option key={n}>{n}</option>)}</select></label>
        </div>
      </div>
      <label className="block space-y-1.5"><span className="text-xs font-medium text-white/80">Link da página (opcional)</span>
        <input className={field} value={form.link} maxLength={400} onChange={(e) => set({ link: e.target.value })} placeholder="https://www.facebook.com/…" /></label>
      <button type="submit" className={primary}>Cadastrar página</button>
    </form>
  );
}

function PageCard({ page: p, onClips, onMeta, onChange }: { page: FbPage; onClips: () => void; onMeta: () => void; onChange: () => Promise<void> }) {
  const [note, setNote] = useState("");
  const [todo, setTodo] = useState("");
  const [posts, setPosts] = useState<FbPost[] | null>(null);
  const [manual, setManual] = useState<FbPost | null>(null);
  const [editing, setEditing] = useState(false);
  const [register, setRegister] = useState(false);
  const [reading, setReading] = useState(false);
  const [inbox, setInbox] = useState(false);
  const missing = [!p.has_photo && "foto", !p.has_cover && "capa"].filter(Boolean) as string[];
  const open = p.todos.filter((t) => !t.done_at);

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    try { await fn(); if (ok) toast.success(ok); await onChange(); } catch (problem) { toast.error((problem as Error).message); }
  };
  const loadPosts = async () => { try { setPosts(await fb.posts(p.id)); } catch (problem) { toast.error((problem as Error).message); } };

  return (
    <article className={cn(card, "space-y-3")} aria-label={p.name}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          {p.link ? <a href={p.link} target="_blank" rel="noopener noreferrer" className="truncate text-base font-bold text-white hover:underline">{p.name}</a> : <p className="truncate text-base font-bold text-white">{p.name}</p>}
          <p className="flex flex-wrap items-center gap-x-1 text-xs text-white/60">
            {[p.account_name, p.niche].filter(Boolean).map((part) => <span key={part}>{part},</span>)}
            <select aria-label={`Idioma de ${p.name}`} value={["en", "es"].includes(p.language) ? p.language : "pt-BR"}
              onChange={(e) => void run(() => fb.updatePage(p.id, { language: e.target.value }), "Idioma trocado")}
              className="cursor-pointer rounded-[6px] bg-transparent py-0.5 text-xs text-white/60 hover:text-white [&>option]:text-black">
              <option value="pt-BR">português</option><option value="en">inglês</option><option value="es">espanhol</option>
            </select>
          </p>
        </div>
        {p.status !== "ativa" ? <Pill tone="bad">{p.status === "restricao" ? "Com restrição" : "Bloqueada"}</Pill>
          : missing.length ? <Pill tone="warn">Falta {missing.join(" e ")}</Pill> : <Pill tone="ok">Página pronta</Pill>}
      </div>

      <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-white/60">
        <span><b className="font-medium text-white">{p.published}</b> {p.published === 1 ? "publicado" : "publicados"}</span>
        <span><b className="font-medium text-white">{p.upcoming}</b> {p.upcoming === 1 ? "agendado" : "agendados"}</span>
        {p.next_at ? <span>Próximo {brDateTime(p.next_at)}</span> : null}
        {p.until_at ? <span>Posts até {brDateTime(p.until_at).slice(0, 5)}</span> : <span>Sem posts na agenda</span>}
        {p.failed ? <span className="text-[#F0466B]">{p.failed} {p.failed === 1 ? "falhou" : "falharam"}</span> : null}
        {p.reading?.status === "encher" ? <span className="text-emerald-300">Formato para repetir</span> : null}
        {p.ramp ? <span>{p.ramp === "rapida" ? "Subindo rápido" : "Subindo devagar"}</span> : null}
        {p.post_window === "noite" ? <span>Posts à noite</span> : null}
      </p>

      <PagePlanSteps page={p} onChange={onChange} onVideos={onClips} onMeta={onMeta} />

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={secondary} onClick={onClips}>Adicionar vídeos</button>
        {p.meta_connected ? <button type="button" className={secondary} onClick={onMeta}>Conectada à Meta</button> : null}
        <button type="button" className={secondary} aria-expanded={reading} onClick={() => setReading((x) => !x)}>{reading ? "Fechar a leitura" : "Ler a página"}</button>
        <button type="button" className={secondary} onClick={() => setEditing(true)}>Editar assunto</button>
        {p.meta_connected ? <button type="button" className={secondary} onClick={() => setInbox(true)}>{p.inbox_on ? "Resposta automática ligada" : "Resposta automática"}</button> : null}
        {!p.meta_connected ? <button type="button" className={secondary} onClick={() => setRegister(true)}>Registrar posts feitos no Facebook</button> : null}
        <span className="text-xs text-white/50">{p.meta_error ? p.meta_error : p.meta_connected ? "Posta sozinho no horário" : "Sem conexão: abra a Agenda e use Postar à mão"}</span>
      </div>
      {reading ? <PageReading page={p} onConnect={onMeta} /> : null}
      {manual ? <ManualPostDialog page={p} post={manual} onClose={() => setManual(null)} onDone={async () => { await loadPosts(); await onChange(); }} /> : null}
      {editing ? <EditPageDialog page={p} onClose={() => setEditing(false)} onDone={onChange} /> : null}
      {inbox ? <InboxDialog page={p} onClose={() => setInbox(false)} onDone={onChange} /> : null}
      {register ? <RegisterPostsDialog page={p} onClose={() => setRegister(false)} onDone={onChange} /> : null}

      {open.length ? (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-white/80">Para você fazer</p>
          {open.map((t) => (
            <label key={t.id} className="flex cursor-pointer items-center gap-2.5 text-sm text-white">
              <input type="checkbox" className="size-4 accent-violet-500" onChange={() => void run(() => fb.doneTodo(t.id, true), "Marcado como feito")} />{t.text}
            </label>
          ))}
        </div>
      ) : null}

      <details onToggle={(e) => { if ((e.target as HTMLDetailsElement).open && posts === null) void loadPosts(); }}>
        <summary className="cursor-pointer text-sm text-white/60">Agenda</summary>
        <ul className="mt-2 space-y-1.5">
          {posts === null ? <li className="text-xs text-white/50">Carregando…</li> : posts.length === 0 ? <li className="text-xs text-white/50">Nenhum post. Adicione vídeos.</li> : posts.map((x) => (
            <li key={x.id} className="flex items-center gap-3 text-sm">
              <span className="w-24 shrink-0 text-xs text-white/60">{brDateTime(x.scheduled_at)}</span>
              <span className="min-w-0 flex-1 truncate text-white">{x.title}</span>
              <Pill tone={x.status === "publicado" ? "ok" : x.status === "agendado" ? "off" : x.status === "falhou" ? "bad" : "warn"}>{{ pendente: "Esperando", agendado: "No Facebook", publicado: "Publicado", falhou: "Falhou" }[x.status]}</Pill>
              {x.status === "pendente" && !p.meta_connected ? <button type="button" className="text-xs text-white underline" onClick={() => setManual(x)}>Postar à mão</button> : null}
              {x.status !== "publicado" ? <button type="button" className="text-xs text-white/50 hover:text-white" onClick={() => void run(async () => { await fb.removePost(x.id); await loadPosts(); }, "Tirado da agenda")}>Tirar</button> : null}
            </li>
          ))}
        </ul>
      </details>

      <details>
        <summary className="cursor-pointer text-sm text-white/60">O que foi feito</summary>
        <ul className="mt-2 space-y-1">
          {p.events.map((e) => <li key={e.id} className="flex gap-3 text-sm"><span className="w-24 shrink-0 text-xs text-white/60">{brDateTime(e.created_at)}</span><span className="text-white">{e.text}<span className="text-white/50">, {ACTOR[e.actor]}</span></span></li>)}
        </ul>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (note.trim()) void run(async () => { await fb.note(p.id, note); setNote(""); }, "Anotado"); }}>
            <input className={field} value={note} maxLength={400} onChange={(e) => setNote(e.target.value)} placeholder="Anotar algo que você fez" aria-label="Anotar algo que você fez" />
            <button type="submit" className={secondary}>Anotar</button>
          </form>
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (todo.trim()) void run(async () => { await fb.addTodo(p.id, todo); setTodo(""); }, "Tarefa criada"); }}>
            <input className={field} value={todo} maxLength={400} onChange={(e) => setTodo(e.target.value)} placeholder="Nova tarefa para fazer à mão" aria-label="Nova tarefa para fazer à mão" />
            <button type="submit" className={secondary}>Criar</button>
          </form>
        </div>
      </details>
    </article>
  );
}

export function ClipsDialog({ page, pages = [], onClose, onDone, preselect }: { page: FbPage; pages?: FbPage[]; onClose: () => void; onDone: () => Promise<void> | void; preselect?: string[] }) {
  const [also, setAlso] = useState<string[]>([]);
  const others = pages.filter((x) => x.id !== page.id && x.status === "ativa");
  const [lib, setLib] = useState<{ clips: FbClip[]; videos: FbVideo[] } | null>(null);
  const [tab, setTab] = useState<"organicos" | "cortes">(preselect?.length ? "cortes" : "organicos");
  const [picked, setPicked] = useState<string[]>(preselect ?? []);
  const [videos, setVideos] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => { fb.library().then(setLib).catch((problem) => { toast.error((problem as Error).message); setLib({ clips: [], videos: [] }); }); }, []);
  const total = picked.length + videos.length;
  // mesmo arquivo indo para outra página: selecionado para várias agora, ou já usado em outra antes
  const repeated = total > 0 && (also.length > 0
    || (lib?.clips ?? []).some((c) => picked.includes(c.id) && c.used_in && c.used_in !== page.name)
    || (lib?.videos ?? []).some((v) => videos.includes(`${v.source}:${v.id}`) && v.used_in && v.used_in !== page.name));
  const save = async () => {
    setBusy(true);
    try {
      const chosen = (lib?.videos ?? []).filter((v) => videos.includes(`${v.source}:${v.id}`)).map((v) => ({ id: v.id, source: v.source }));
      const r = await fb.addClips(page.id, picked, chosen);
      // mesma seleção em outras páginas: cada uma recebe os próprios horários
      for (const id of also) await fb.addClips(id, picked, chosen);
      toast.success(`${r.agendados} ${r.agendados === 1 ? "vídeo entrou" : "vídeos entraram"} na agenda de ${also.length ? `${also.length + 1} páginas` : page.name}`); onClose(); await onDone();
    } catch (problem) { toast.error((problem as Error).message); } finally { setBusy(false); }
  };
  const row = (key: string, checked: boolean, toggle: (on: boolean) => void, title: string, meta: string) => (
    <li key={key}>
      <label className="flex cursor-pointer items-center gap-3 rounded-[12px] border border-white/10 px-3 py-2.5">
        <input type="checkbox" className="size-4 accent-violet-500" checked={checked} onChange={(e) => toggle(e.target.checked)} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-white">{title}</span>
          <span className="block truncate text-xs text-white/50">{meta}</span>
        </span>
      </label>
    </li>
  );
  const list = tab === "organicos" ? lib?.videos ?? [] : lib?.clips ?? [];
  return (
    <Modal open onClose={onClose} title={`Vídeos para ${page.name}`} description={`Entram na agenda em ${page.posts_per_day} ${page.posts_per_day === 1 ? "horário" : "horários"} por dia, com minutos variados.`}>
      <div className="flex gap-1.5" role="tablist">
        {([["organicos", "Vídeos orgânicos", lib?.videos.length], ["cortes", "Cortes", lib?.clips.length]] as const).map(([key, label, n]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)}
            className={cn("rounded-[8px] border px-3 py-1.5 text-xs", tab === key ? "border-white/30 bg-white/10 text-white" : "border-white/10 text-white/60 hover:text-white")}>
            {label}{n !== undefined ? <span className="text-white/50"> {n}</span> : null}
          </button>
        ))}
      </div>
      {lib === null ? <p className="text-sm text-white/60">Carregando…</p> : list.length === 0 ? (
        <div className="space-y-2 text-sm text-white/70">
          {tab === "organicos"
            ? <><p>Nenhum vídeo orgânico pronto ainda.</p><Link className={secondary} href="/automacao">Criar no Vídeo orgânico</Link></>
            : <><p>Nenhum corte pronto ainda.</p><Link className={secondary} href="/">Gerar cortes</Link></>}
        </div>
      ) : (
        <ul className="max-h-[50dvh] space-y-1.5 overflow-y-auto pr-1">
          {tab === "organicos"
            ? lib.videos.map((v) => {
              const key = `${v.source}:${v.id}`;
              return row(key, videos.includes(key), (on) => setVideos((p) => (on ? [...p, key] : p.filter((x) => x !== key))), v.title || "Vídeo sem título",
                [v.source === "flow" ? "Google Flow" : "Vídeo final", v.duration ? `${Math.round(v.duration)}s` : "", v.created_at ? brDateTime(v.created_at) : "", v.used_in && `já em ${v.used_in}`].filter(Boolean).join(", "));
            })
            : lib.clips.map((c) => row(c.id, picked.includes(c.id), (on) => setPicked((p) => (on ? [...p, c.id] : p.filter((x) => x !== c.id))), c.hook_title || "Corte sem título",
              [c.source_title, `${Math.round(c.duration)}s`, c.used_in && `já em ${c.used_in}`].filter(Boolean).join(", ")))}
        </ul>
      )}
      {others.length ? (
        <details className="text-xs text-white/60"><summary className="cursor-pointer">Postar também em outras páginas{also.length ? ` (${also.length})` : ""}</summary>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
            {others.map((o) => (
              <label key={o.id} className="flex cursor-pointer items-center gap-2 text-sm text-white">
                <input type="checkbox" className="size-4 accent-violet-500" checked={also.includes(o.id)} onChange={(e) => setAlso((l) => (e.target.checked ? [...l, o.id] : l.filter((x) => x !== o.id)))} />{o.name}
              </label>
            ))}
          </div>
        </details>
      ) : null}
      {repeated ? <p className="text-xs text-amber-300">Atenção: o mesmo arquivo em mais de uma página costuma derrubar a entrega no Facebook. Prefira gerar uma variação para cada página.</p> : null}
      <div className="flex justify-end"><button type="button" className={primary} disabled={!total || busy} onClick={() => void save()}>{busy ? "Colocando…" : `Colocar na agenda (${total})`}</button></div>
    </Modal>
  );
}

/** Resumo da leitura de todas as páginas conectadas: quantas pedem repetir o formato e quantas ainda estão testando. */
function ReadingSummary({ pages }: { pages: FbPage[] }) {
  const read = pages.filter((p) => p.reading);
  const fill = read.filter((p) => p.reading?.status === "encher");
  const spread = read.filter((p) => p.reading?.status === "espalhar");
  const few = read.filter((p) => p.reading?.status === "poucos");
  if (!read.length) return null;
  const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  return (
    <section className={cn(card, "space-y-1")} aria-label="Leitura das páginas">
      <p className="text-sm font-medium text-white">Leitura das páginas</p>
      <p className="text-sm text-white/70">
        {[fill.length ? `${count(fill.length, "página com formato para repetir", "páginas com formato para repetir")}` : "",
          spread.length ? `${count(spread.length, "testando formatos", "testando formatos")}` : "",
          few.length ? `${count(few.length, "com poucos vídeos para ler", "com poucos vídeos para ler")}` : ""].filter(Boolean).join(", ") || "Sem leitura ainda."}
      </p>
      {fill.length ? <p className="text-xs text-white/50">Repetir o formato em: {fill.map((p) => p.name).join(", ")}. Abra Ler a página para ver o vídeo que se destacou.</p> : null}
    </section>
  );
}

/** Assunto da página: é o que guia as ideias de temas e a prévia de viralização. */
function EditPageDialog({ page, onClose, onDone }: { page: FbPage; onClose: () => void; onDone: () => Promise<void> }) {
  const [niche, setNiche] = useState(page.niche);
  const [language, setLanguage] = useState(["en", "es"].includes(page.language) ? page.language : "pt-BR");
  const [countries, setCountries] = useState(page.countries || "");
  const [ramp, setRamp] = useState<string>(page.ramp || "");
  const [postWindow, setPostWindow] = useState(page.post_window || "");
  const save = async () => {
    // a rampa só vai no pedido quando muda, para não recomeçar a contagem a cada salvar
    const body: Record<string, unknown> = { niche: niche.trim(), language, countries, post_window: postWindow };
    if (ramp !== (page.ramp || "")) body.ramp = ramp || false;
    try { await fb.updatePage(page.id, body); toast.success("Assunto salvo"); onClose(); await onDone(); }
    catch (problem) { toast.error((problem as Error).message); }
  };
  return (
    <Modal open onClose={onClose} title={`Assunto, ${page.name}`} description="As ideias de temas e os vídeos seguem este assunto e este idioma. O nome é o do Facebook e acompanha quando você troca lá.">
      <label className="block space-y-1.5"><span className="text-xs font-medium text-white/80">Assunto da página</span>
        <input className={field} value={niche} maxLength={80} onChange={(e) => setNiche(e.target.value)} placeholder="Ex.: curiosidades do Brasil" /></label>
      <label className="block space-y-1.5"><span className="text-xs font-medium text-white/80">Idioma dos conteúdos</span>
        <select className={field} value={language} onChange={(e) => setLanguage(e.target.value)}><option value="pt-BR">Português</option><option value="en">Inglês</option><option value="es">Espanhol</option></select></label>
      <label className="block space-y-1.5"><span className="text-xs font-medium text-white/80">Países que podem ver os posts</span>
        <input className={field} value={countries} maxLength={80} onChange={(e) => setCountries(e.target.value.toUpperCase())} placeholder="Vazio mostra para todos. Ex.: US, CA, GB" />
        <span className="block text-xs text-white/50">Códigos de 2 letras separados por vírgula. Vale para os próximos posts enviados pelo ClipGringa; quem está fora desses países não vê o post.</span></label>
      <div><button type="button" className={secondary} onClick={() => setCountries(TIER_ONE_COUNTRIES.replaceAll(",", ", "))}>Usar Estados Unidos, Canadá, Reino Unido, Austrália e Nova Zelândia</button></div>
      <label className="block space-y-1.5"><span className="text-xs font-medium text-white/80">Horário dos posts</span>
        <select className={field} value={postWindow} onChange={(e) => setPostWindow(e.target.value)}>
          <option value="">Espalhados pelo dia</option>
          <option value="noite">Concentrados à noite, bom para público dos Estados Unidos</option>
        </select>
        <span className="block text-xs text-white/50">Horário de Brasília. Vale para os próximos vídeos colocados na agenda.</span></label>
      <label className="block space-y-1.5"><span className="text-xs font-medium text-white/80">Subida dos posts por dia</span>
        <select className={field} value={ramp} onChange={(e) => setRamp(e.target.value)}>
          <option value="">Ritmo fixo, sempre os posts por dia da página</option>
          <option value="rapida">Subir rápido: 1 hoje, 2 amanhã, depois o ritmo da página</option>
          <option value="gradual">Subir devagar: 1 por dia nos 2 primeiros dias, 2 até o 5º, depois o ritmo</option>
        </select>
        <span className="block text-xs text-white/50">Conta a partir do dia em que você liga. A agenda já sai com a subida pronta, sem ajuste diário.</span></label>
      <div className="flex justify-end"><button type="button" className={primary} onClick={() => void save()}>Salvar assunto</button></div>
    </Modal>
  );
}

/** Resposta automática para quem escreve direto na caixa de mensagens da página. */
function InboxDialog({ page, onClose, onDone }: { page: FbPage; onClose: () => void; onDone: () => Promise<void> }) {
  const [on, setOn] = useState(Boolean(page.inbox_on));
  const [reply, setReply] = useState(page.inbox_reply || "");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { await fb.setInbox(page.id, { on, reply: reply.trim() }); toast.success(on ? "Resposta automática ligada" : "Resposta automática desligada"); onClose(); await onDone(); }
    catch (problem) { toast.error((problem as Error).message); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={`Resposta automática, ${page.name}`} description="Quem escreve para a página recebe a resposta na hora. Se a mensagem tiver a palavra-chave de uma oferta, vai a mensagem daquela oferta; senão, vai a resposta padrão abaixo.">
      <label className="flex cursor-pointer items-center gap-2 text-sm text-white">
        <input type="checkbox" className="size-4 accent-violet-500" checked={on} onChange={(e) => setOn(e.target.checked)} /> Responder sozinho na caixa de mensagens
      </label>
      <label className="block space-y-1.5"><span className="text-xs font-medium text-white/80">Resposta padrão da página</span>
        <textarea className={field} rows={4} maxLength={1000} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Ex.: Oi! Aqui está o link que você pediu: https://..." />
        <span className="block text-xs text-white/50">Em branco, só responde quando a mensagem tiver a palavra-chave de uma oferta. A mesma pessoa recebe a mesma resposta no máximo uma vez a cada 24 horas.</span></label>
      {page.inbox_error ? <p className="text-xs text-amber-300">Última resposta da Meta: {page.inbox_error}</p> : null}
      <p className="text-xs text-white/50">Enquanto a Meta não aprovar a permissão de mensagens do app, a resposta só chega para quem tem papel no app (você e testadores).</p>
      <div className="flex justify-end"><button type="button" className={primary} disabled={busy} onClick={() => void save()}>{busy ? "Salvando…" : "Salvar"}</button></div>
    </Modal>
  );
}

function MetaDialog({ page, onClose, onDone }: { page: FbPage; onClose: () => void; onDone: () => Promise<void> }) {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const { status } = useMetaStatus();
  const [setup, setSetup] = useState(false);
  const connect = async () => {
    setBusy(true);
    try { const r = await fb.connectMeta(page.id, token); toast.success(`Conectada: ${r.page}`); onClose(); await onDone(); }
    catch (problem) { toast.error((problem as Error).message); } finally { setBusy(false); }
  };
  const disconnect = async () => {
    try { await fb.disconnectMeta(page.id); toast.success("Desconectada"); onClose(); await onDone(); } catch (problem) { toast.error((problem as Error).message); }
  };
  const [removing, setRemoving] = useState(false);
  const remove = async () => {
    setBusy(true);
    try { await fb.removePage(page.id); toast.success("Página e dados excluídos do ClipGringa"); onClose(); await onDone(); }
    catch (problem) { toast.error((problem as Error).message); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={`Meta, ${page.name}`} description="Conectada, o ClipGringa agenda os vídeos direto no Facebook, no horário da agenda.">
      {status?.configured ? (
        <button type="button" className={cn(primary, "w-full")} onClick={() => void goToFacebookLogin()}>Entrar com o Facebook</button>
      ) : status ? (
        <button type="button" className={cn(secondary, "w-full")} onClick={() => setSetup(true)}>Ativar o Entrar com o Facebook</button>
      ) : null}
      <p className="text-xs text-white/60">Você entra, marca as páginas e volta. O perfil e todas as páginas dele ficam mapeados e conectados sozinhos.</p>
      <p className="text-xs text-white/60">Sem conectar também funciona: na Agenda, use Postar à mão para baixar o vídeo, copiar a legenda e abrir o Facebook.</p>
      <details className="text-xs text-white/60"><summary className="cursor-pointer">Colar um token à mão</summary>
        <div className="mt-2 space-y-2">
          <input className={field} type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} placeholder="Token de acesso da página" aria-label="Token da página" />
          <div className="flex justify-end"><button type="button" className={secondary} disabled={token.trim().length < 20 || busy} onClick={() => void connect()}>{busy ? "Conferindo…" : "Conectar com o token"}</button></div>
        </div>
      </details>
      {page.meta_connected ? <div className="flex justify-end"><button type="button" className={secondary} onClick={() => void disconnect()}>Desconectar</button></div> : null}
      <div className="border-t border-white/10 pt-3">
        {removing ? (
          <div className="space-y-2">
            <p className="text-xs text-white/70">Isso apaga do ClipGringa o acesso, os posts programados, os comentários, as mensagens e as estatísticas desta página. Nada é apagado no Facebook. Não dá para desfazer.</p>
            <div className="flex justify-end gap-2">
              <button type="button" className={secondary} disabled={busy} onClick={() => setRemoving(false)}>Manter a página</button>
              <button type="button" className={cn(secondary, "border-[#E5484D]/60 text-[#ff8f92]")} disabled={busy} onClick={() => void remove()}>{busy ? "Excluindo…" : `Excluir ${page.name}`}</button>
            </div>
          </div>
        ) : (
          <button type="button" className="text-xs text-white/50 underline-offset-2 hover:text-white hover:underline" onClick={() => setRemoving(true)}>Excluir a página e os dados dela</button>
        )}
      </div>
      {setup ? <MetaSetupDialog onClose={() => setSetup(false)} /> : null}
    </Modal>
  );
}
