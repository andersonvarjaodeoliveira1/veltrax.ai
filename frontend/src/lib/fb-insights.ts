// Restrição de cada página do Facebook e quanto ela está rendendo (views lidas pela extensão no próprio Chrome do cliente).
export type Restriction = "world" | "us" | "world_no_us";
export type FbPage = { name: string; url: string; restriction?: Restriction; stats?: Record<string, { views: number; videos: number }> };

export const RESTRICTIONS: { id: Restriction; label: string }[] = [
  { id: "world", label: "Mundo todo" },
  { id: "us", label: "Só EUA" },
  { id: "world_no_us", label: "Mundo sem EUA" },
];
export const restrictionLabel = (r?: Restriction) => RESTRICTIONS.find((x) => x.id === r)?.label ?? "Sem restrição marcada";

export function dayKey(date: Date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export type PageSummary = { page: FbPage; today: number; avg7: number; days: number };

export function summarize(page: FbPage, now: Date = new Date()): PageSummary {
  const stats = page.stats ?? {};
  const keys: string[] = [];
  for (let i = 0; i < 7; i += 1) { const d = new Date(now); d.setDate(d.getDate() - i); keys.push(dayKey(d)); }
  const seen = keys.map((k) => stats[k]?.views ?? 0).filter((v) => v > 0);
  const avg7 = seen.length ? Math.round(seen.reduce((a, b) => a + b, 0) / seen.length) : 0;
  return { page, today: stats[dayKey(now)]?.views ?? 0, avg7, days: seen.length };
}

export type Insights = { ranking: PageSummary[]; best: PageSummary | null; lines: string[] };

export function insights(pages: FbPage[], now: Date = new Date()): Insights {
  const ranking = pages.map((p) => summarize(p, now)).sort((a, b) => (b.today || b.avg7) - (a.today || a.avg7));
  const withData = ranking.filter((r) => r.today > 0 || r.avg7 > 0);
  const best = withData[0] ?? null;
  const lines: string[] = [];
  if (best) lines.push(`Viralizando mais hoje: ${best.page.name} (${restrictionLabel(best.page.restriction)}), com ${best.today.toLocaleString("pt-BR")} views nos vídeos lidos.`);
  const missing = pages.filter((p) => !p.restriction).length;
  if (missing > 0) lines.push(`Marque a restrição de ${missing} ${missing === 1 ? "página" : "páginas"} para eu comparar quais rendem mais.`);
  const groups = RESTRICTIONS.map((r) => {
    const list = ranking.filter((x) => x.page.restriction === r.id && x.avg7 > 0);
    return { r, count: list.length, avg: list.length ? Math.round(list.reduce((a, b) => a + b.avg7, 0) / list.length) : 0, days: list.reduce((a, b) => a + b.days, 0) };
  }).filter((g) => g.count > 0);
  if (groups.length >= 2) {
    const sorted = [...groups].sort((a, b) => b.avg - a.avg);
    const [top, next] = sorted;
    const pct = next.avg > 0 ? Math.round(((top.avg - next.avg) / next.avg) * 100) : 0;
    const few = top.days + next.days < 6 ? " (ainda poucos dias de dados)" : "";
    lines.push(`As páginas “${top.r.label}” rendem em média ${pct}% mais views que as “${next.r.label}” nos últimos 7 dias${few}.`);
  }
  return { ranking, best, lines };
}
