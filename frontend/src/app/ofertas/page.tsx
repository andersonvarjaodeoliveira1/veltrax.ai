"use client";

import { Tag, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/app/page-header";
import { EMPTY_OFFER, listOffers, removeOffer, saveOffer, type Offer, type OfferDraft } from "@/lib/offers";

const LANGUAGES: Array<[string, string]> = [["pt-BR", "Português"], ["en", "Inglês"], ["es", "Espanhol"], ["fr", "Francês"], ["de", "Alemão"], ["it", "Italiano"]];
const field = "block w-full rounded-[12px] border border-white/15 bg-black/30 px-3 py-2.5 text-sm text-white placeholder:text-white/40 focus:border-violet-400 focus:outline-none";

export default function OffersPage() {
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const [draft, setDraft] = useState<OfferDraft>(EMPTY_OFFER);
  const [editing, setEditing] = useState<string | undefined>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setOffers(await listOffers()); setError(""); } catch (problem) { setError((problem as Error).message); setOffers([]); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const set = (patch: Partial<OfferDraft>) => setDraft((current) => ({ ...current, ...patch }));
  const reset = () => { setDraft(EMPTY_OFFER); setEditing(undefined); };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft.name.trim()) { setError("Dê um nome para a oferta."); return; }
    setBusy(true);
    try { await saveOffer(draft, editing); reset(); await load(); } catch (problem) { setError((problem as Error).message); } finally { setBusy(false); }
  };

  const edit = (offer: Offer) => {
    setEditing(offer.id);
    setDraft({ name: offer.name, product: offer.product, keyword: offer.keyword, language: offer.language, approved_copy: offer.approved_copy, notes: offer.notes, reference_url: offer.reference_url, dm_message: offer.dm_message ?? "" });
    window.scrollTo?.({ top: 0, behavior: "smooth" });
  };

  const remove = async (offer: Offer) => {
    if (!window.confirm(`Apagar a oferta "${offer.name}"? Os vídeos já criados não são apagados.`)) return;
    try { await removeOffer(offer.id); await load(); } catch (problem) { setError((problem as Error).message); }
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-4 sm:p-8">
      <PageHeader icon={Tag} title="Ofertas" description="Salve o que você vende uma vez: produto, copy aprovada e palavra-chave. No assistente, é só escolher a oferta." />

      <form onSubmit={submit} className="space-y-3 rounded-[22px] border border-white/10 bg-[#1a191d] p-5" aria-label="Oferta">
        <h2 className="text-sm font-bold text-white">{editing ? "Editar oferta" : "Nova oferta"}</h2>
        <label className="block space-y-1.5"><span className="text-xs font-medium text-white/80">Nome da oferta</span>
          <input className={field} value={draft.name} maxLength={120} onChange={(e) => set({ name: e.target.value })} placeholder="Ex.: Jogo de lençol, campanha de novembro" /></label>
        <label className="block space-y-1.5"><span className="text-xs font-medium text-white/80">Produto</span>
          <input className={field} value={draft.product} maxLength={200} onChange={(e) => set({ product: e.target.value })} placeholder="Nome do produto que aparece nos vídeos" /></label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1.5"><span className="text-xs font-medium text-white/80">Palavra que a pessoa comenta</span>
            <input className={field} value={draft.keyword} maxLength={30} onChange={(e) => set({ keyword: e.target.value.toUpperCase() })} placeholder="Ex.: QUERO" /></label>
          <label className="block space-y-1.5"><span className="text-xs font-medium text-white/80">Idioma</span>
            <select className={field} value={draft.language} onChange={(e) => set({ language: e.target.value })}>{LANGUAGES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        </div>
        <label className="block space-y-1.5"><span className="text-xs font-medium text-white/80">Mensagem privada para quem comentar a palavra (opcional)</span>
          <textarea className={`${field} min-h-20`} value={draft.dm_message ?? ""} maxLength={900} onChange={(e) => set({ dm_message: e.target.value })} placeholder="Ex.: Oi! Aqui está o link que você pediu: https://…" />
          <span className="block text-xs text-white/50">A Página envia uma vez, só para comentário novo, nas páginas conectadas pelo Entrar com o Facebook. Deixe vazio para não enviar.</span></label>
        <label className="block space-y-1.5"><span className="text-xs font-medium text-white/80">Copy aprovada (o que é dito no vídeo)</span>
          <textarea className={`${field} min-h-32`} value={draft.approved_copy} maxLength={6000} onChange={(e) => set({ approved_copy: e.target.value })} placeholder="Cole a copy que já funcionou. O assistente usa como base." /></label>
        <label className="block space-y-1.5"><span className="text-xs font-medium text-white/80">Link da referência (opcional)</span>
          <input className={field} value={draft.reference_url} maxLength={500} onChange={(e) => set({ reference_url: e.target.value })} placeholder="https://…" /></label>
        <label className="block space-y-1.5"><span className="text-xs font-medium text-white/80">Anotações (público, dores, o que evitar)</span>
          <textarea className={`${field} min-h-20`} value={draft.notes} maxLength={1500} onChange={(e) => set({ notes: e.target.value })} /></label>
        {error ? <p role="alert" className="text-sm text-[#F0466B]">{error}</p> : null}
        <div className="flex gap-2">
          <button type="submit" disabled={busy} className="rounded-full bg-gradient-to-br from-[#8B5CF6] to-[#7B3FE4] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60">{busy ? "Salvando…" : editing ? "Salvar alterações" : "Salvar oferta"}</button>
          {editing ? <button type="button" onClick={reset} className="rounded-full border border-white/20 px-5 py-2.5 text-sm text-white">Cancelar</button> : null}
        </div>
      </form>

      <section className="space-y-3" aria-label="Suas ofertas">
        <h2 className="text-sm font-bold text-white">Suas ofertas</h2>
        {offers === null ? <p className="text-sm text-white/60">Carregando…</p> : offers.length === 0 ? <p className="rounded-[16px] border border-dashed border-white/15 p-4 text-sm text-white/70">Você ainda não salvou nenhuma oferta. Preencha o formulário acima e salve a primeira.</p> : offers.map((offer) => (
          <article key={offer.id} className="flex items-start justify-between gap-3 rounded-[18px] border border-white/10 bg-[#1a191d] p-4">
            <div className="min-w-0 space-y-1">
              <p className="truncate text-sm font-bold text-white">{offer.name}</p>
              <p className="text-xs text-white/60">{[offer.product, offer.keyword && `Palavra: ${offer.keyword}`].filter(Boolean).join(" · ") || "Sem produto definido"}</p>
              {offer.approved_copy ? <p className="line-clamp-2 text-xs text-white/50">{offer.approved_copy}</p> : null}
            </div>
            <div className="flex shrink-0 gap-2">
              <button type="button" onClick={() => edit(offer)} className="rounded-full border border-white/20 px-3 py-1.5 text-xs text-white">Editar</button>
              <button type="button" onClick={() => void remove(offer)} aria-label={`Apagar ${offer.name}`} className="rounded-full border border-white/20 p-1.5 text-white/80"><Trash2 className="size-4" /></button>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
