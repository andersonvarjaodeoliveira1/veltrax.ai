// Quadro de status do administrador: acesso à Ad Library, referências manuais do ClipSpy,
// permissões do app na Meta e a leitura das páginas. Só mostra o que o servidor devolveu.

export type StatusBoardData = {
  adlib: { status: string; days_left: number | null; never_expires: boolean; auto: boolean; detail: string; source?: string; checked_at: number };
  references: { active: number; total: number; week: number; people: number; last_at: string | null };
  meta_app: {
    configured: boolean; app_id?: string; error: string; others_live?: string[];
    permissions: { name: string; use: string; status: "aprovada" | "pendente" | "nao_pedida"; granted: "sim" | "nao" }[];
    features: { name: string; use: string; status: string }[];
  };
  reading: { verdict: "ok" | "negado" | "zerado" | "sem_videos"; connected: number; videos: number; with_views: number; pages: { name: string; videos: number; with_views: number; error: string; synced_at: string | null }[] };
  inbox?: { pages_on: number; pages_with_error: number; received: number; replied: number; failed: number; last_error: string; last_at: string | null; path: string; verify_token: string };
  // Conta de demonstração do revisor da Meta (Configurações, "Conta de teste do revisor da Meta").
  reviewer?: { configured: boolean; exists: boolean; references: number; pages: string[]; missing_pages: string[] };
  generated_at: number;
};

// Endereço público da API, onde a Meta entrega os avisos de mensagem.
const API_URL = "https://api.clipgringa.gringatools.com";

const th = "px-5 py-2.5 text-left text-[11px] font-medium text-muted-foreground";
const td = "px-5 py-2.5 text-sm";
const good = "text-emerald-600 dark:text-emerald-400";
const warn = "text-amber-600 dark:text-amber-400";
const bad = "text-red-600 dark:text-red-400";

// Sinal para bater o olho: bolinha colorida e sempre uma palavra junto (a cor sozinha não diz nada a quem não a distingue).
export type Tone = "good" | "warn" | "bad" | "off";
const DOT: Record<Tone, string> = { good: "bg-emerald-500", warn: "bg-amber-500", bad: "bg-red-500", off: "bg-muted-foreground/40" };
const TONE_TEXT: Record<Tone, string> = { good, warn, bad, off: "text-muted-foreground" };
function Signal({ tone, label }: { tone: Tone; label: string }) {
  return (
    <span data-tone={tone} className={`inline-flex items-center gap-1.5 text-xs font-semibold ${TONE_TEXT[tone]}`}>
      <span aria-hidden className={`size-2.5 rounded-full ${DOT[tone]}`} />{label}
    </span>
  );
}

/** Verde: o acesso à Ad Library está valendo. Amarelo: vale, mas pede atenção. Vermelho: não vale. */
export function tokenSignal(a: StatusBoardData["adlib"]): { tone: Tone; label: string } {
  if (a.status === "ok") return { tone: "good", label: "OK" };
  if (a.status === "expirado") return { tone: "bad", label: "Expirado" };
  if (a.status === "ausente") return { tone: "bad", label: "Sem acesso" };
  if (a.status === "vencendo") return { tone: "warn", label: "Vencendo" };
  if (a.status === "novo" || a.status === "erro") return { tone: "warn", label: "Conferindo" };
  if (a.status === "falha_renovacao") return { tone: "warn", label: "Renovação falhou" };
  return { tone: "warn", label: "Sem renovação automática" };
}

const READING_SIGNAL: Record<StatusBoardData["reading"]["verdict"], { tone: Tone; label: string }> = {
  ok: { tone: "good", label: "OK" }, negado: { tone: "bad", label: "Negado" }, zerado: { tone: "warn", label: "Zerado" }, sem_videos: { tone: "off", label: "Sem vídeos" },
};

/** A conta do revisor está pronta quando existe, tem página de exemplo e já tem referência salva. */
export function reviewerSignal(r: NonNullable<StatusBoardData["reviewer"]>): { tone: Tone; label: string; text: string } {
  if (!r.configured) return { tone: "off", label: "Não configurada", text: "Crie a conta em Acesso de membro e escreva o e-mail dela em Configurações, Conta de teste do revisor da Meta." };
  if (!r.exists) return { tone: "bad", label: "Conta não existe", text: "O e-mail das Configurações ainda não tem conta. Crie em Acesso de membro, com o mesmo e-mail." };
  if (!r.pages.length) return { tone: "bad", label: "Sem páginas de exemplo", text: "Escreva em Configurações, Páginas de exemplo do revisor, os nomes das páginas conectadas que ele pode ver." };
  const pages = `Páginas de exemplo: ${r.pages.join(", ")}.`;
  const missing = r.missing_pages.length ? ` Não encontrei: ${r.missing_pages.join(", ")}.` : "";
  if (!r.references) return { tone: "warn", label: "Falta abrir uma vez", text: `${pages}${missing} As referências de exemplo são criadas quando a conta abre a Biblioteca do ClipSpy pela primeira vez. Entre com ela e abra.` };
  return { tone: r.missing_pages.length ? "warn" : "good", label: r.missing_pages.length ? "Pronta, com aviso" : "Pronta", text: `${pages}${missing} ${r.references === 1 ? "1 referência salva" : `${r.references} referências salvas`}.` };
}

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "nunca");

