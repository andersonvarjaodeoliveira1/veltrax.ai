"use client";

// "Padronizar bio": escreve uma bio curta (about) e uma descrição e aplica em várias
// páginas conectadas à Meta de uma vez, para deixar a marca uniforme e profissional.
// Dá para puxar a bio de uma página existente como base. Só aparece quando há página conectada.

import { useState } from "react";
import { toast } from "sonner";
import { fb, type FbPage } from "@/lib/facebook";
import { card, field, primary, secondary, Modal } from "./ui";

export function ProfileStandardize({ pages, onChange }: { pages: FbPage[]; onChange: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [about, setAbout] = useState("");
  const [description, setDescription] = useState("");
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [loadingFrom, setLoadingFrom] = useState<string | null>(null);
  const conectadas = pages.filter((p) => p.meta_connected);
  if (conectadas.length === 0) return null;

  const toggle = (id: string) => setPicked((a) => ({ ...a, [id]: !a[id] }));
  const selecionadas = conectadas.filter((p) => picked[p.id]);

  const puxar = async (p: FbPage) => {
    setLoadingFrom(p.id);
    try {
      const prof = await fb.getPageProfile(p.id);
      setAbout(prof.about ?? "");
      setDescription(prof.description ?? "");
      toast.success(`Bio de ${p.name} carregada como base`);
    } catch (problem) {
      toast.error(`${p.name}: ${(problem as Error).message}`);
    } finally {
      setLoadingFrom(null);
    }
  };

  const aplicar = async () => {
    if (!about.trim() && !description.trim()) {
      toast.error("Escreva a bio curta e/ou a descrição");
      return;
    }
    if (selecionadas.length === 0) {
      toast.error("Marque ao menos uma página");
      return;
    }
    setBusy(true);
    const body: { about?: string; description?: string } = {};
    if (about.trim()) body.about = about.trim();
    if (description.trim()) body.description = description.trim();
    let ok = 0;
    for (const p of selecionadas) {
      try {
        await fb.applyPageProfile(p.id, body);
        ok += 1;
      } catch (problem) {
        toast.error(`${p.name}: ${(problem as Error).message}`);
      }
    }
    setBusy(false);
    if (ok > 0) {
      toast.success(ok === 1 ? "1 página atualizada" : `${ok} páginas atualizadas`);
      await onChange();
    }
  };

  return (
    <>
      <button type="button" className={secondary} onClick={() => setOpen(true)}>
        Padronizar bio
      </button>
      <Modal
        open={open}
        onClose={() => (busy ? null : setOpen(false))}
        title="Padronizar bio das páginas"
        description="Escreva a bio curta e a descrição e aplique em várias páginas de uma vez. A categoria entra num passo seguinte."
      >
        <div className="space-y-3">
          <div className={card}>
            <label className="mb-1 block text-xs text-white/60">Bio curta (até 255 caracteres)</label>
            <input
              value={about}
              onChange={(e) => setAbout(e.target.value.slice(0, 255))}
              maxLength={255}
              placeholder="Ex.: Dicas práticas de criação de filhos, todo dia."
              className={`${field} mb-1`}
            />
            <div className="mb-2 text-right text-[11px] text-white/40">{about.length}/255</div>
            <label className="mb-1 block text-xs text-white/60">Descrição</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, 5000))}
              maxLength={5000}
              rows={4}
              placeholder="Uma descrição mais completa da página e do que ela oferece."
              className={`${field} mb-1`}
            />
            <div className="text-right text-[11px] text-white/40">{description.length}/5000</div>
          </div>

          <div className={card}>
            <div className="mb-2 text-xs text-white/60">Puxar a bio de uma página como base:</div>
            <div className="flex flex-wrap gap-2">
              {conectadas.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  disabled={loadingFrom !== null}
                  onClick={() => void puxar(p)}
                  className="rounded-full border border-white/15 px-3 py-1 text-xs text-white/80 disabled:opacity-60"
                >
                  {loadingFrom === p.id ? "Carregando…" : p.name}
                </button>
              ))}
            </div>
          </div>

          <div className={card}>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs text-white/60">Aplicar nestas páginas:</span>
              <button
                type="button"
                onClick={() => setPicked(Object.fromEntries(conectadas.map((p) => [p.id, selecionadas.length !== conectadas.length])))}
                className="text-[11px] text-[#C9BBFA] underline"
              >
                {selecionadas.length === conectadas.length ? "desmarcar todas" : "marcar todas"}
              </button>
            </div>
            <div className="space-y-1">
              {conectadas.map((p) => (
                <label key={p.id} className="flex items-center gap-2 text-sm text-white/80">
                  <input type="checkbox" checked={!!picked[p.id]} onChange={() => toggle(p.id)} />
                  {p.name}
                </label>
              ))}
            </div>
          </div>

          <button type="button" className={primary} disabled={busy} onClick={() => void aplicar()}>
            {busy ? "Aplicando…" : `Aplicar em ${selecionadas.length} ${selecionadas.length === 1 ? "página" : "páginas"}`}
          </button>
        </div>
      </Modal>
    </>
  );
}
