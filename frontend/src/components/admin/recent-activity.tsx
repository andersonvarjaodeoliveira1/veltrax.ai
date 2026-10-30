import prisma from "@/lib/prisma";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";

type Row = Record<string, unknown>;
const th = "px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground";
const td = "px-4 py-2.5 text-sm";
const fmt = (d: unknown) => (d ? new Date(d as string).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");
const mb = (n: unknown) => `${(Number(n ?? 0) / 1_048_576).toFixed(1)} MB`;

async function safe(run: () => Promise<Row[]>): Promise<Row[]> {
  try { return await run(); } catch { return []; }
}

function Box({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border bg-card">
      <header className="border-b px-5 py-4">
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </header>
      <div className="overflow-x-auto">{children}</div>
    </section>
  );
}

/** Acompanha o que os clientes estão gerando agora: pedidos de IA (clone, avatar, textos) e vídeos baixados do Flow. */
export async function RecentActivity() {
  const [ai, videos] = await Promise.all([
    safe(() => prisma.$queryRaw<Row[]>`
      SELECT l.created_at, l.user_id, u.email, l.stage, l.model, l.input_tokens, l.output_tokens, l.own_key
      FROM llm_usage l LEFT JOIN users u ON u.id = l.user_id ORDER BY l.created_at DESC LIMIT 40`),
    safe(() => prisma.$queryRaw<Row[]>`
      SELECT f.created_at, f.user_id, u.email, f.package, f.file, f.size
      FROM flow_videos f LEFT JOIN users u ON u.id = f.user_id WHERE f.deleted_at IS NULL ORDER BY f.created_at DESC LIMIT 30`),
  ]);
  const who = (r: Row) => (
    <Link href={`/admin?user=${String(r.user_id)}#ficha`} className="underline-offset-4 hover:underline">{String(r.email ?? r.user_id)}</Link>
  );
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Box title="Gerações de IA recentes" description="Pedidos de IA dos clientes (clone, avatar, textos). Clique no e-mail para abrir a ficha.">
        <table className="min-w-full divide-y">
          <thead className="bg-muted/40"><tr><th className={th}>Quando</th><th className={th}>Cliente</th><th className={th}>Etapa</th><th className={th}>Modelo</th><th className={th}>Tokens</th><th className={th}>Origem</th></tr></thead>
          <tbody className="divide-y">
            {ai.length === 0 ? <tr><td className={`${td} text-muted-foreground`} colSpan={6}>Nenhum pedido de IA registrado ainda.</td></tr> : ai.map((r, i) => (
              <tr key={i} className="hover:bg-muted/30">
                <td className={`${td} whitespace-nowrap text-muted-foreground`}>{fmt(r.created_at)}</td>
                <td className={td}>{who(r)}</td>
                <td className={td}>{String(r.stage || "—")}</td>
                <td className={`${td} text-muted-foreground`}>{String(r.model || "—")}</td>
                <td className={`${td} tabular-nums`}>{(Number(r.input_tokens) + Number(r.output_tokens)).toLocaleString("pt-BR")}</td>
                <td className={td}><Badge variant="outline">{r.own_key ? "chave/conta dele" : "plano"}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Box>
      <Box title="Vídeos do Flow recentes" description="Vídeos que a extensão baixou do Flow e enviou para o ClipGringa.">
        <table className="min-w-full divide-y">
          <thead className="bg-muted/40"><tr><th className={th}>Quando</th><th className={th}>Cliente</th><th className={th}>Pacote</th><th className={th}>Arquivo</th><th className={th}>Tamanho</th></tr></thead>
          <tbody className="divide-y">
            {videos.length === 0 ? <tr><td className={`${td} text-muted-foreground`} colSpan={5}>Nenhum vídeo do Flow recebido ainda.</td></tr> : videos.map((r, i) => (
              <tr key={i} className="hover:bg-muted/30">
                <td className={`${td} whitespace-nowrap text-muted-foreground`}>{fmt(r.created_at)}</td>
                <td className={td}>{who(r)}</td>
                <td className={td}>{String(r.package || "—")}</td>
                <td className={`${td} text-muted-foreground`}>{String(r.file || "—")}</td>
                <td className={`${td} tabular-nums`}>{mb(r.size)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Box>
    </div>
  );
}
