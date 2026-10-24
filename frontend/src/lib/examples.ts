export type ExampleItem = { id: string; group: string; title: string; clips_count: number; top_virality_score: number | null; cover_url: string | null };
export type ExampleClip = { id: string; text?: string | null; duration?: number | null; virality_score?: number | null; hook_title?: string | null; video_url: string };

export const EXAMPLE_THEMES = ["Saúde e bem-estar", "Dinheiro e negócios", "Humor", "Receitas", "Podcast e entrevistas", "Outros"];

export async function fetchExamples(): Promise<ExampleItem[]> {
  const response = await fetch("/api/tasks/examples", { cache: "no-store" });
  if (!response.ok) return [];
  const data = await response.json();
  return (data.examples || []) as ExampleItem[];
}

export async function fetchExample(id: string): Promise<{ title: string | null; clips: ExampleClip[] } | null> {
  const response = await fetch(`/api/tasks/examples/${id}`, { cache: "no-store" });
  if (!response.ok) return null;
  const data = await response.json();
  return { title: data.title ?? null, clips: (data.clips || []) as ExampleClip[] };
}

export async function setExample(id: string, isExample: boolean, group: string): Promise<boolean> {
  const response = await fetch(`/api/tasks/${id}/example`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ is_example: isExample, group }) });
  return response.ok;
}

export function groupExamples(items: ExampleItem[]): [string, ExampleItem[]][] {
  const map = new Map<string, ExampleItem[]>();
  for (const item of items) map.set(item.group, [...(map.get(item.group) ?? []), item]);
  const order = (g: string) => { const i = EXAMPLE_THEMES.indexOf(g); return i === -1 ? EXAMPLE_THEMES.length : i; };
  return [...map.entries()].sort((a, b) => order(a[0]) - order(b[0]) || a[0].localeCompare(b[0]));
}
