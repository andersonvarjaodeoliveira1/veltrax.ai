// Restrição de cada página do Facebook e quanto ela está rendendo (views lidas pela extensão no próprio Chrome do cliente).
export type Restriction = "world" | "us" | "world_no_us";
/** Leituras de um reel: f = primeira vez visto (ms), h = lista de [momento em ms, views]. */
export type ReelRead = { f: number; h: [number, number][] };
export type FbPage = { name: string; url: string; restriction?: Restriction; spy?: boolean; stats?: Record<string, { views: number; videos: number }>; reels?: Record<string, ReelRead> };

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
  const ranking = pages.filter((p) => !p.spy).map((p) => summarize(p, now)).sort((a, b) => (b.today || b.avg7) - (a.today || a.avg7));
  const withData = ranking.filter((r) => r.today > 0 || r.avg7 > 0);
  const best = withData[0] ?? null;
  const lines: string[] = [];
  if (best) lines.push(`Viralizando mais hoje: ${best.page.name} (${restrictionLabel(best.page.restriction)}), com ${best.today.toLocaleString("pt-BR")} views nos vídeos lidos.`);
  const missing = pages.filter((p) => !p.restriction && !p.spy).length;
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

export type RisingReel = { page: FbPage; id: string; url: string; views: number; growth: number; hours: number; perHour: number };

/**
 * "Subindo agora": reels que ganharam views entre a primeira e a última leitura feita pela extensão
 * (com pelo menos 1 hora de diferença). Quem sobe mais por hora vem primeiro.
 */
export function risingReels(pages: FbPage[], minGrowth = 1000, minHours = 1): { rising: RisingReel[]; winners: RisingReel[] } {
  const rising: RisingReel[] = [];
  const winners: RisingReel[] = [];
  for (const page of pages) {
    for (const [id, read] of Object.entries(page.reels ?? {})) {
      const h = [...(read.h ?? [])].sort((a, b) => a[0] - b[0]);
      if (!h.length) continue;
      const first = h[0];
      const last = h[h.length - 1];
      const hours = (last[0] - first[0]) / 3_600_000;
      const base = { page, id, url: `https://www.facebook.com/reel/${id}`, views: last[1] };
      const growth = last[1] - first[1];
      if (hours >= minHours && growth >= minGrowth) rising.push({ ...base, growth, hours, perHour: growth / hours });
      else if (last[1] >= 10_000) winners.push({ ...base, growth: Math.max(growth, 0), hours, perHour: 0 });
    }
  }
  rising.sort((a, b) => b.perHour - a.perHour);
  winners.sort((a, b) => b.views - a.views);
  return { rising: rising.slice(0, 30), winners: winners.slice(0, 30) };
}

export const compact = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1).replace(".", ",")} mi` : n >= 1000 ? `${Math.round(n / 1000)} mil` : String(n));
export const sinceLabel = (hours: number) => (hours < 48 ? `${Math.max(1, Math.round(hours))} h` : `${Math.round(hours / 24)} d`);
