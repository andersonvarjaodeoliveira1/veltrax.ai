"use client";

import { risingReels, compact, sinceLabel, type FbPage } from "@/lib/fb-insights";

/** "Subindo agora": o que cresceu mais entre as leituras da extensão nas páginas do cliente (dados só neste navegador). */
export function RisingReels({ pages }: { pages: FbPage[] }) {
  const { rising, winners } = risingReels(pages);
  const reading = pages.some((p) => p.reels && Object.keys(p.reels).length > 0);
  return (
    <div className="space-y-3 rounded-[14px] border border-[#FF6A00]/40 bg-[#FF6A00]/5 p-3" data-testid="rising-reels">
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-[#FF6A00] px-2 py-0.5 text-[10px] font-bold tracking-wider text-black">VIRAL</span>
        <p className="text-sm font-semibold">Subindo agora <span className="ml-1 rounded-full bg-[#7B3FE4] px-2 py-0.5 text-[10px] font-semibold text-white">BETA</span></p>
      </div>
      <p className="text-xs text-muted-foreground">Reels das suas páginas e das páginas que você acompanha que ganharam views entre as leituras da extensão. É o que está crescendo hoje. Abra a aba <b>Reels</b> de cada página de novo, de tempos em tempos, para a lista se atualizar.</p>
      {rising.length === 0 && (
        <p className="text-xs text-muted-foreground">{reading ? "Ainda nada subiu. Volte a ler as páginas daqui a algumas horas (a comparação precisa de pelo menos 1 hora entre as leituras)." : "Nenhum reel lido ainda. Abra a aba Reels de uma página salva no Facebook e role a lista."}</p>
      )}
      <ul className="space-y-1.5">
        {rising.map((r) => (
          <li key={r.page.url + r.id} className="flex flex-wrap items-center gap-2 rounded-[12px] bg-background/60 px-3 py-2 text-xs" data-testid="rising-item">
            <span className="min-w-0 flex-1"><b className="text-sm">{r.page.name}</b>{r.page.spy ? " · concorrente" : ""}<br />
              {compact(r.views)} views · <b className="text-[#FF6A00]">+{compact(r.growth)} em {sinceLabel(r.hours)}</b></span>
            <a href={r.url} target="_blank" rel="noopener noreferrer" className="rounded-full border border-border px-3 py-1 hover:text-foreground">Abrir o reel</a>
          </li>
        ))}
      </ul>
      {winners.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground">Vencedores (10 mil+ views) · {winners.length}</summary>
          <ul className="mt-2 space-y-1.5">
            {winners.map((r) => (
              <li key={r.page.url + r.id} className="flex flex-wrap items-center gap-2 rounded-[12px] bg-background/60 px-3 py-2" data-testid="winner-item">
                <span className="min-w-0 flex-1"><b>{r.page.name}</b> · {compact(r.views)} views</span>
                <a href={r.url} target="_blank" rel="noopener noreferrer" className="rounded-full border border-border px-3 py-1 hover:text-foreground">Abrir o reel</a>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
