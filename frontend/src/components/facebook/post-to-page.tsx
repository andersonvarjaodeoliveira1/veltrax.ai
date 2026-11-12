"use client";

import { Megaphone } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/auth-client";
import { fb, type FbPage } from "@/lib/facebook";
import { Modal } from "./ui";

/** Botão "Postar numa página" no corte. Módulo em construção: só aparece para administradores. */
export function PostToPage({ clipId }: { clipId: string }) {
  const { data: session } = useSession();
  const [pages, setPages] = useState<FbPage[] | null>(null);
  const [open, setOpen] = useState(false);
  if (!(session?.user as { is_admin?: boolean } | undefined)?.is_admin) return null;

  const show = async () => {
    setOpen(true);
    try { setPages((await fb.overview()).pages); } catch (problem) { toast.error((problem as Error).message); setPages([]); }
  };
  const send = async (page: FbPage) => {
    try { await fb.addClips(page.id, [clipId]); toast.success(`Corte na agenda de ${page.name}`); setOpen(false); }
    catch (problem) { toast.error((problem as Error).message); }
  };
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => void show()}><Megaphone className="size-4" />Postar numa página</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Postar numa página" description="O corte entra no próximo horário livre da página.">
        {pages === null ? <p className="text-sm text-white/60">Carregando…</p> : pages.length === 0 ? <p className="text-sm text-white/70">Nenhuma página cadastrada. Cadastre em Facebook, Páginas.</p> : (
          <ul className="space-y-1.5">
            {pages.map((p) => (
              <li key={p.id}><button type="button" onClick={() => void send(p)} className="flex w-full items-center justify-between rounded-[12px] border border-white/10 px-3 py-2.5 text-left text-sm text-white hover:border-violet-400">
                <span>{p.name}</span><span className="text-xs text-white/50">{p.upcoming} na agenda</span></button></li>
            ))}
          </ul>
        )}
      </Modal>
    </>
  );
}
