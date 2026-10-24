"use client";

import { useEffect, useState } from "react";
import { Play, Star } from "lucide-react";
import { ClipCover, ScoreRing } from "@/components/app/clip-cover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { EXAMPLE_THEMES, fetchExample, fetchExamples, groupExamples, setExample, type ExampleClip, type ExampleItem } from "@/lib/examples";

/** Exemplos prontos para todas as contas, organizados por tema (só para assistir). */
export function LibraryExamples() {
  const [items, setItems] = useState<ExampleItem[] | null>(null);
  const [open, setOpen] = useState<{ title: string; clips: ExampleClip[] } | null>(null);

  useEffect(() => {
    let alive = true;
    fetchExamples().then((list) => { if (alive) setItems(list); }).catch(() => { if (alive) setItems([]); });
    return () => { alive = false; };
  }, []);

  if (!items || items.length === 0) return null;
  const groups = groupExamples(items);

  const show = async (item: ExampleItem) => {
    const data = await fetchExample(item.id);
    if (data) setOpen({ title: data.title || item.title, clips: data.clips });
  };

  return (
    <section aria-labelledby="examples-title" data-testid="library-examples" className="space-y-5 rounded-2xl border border-border bg-card/40 p-5">
      <div>
        <h2 id="examples-title" className="flex items-center gap-2 font-display text-xl font-bold tracking-tight">Exemplos para começar <span className="rounded-full bg-[#7B3FE4] px-2 py-0.5 text-[10px] font-semibold text-white">BETA</span></h2>
        <p className="mt-1 text-sm text-muted-foreground">Cortes prontos para você ver como fica o resultado. Toque em um para assistir.</p>
      </div>
      {groups.map(([group, list]) => (
        <div key={group} className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{group}</h3>
          <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {list.map((item) => (
              <button key={item.id} type="button" onClick={() => void show(item)} aria-label={`Assistir exemplo: ${item.title}`} className="group text-left focus-visible:outline-none">
                <ClipCover src={item.cover_url} className="aspect-[3/4] rounded-xl ring-1 ring-black/5 transition-shadow group-hover:shadow-lg group-focus-visible:ring-2 group-focus-visible:ring-ring">
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-black/0 to-black/20" />
                  <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur"><Play className="size-3" aria-hidden />Exemplo</span>
                  {item.top_virality_score ? <div className="absolute right-2 top-2 rounded-full bg-black/55 text-white backdrop-blur"><ScoreRing score={item.top_virality_score} size={34} /></div> : null}
                  <span className="absolute inset-x-3 bottom-2.5 text-[11px] font-medium text-white/90">{item.clips_count} {item.clips_count === 1 ? "corte" : "cortes"}</span>
                </ClipCover>
                <h4 className="mt-2 line-clamp-2 text-sm font-semibold leading-snug">{item.title}</h4>
              </button>
            ))}
          </div>
        </div>
      ))}
      <Dialog open={open !== null} onOpenChange={(value) => { if (!value) setOpen(null); }}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{open?.title}</DialogTitle>
            <DialogDescription>Exemplo para assistir. Para criar os seus, use “Novos cortes”.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {open?.clips.map((clip) => (
              <figure key={clip.id} className="space-y-1.5">
                <video src={`/api${clip.video_url}`} controls playsInline preload="metadata" className="aspect-[9/16] w-full rounded-lg bg-black object-cover" />
                {clip.hook_title ? <figcaption className="text-xs text-muted-foreground">{clip.hook_title}</figcaption> : null}
              </figure>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

/** Admin: marca um corte pronto como exemplo (e o tema dele) para todas as contas. */
export function ExampleToggle({ id, isExample, group, onChanged }: { id: string; isExample: boolean; group?: string | null; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [theme, setTheme] = useState(group || EXAMPLE_THEMES[0]);
  const save = async (flag: boolean) => {
    setBusy(true);
    const ok = await setExample(id, flag, theme);
    setBusy(false);
    if (ok) onChanged();
  };
  return (
    <div className="mt-1.5 flex items-center gap-1.5 text-[11px]" data-testid="example-toggle">
      <select aria-label="Tema do exemplo" value={theme} onChange={(event) => setTheme(event.target.value)} disabled={busy} className="min-w-0 flex-1 rounded-md border border-border bg-background px-1.5 py-1 text-[11px]">
        {EXAMPLE_THEMES.map((name) => <option key={name} value={name}>{name}</option>)}
      </select>
      <button type="button" disabled={busy} onClick={() => void save(!isExample)} aria-pressed={isExample} className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border px-2 py-1 font-medium hover:text-foreground aria-pressed:border-transparent aria-pressed:bg-[#7B3FE4] aria-pressed:text-white">
        <Star className="size-3" aria-hidden />{isExample ? "É exemplo" : "Marcar exemplo"}
      </button>
    </div>
  );
}