function tokenLine(a: StatusBoardData["adlib"]): { text: string; tone: string } {
  const until = a.never_expires ? "sem data de validade" : a.days_left === null ? "" : `válido por ${a.days_left} ${a.days_left === 1 ? "dia" : "dias"}`;
  if (a.status === "ok") return { text: `Válido, ${until}${a.auto ? ", renovação automática ligada" : ""}`, tone: good };
  if (a.status === "expirado") return { text: "Vencido. Entre com o Facebook de novo ou cole um token novo.", tone: bad };
  if (a.status === "ausente") return { text: "Sem acesso configurado.", tone: bad };
  if (a.status === "vencendo") return { text: `Vencendo, ${until}. ${a.detail}`.trim(), tone: warn };
  if (a.status === "novo" || a.status === "erro") return { text: a.detail || "Conferindo o acesso.", tone: warn };
  return { text: `Válido, ${until}, sem renovação automática. ${a.detail}`.trim(), tone: warn };
}

// A Meta só lista o que passou pela análise do app. Sem aprovação, a permissão funciona apenas para quem tem papel no app.
const PERMISSION_TEXT = { aprovada: ["Aprovada para todos", good], pendente: ["Enviada, ainda sem aprovação", warn], nao_pedida: ["Sem aprovação, só para quem tem papel no app", "text-muted-foreground"] } as const;
const READING_TEXT = {
  ok: ["Visualizações chegando", good],
  negado: ["O Facebook está negando as visualizações", bad],
  zerado: ["Vídeos lidos, todos com zero visualizações", warn],
  sem_videos: ["Ainda sem vídeos para ler", "text-muted-foreground"],
} as const;

