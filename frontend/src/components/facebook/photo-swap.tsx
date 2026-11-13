"use client";

// "Trocar foto e capa": troca a foto de perfil e a capa das páginas conectadas à Meta,
// com arquivos enviados do computador, uma página por vez. Só aparece quando há página conectada.

import { useState } from "react";
import { toast } from "sonner";
import { fb, type FbPage } from "@/lib/facebook";
import { card, field, primary, secondary, Modal } from "./ui";

type Escolha = { picture?: File; cover?: File };

export function PhotoSwap({ pages, onChange }: { pages: FbPage[]; onChange: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<Record<string, Escolha>>({});
  const [rodandoId, setRodandoId] = useState<string | null>(null);
  const conectadas = pages.filter((p) => p.meta_connected);
  if (conectadas.length === 0) return null;

  const pick = (id: string, campo: keyof Escolha, file: File | undefined) =>
    setFiles((atual) => ({ ...atual, [id]: { ...atual[id], [campo]: file } }));

  const aplicar = async (p: FbPage) => {
    const esc = files[p.id];
    if (!esc?.picture && !esc?.cover) {
      toast.error("Escolha a foto de perfil, a capa, ou as duas");
      return;
    }
    setRodandoId(p.id);
    try {
      const { feito } = await fb.applyPagePhotos(p.id, esc.picture, esc.cover);
      toast.success(feito.length ? `${p.name}: ${feito.join(" e ")} trocada(s)` : `${p.name}: nada a trocar`);
      await onChange();
    } catch (problem) {
      toast.error(`${p.name}: ${(problem as Error).message}`);
    } finally {
      setRodandoId(null);
    }
  };

  return (
    <>
      <button type="button" className={secondary} onClick={() => setOpen(true)}>
        Trocar foto e capa
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Trocar foto e capa"
        description="Escolha a imagem de perfil e a capa de cada página, direto do seu computador. JPG ou PNG, até 8 MB."
      >
        <div className="space-y-3">
          {conectadas.map((p) => (
            <div key={p.id} className={card}>
              <div className="mb-2 text-sm font-medium text-white">{p.name}</div>
              <label className="mb-1 block text-xs text-white/60">Foto de perfil</label>
              <input
                type="file"
                accept="image/jpeg,image/png"
                className={`${field} mb-2`}
                onChange={(e) => pick(p.id, "picture", e.target.files?.[0])}
              />
              <label className="mb-1 block text-xs text-white/60">Capa</label>
              <input
                type="file"
                accept="image/jpeg,image/png"
                className={`${field} mb-3`}
                onChange={(e) => pick(p.id, "cover", e.target.files?.[0])}
              />
              <button type="button" className={primary} disabled={rodandoId === p.id} onClick={() => void aplicar(p)}>
                {rodandoId === p.id ? "Aplicando…" : "Aplicar nesta página"}
              </button>
            </div>
          ))}
        </div>
      </Modal>
    </>
  );
}
