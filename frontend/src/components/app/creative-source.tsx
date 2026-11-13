"use client";

// Entrada de criativo para modelar: duas opções —
// (A) subir um vídeo campeão do computador, ou (B) escolher um da biblioteca do ClipSpy.
// Bloco aditivo: guarda a referência escolhida e mostra na tela, sem alterar o fluxo de clonagem.
import { ExternalLink, Library, Loader2, Star, Upload, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { clipspy, type Creative } from "@/lib/clipspy";

type Chosen = { kind: "upload"; name: string } | { kind: "bank"; creative: Creative };

export function CreativeSource() {
  const [chosen, setChosen] = useState<Chosen | null>(null);
  const [open, setOpen] = useState(false);

  return (
    <section className="relative space-y-3 rounded-[22px] border border-white/10 bg-white/[0.02] p-5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#A98BFF]">De onde vem o criativo campeão?</p>
      <div className="flex flex-wrap gap-2">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-sm hover:bg-white/5">
          <Upload className="size-4" /> Opção A · Subir do computador
          <input type="file" accept="video/*" hidden onChange={(e) => {
            const f = e.target.files?.[0]; e.target.value = "";
            if (f) { setChosen({ kind: "upload", name: f.name }); toast.success("Vídeo campeão selecionado do computador"); }
          }} />
        </label>
        <button type="button" onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-sm hover:bg-white/5">
          <Library className="size-4" /> Opção B · Escolher da biblioteca (ClipSpy)
        </button>
      </div>

      {chosen && (
        <div className="flex items-center gap-2 rounded-[12px] bg-white/[0.03] px-3 py-2 text-sm">
          <span className="text-white/50">Referência:</span>
          {chosen.kind === "upload" ? (
            <span className="truncate text-white/85">{chosen.name}</span>
          ) : (
            <>
              <span className="truncate text-white/85">{chosen.creative.advertiser || "anúncio"} — {chosen.creative.title?.slice(0, 60) || "campeão"}</span>
              {chosen.creative.permalink && (
                <a href={chosen.creative.permalink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[#C9BBFA] underline">
                  ver <ExternalLink className="size-3" />
                </a>
              )}
            </>
          )}
          <button type="button" aria-label="Tirar" onClick={() => setChosen(null)} className="ml-auto text-white/50 hover:text-white"><X className="size-4" /></button>
        </div>
      )}

      {open && <BankPicker onClose={() => setOpen(false)} onPick={(c) => {
        setChosen({ kind: "bank", creative: c }); setOpen(false);
        void clipspy.setStatus(c.id, "usado").catch(() => {});
      }} />}
    </section>
  );
}

function BankPicker({ onClose, onPick }: { onClose: () => void; onPick: (c: Creative) => void }) {
  const [items, setItems] = useState<Creative[] | null>(null);
  useEffect(() => {
    clipspy.bank({ champion: true }).then((r) => setItems(r.items)).catch((e) => { toast.error((e as Error).message); setItems([]); });
  }, []);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label="Biblioteca do ClipSpy">
      <div className="max-h-[80vh] w-full max-w-lg overflow-auto rounded-[16px] border border-white/10 bg-[#1a191d] p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Vídeos campeões da biblioteca</h3>
          <button type="button" aria-label="Fechar" onClick={onClose} className="text-white/60 hover:text-white"><X className="size-4" /></button>
        </div>
        {items === null ? (
          <p className="flex items-center gap-2 text-sm text-white/60"><Loader2 className="size-4 animate-spin" /> Carregando…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-white/60">Nenhum campeão salvo ainda. Abra o <a href="/clipspy" className="underline">ClipSpy</a>, pesquise um termo e salve os vencedores.</p>
        ) : (
          <div className="space-y-2">
            {items.map((c) => (
              <button key={c.id} type="button" onClick={() => onPick(c)}
                className="block w-full rounded-[12px] border border-white/10 bg-white/[0.02] p-3 text-left hover:border-[#A98BFF]/40">
                <div className="mb-1 flex items-center gap-2">
                  {c.is_champion && <span className="inline-flex items-center gap-1 rounded-full bg-[#7B3FE4]/20 px-2 py-0.5 text-[11px] text-[#C9BBFA]"><Star className="size-3" /> Campeão</span>}
                  <span className="text-[11px] text-white/50">{c.metrics?.run_days ? `${c.metrics.run_days} dias ativo` : ""}</span>
                  <span className="ml-auto text-[11px] text-white/40">{c.advertiser}</span>
                </div>
                <p className="line-clamp-2 text-sm text-white/85">{c.title || "(sem texto)"}</p>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