export function StatusBoard({ data }: { data: StatusBoardData }) {
  const token = tokenLine(data.adlib);
  const [readingText, readingTone] = READING_TEXT[data.reading.verdict];
  // Reels só entram na conta com a permissão de estatísticas: sem ela, o zero pode ser só o que a lista não conta.
  const insights = data.meta_app.permissions.find((p) => p.name === "read_insights")?.granted === "sim";
  const readingHint = !insights && (data.reading.verdict === "zerado" || data.reading.verdict === "negado")
    ? "As reproduções de Reels pedem a permissão read_insights. Adicione no app da Meta, escreva 1 em Visualizações de Reels nas Configurações e entre com o Facebook de novo."
    : "";
  const reviewer = data.reviewer ? reviewerSignal(data.reviewer) : null;
  const approved = data.meta_app.permissions.filter((p) => p.status === "aprovada").length;
  const pending = data.meta_app.permissions.filter((p) => p.status === "pendente").length;
  return (
    <div className="divide-y">
      <dl className="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-4">
        <div className="bg-background px-5 py-4">
          <dt className="flex items-center justify-between gap-2 text-xs text-muted-foreground">Acesso à Ad Library <Signal {...tokenSignal(data.adlib)} /></dt>
          <dd className={`mt-1 text-sm font-medium ${token.tone}`}>{token.text}</dd>
          <dd className="mt-1 text-xs text-muted-foreground">{data.adlib.source ? `Origem: ${data.adlib.source}. ` : ""}Conferido em {data.adlib.checked_at ? when(new Date(data.adlib.checked_at * 1000).toISOString()) : "nunca"}</dd>
        </div>
        <div className="bg-background px-5 py-4">
          <dt className="text-xs text-muted-foreground">Referências manuais no ClipSpy</dt>
          <dd className="mt-1 text-2xl font-semibold tabular-nums">{data.references.active}</dd>
          <dd className="mt-1 text-xs text-muted-foreground">{data.references.week} nos últimos 7 dias, última em {when(data.references.last_at)}{data.references.total > data.references.active ? `, ${data.references.total - data.references.active} arquivadas` : ""}</dd>
        </div>
        <div className="bg-background px-5 py-4">
          <dt className="flex items-center justify-between gap-2 text-xs text-muted-foreground">Permissões do app na Meta {data.meta_app.configured ? <Signal tone={approved ? "good" : "warn"} label={approved ? "Aprovadas" : "Aguardando a Meta"} /> : <Signal tone="bad" label="Sem app" />}</dt>
          <dd className="mt-1 text-sm font-medium">{data.meta_app.configured ? `${approved} aprovadas, ${pending} em análise, ${data.meta_app.permissions.length - approved - pending} sem aprovação` : "App não configurado"}</dd>
          <dd className="mt-1 text-xs text-muted-foreground">{data.meta_app.error || (data.meta_app.app_id ? `App ${data.meta_app.app_id}` : "")}</dd>
        </div>
        <div className="bg-background px-5 py-4">
          <dt className="flex items-center justify-between gap-2 text-xs text-muted-foreground">Leitura das páginas <Signal {...READING_SIGNAL[data.reading.verdict]} /></dt>
          <dd className={`mt-1 text-sm font-medium ${readingTone}`}>{readingText}</dd>
          <dd className="mt-1 text-xs text-muted-foreground">{data.reading.connected} páginas conectadas, {data.reading.videos} vídeos lidos, {data.reading.with_views} com visualizações</dd>
          {readingHint ? <dd className="mt-1 text-xs text-muted-foreground">{readingHint}</dd> : null}
        </div>
      </dl>

      {data.reviewer ? (
        <div className="space-y-1 px-5 py-4">
          <p className="flex flex-wrap items-center gap-3 text-sm font-medium">Conta de teste do revisor da Meta <Signal tone={reviewer!.tone} label={reviewer!.label} /></p>
          <p className="text-sm text-muted-foreground">{reviewer!.text}</p>
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y">
          <thead className="bg-muted/40"><tr><th className={th}>Permissão</th><th className={th}>Para que serve</th><th className={th}>Na Meta</th><th className={th}>No seu login</th></tr></thead>
          <tbody className="divide-y">
            {data.meta_app.permissions.map((p) => {
              const [label, tone] = PERMISSION_TEXT[p.status];
              return (
                <tr key={p.name}>
                  <td className={`${td} font-mono text-xs`}>{p.name}</td>
                  <td className={td}>{p.use}</td>
                  <td className={`${td} ${tone}`}>{label}</td>
                  <td className={td}>{p.granted === "sim" ? "Concedida" : "Não concedida"}</td>
                </tr>
              );
            })}
            {data.meta_app.features.map((f) => (
              <tr key={f.name}>
                <td className={`${td} text-xs`}>{f.name}</td>
                <td className={td}>{f.use}</td>
                <td className={`${td} text-muted-foreground`}>Conferir no painel da Meta</td>
                <td className={td}>Não se aplica</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data.inbox ? (
        <div className="space-y-1 px-5 py-4">
          <p className="text-sm font-medium">Resposta automática da caixa de mensagens</p>
          <p className="text-sm text-muted-foreground">
            {data.inbox.pages_on} {data.inbox.pages_on === 1 ? "página ligada" : "páginas ligadas"}. Nos últimos 7 dias: {data.inbox.received} recebidas, {data.inbox.replied} respondidas, {data.inbox.failed} com falha.
          </p>
          {data.inbox.last_error ? <p className={`text-xs ${bad}`}>Última falha: {data.inbox.last_error}</p> : null}
          <p className="text-xs text-muted-foreground">Para colar no painel da Meta (Webhooks, objeto Page): endereço <span className="select-all font-mono">{API_URL}{data.inbox.path}</span>, frase de verificação <span className="select-all font-mono">{data.inbox.verify_token}</span>, campo <span className="font-mono">messages</span>.</p>
        </div>
      ) : null}

      {data.reading.pages.length ? (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y">
            <thead className="bg-muted/40"><tr><th className={th}>Página</th><th className={th}>Vídeos lidos</th><th className={th}>Com visualizações</th><th className={th}>Última leitura</th><th className={th}>Resposta do Facebook</th></tr></thead>
            <tbody className="divide-y">
              {data.reading.pages.map((p) => (
                <tr key={p.name}>
                  <td className={`${td} font-medium`}>{p.name}</td>
                  <td className={`${td} tabular-nums`}>{p.videos}</td>
                  <td className={`${td} tabular-nums`}>{p.with_views}</td>
                  <td className={td}>{when(p.synced_at)}</td>
                  <td className={`${td} ${p.error ? bad : "text-muted-foreground"}`}>{p.error || "Sem erro"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
