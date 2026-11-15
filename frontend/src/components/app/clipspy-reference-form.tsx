"use client";

// Arquivo de referências manual: a pessoa acha um vídeo navegando, cola o link e anota o que viu.
// Nada é buscado no link. O texto do vídeo é o que o botão de modelar usa.
import { Bookmark, Loader2, Wand2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { clipspy, type Creative } from "@/lib/clipspy";

const field = "w-full rounded-[12px] border border-white/15 bg-black/30 px-3 py-2 text-sm text-white outline-none placeholder:text-white/35";
const label = "mb-1 block text-xs text-white/60";
const EMPTY = { link: "", text: "", advertiser: "", views: "", comments: "", hook: "", feeling: "", cta: "", note: "", champion: false };
const FEELINGS = ["Curiosidade", "Medo", "Desejo", "Urgência", "Alívio", "Esperança", "Indignação", "Identificação"];

export function ReferenceForm({ onSaved, onModel }: { onSaved: (c: Creative) => void; onModel: (c: Creative) => void }) {
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState<"" | "save" | "model">("");
  const set = (patch: Partial<typeof EMPTY>) => setForm((f) => ({ ...f, ...patch }));
  // Dá para modelar com o texto do vídeo ou, sem ele, com o hook e a CTA anotados.
  const canModel = form.text.trim().length >= 10 || `${form.hook} ${form.cta}`.trim().length >= 10;

  async function submit(mode: "save" | "model") {
    if (!/^https?:\/\/\S+\.\S+/.test(form.link.trim())) { toast.error("Cole o link completo do vídeo, começando com https://"); return; }
    setBusy(mode);
    try {
      const saved = await clipspy.addReference(form);
      setForm(EMPTY);
      if (mode === "model") onModel(saved);
      else { toast.success("Referência salva na biblioteca"); onSaved(saved); }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="space-y-3 rounded-[18px] border border-white/10 bg-[#1a191d] p-4">
      <div>
        <h3 className="text-sm font-semibold text-white">Adicionar referência</h3>
        <p className="text-xs text-white/50">Achou um vídeo que está indo bem? Cole o link e anote o que viu. Fica na sua biblioteca, pronto para modelar.</p>
      </div>
      <div>
        <label className={label} htmlFor="ref-link">Link do vídeo</label>
        <input id="ref-link" className={field} value={form.link} onChange={(e) => set({ link: e.target.value })} placeholder="https://www.facebook.com/reel/..." inputMode="url" />
      </div>
      <div>
        <label className={label} htmlFor="ref-text">Texto do vídeo (a fala ou a legenda)</label>
        <textarea id="ref-text" className={`${field} resize-y`} rows={4} maxLength={2000} value={form.text} onChange={(e) => set({ text: e.target.value })}
          placeholder="Escreva ou cole o que é dito no vídeo. É isso que o Modelar usa para tirar a estrutura." />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className={label} htmlFor="ref-page">Página ou perfil</label>
          <input id="ref-page" className={field} maxLength={160} value={form.advertiser} onChange={(e) => set({ advertiser: e.target.value })} placeholder="Nome da página" />
        </div>
        <div>
          <label className={label} htmlFor="ref-views">Visualizações</label>
          <input id="ref-views" className={field} value={form.views} onChange={(e) => set({ views: e.target.value })} placeholder="Ex.: 224 mil" />
        </div>
        <div>
          <label className={label} htmlFor="ref-comments">Comentários</label>
          <input id="ref-comments" className={field} value={form.comments} onChange={(e) => set({ comments: e.target.value })} placeholder="Ex.: 1.500" />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className={label} htmlFor="ref-hook">O que chamou atenção (hook)</label>
          <input id="ref-hook" className={field} maxLength={200} value={form.hook} onChange={(e) => set({ hook: e.target.value })} placeholder="Ex.: começa com uma pergunta direta" />
        </div>
        <div>
          <label className={label} htmlFor="ref-feeling">Sentimento do vídeo</label>
          <input id="ref-feeling" className={field} maxLength={60} list="ref-feelings" value={form.feeling} onChange={(e) => set({ feeling: e.target.value })} placeholder="Ex.: Curiosidade" />
          <datalist id="ref-feelings">{FEELINGS.map((f) => <option key={f} value={f} />)}</datalist>
        </div>
        <div>
          <label className={label} htmlFor="ref-cta">CTA utilizada</label>
          <input id="ref-cta" className={field} maxLength={200} value={form.cta} onChange={(e) => set({ cta: e.target.value })} placeholder="Ex.: comente SIM que eu envio" />
        </div>
      </div>
      <p className="text-xs text-white/45">O hook, o sentimento e a CTA entram como direção quando você modelar: o roteiro novo segue esse estilo de abertura, esse tom e esse tipo de chamada.</p>
      <div>
        <label className={label} htmlFor="ref-note">Observação</label>
        <input id="ref-note" className={field} maxLength={300} value={form.note} onChange={(e) => set({ note: e.target.value })} placeholder="Ex.: formato de entrevista, cenário de cozinha" />
      </div>
      <label className="flex cursor-pointer items-center gap-2 text-xs text-white/70">
        <input type="checkbox" checked={form.champion} onChange={(e) => set({ champion: e.target.checked })} /> Marcar como campeão
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={busy !== ""} onClick={() => void submit("save")}
          className="inline-flex items-center gap-2 rounded-full border border-white/20 px-4 py-2 text-sm text-white disabled:opacity-60">
          {busy === "save" ? <Loader2 className="size-4 animate-spin" /> : <Bookmark className="size-4" />} Salvar na biblioteca
        </button>
        <button type="button" disabled={busy !== "" || !canModel} onClick={() => void submit("model")}
          className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[#8B5CF6] to-[#7B3FE4] px-5 py-2 text-sm font-semibold text-white disabled:opacity-60">
          {busy === "model" ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />} Salvar e modelar
        </button>
        {!canModel ? <span className="text-xs text-white/45">Para modelar, escreva o texto do vídeo, ou o hook e a CTA.</span> : null}
      </div>
    </div>
  );
}
