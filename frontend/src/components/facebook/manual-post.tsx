"use client";

import { useState } from "react";
import { toast } from "sonner";
import { brDateTime, fb, type FbPage, type FbPost } from "@/lib/facebook";
import { field, Modal, primary, secondary } from "./ui";

const composerUrl = (p: FbPage) => (p.meta_page_id ? `https://business.facebook.com/latest/composer?asset_id=${p.meta_page_id}` : p.link || "https://business.facebook.com/latest/composer");

/** Sem conexão com a Meta: baixar o vídeo, copiar a legenda, abrir o Facebook e marcar como feito. */
export function ManualPostDialog({ page, post, onClose, onDone }: { page: FbPage; post: FbPost; onClose: () => void; onDone: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const done = async () => {
    setBusy(true);
    try { await fb.postDone(post.id); toast.success("Marcado como postado"); onClose(); await onDone(); }
    catch (problem) { toast.error((problem as Error).message); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={`Postar à mão, ${page.name}`} description={`${post.title}. Horário sugerido: ${brDateTime(post.scheduled_at)}.`}>
      <ol className="space-y-3 text-sm text-white">
        <li className="flex items-center justify-between gap-3"><span>1. Baixe o vídeo</span>
          <a className={secondary} href={fb.postFileUrl(post.id)} download>Baixar vídeo</a></li>
        <li className="flex items-center justify-between gap-3"><span>2. Copie a legenda</span>
          <button type="button" className={secondary} onClick={() => { void navigator.clipboard.writeText(post.caption).then(() => toast.success("Legenda copiada")); }}>Copiar legenda</button></li>
        <li className="flex items-center justify-between gap-3"><span>3. Poste ou programe no Facebook</span>
          <a className={secondary} href={composerUrl(page)} target="_blank" rel="noopener noreferrer">Abrir o Facebook</a></li>
      </ol>
      <p className="whitespace-pre-wrap rounded-[8px] bg-black/30 p-3 text-xs text-white/70">{post.caption || "Sem legenda"}</p>
      <div className="flex justify-end"><button type="button" className={primary} disabled={busy} onClick={() => void done()}>{busy ? "Salvando…" : "Já postei"}</button></div>
    </Modal>
  );
}

/** Registra posts feitos direto no Facebook, para os números baterem quando a página não está conectada. */
export function RegisterPostsDialog({ page, onClose, onDone }: { page: FbPage; onClose: () => void; onDone: () => Promise<void> }) {
  const [kind, setKind] = useState<"texto" | "imagem" | "video">("imagem");
  const [count, setCount] = useState("1");
  const save = async () => {
    try { const r = await fb.manualPosts(page.id, kind, Number(count) || 1); toast.success(`${r.registrados} ${r.registrados === 1 ? "post registrado" : "posts registrados"}`); onClose(); await onDone(); }
    catch (problem) { toast.error((problem as Error).message); }
  };
  return (
    <Modal open onClose={onClose} title={`Registrar posts, ${page.name}`} description="Para posts que você fez direto no Facebook. Com a página conectada isso é lido sozinho.">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block space-y-1.5"><span className="text-xs font-medium text-white/80">Tipo</span>
          <select className={field} value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
            <option value="imagem">Post com imagem</option><option value="texto">Post só com texto</option><option value="video">Vídeo</option>
          </select></label>
        <label className="block space-y-1.5"><span className="text-xs font-medium text-white/80">Quantos</span>
          <input className={field} inputMode="numeric" value={count} maxLength={3} onChange={(e) => setCount(e.target.value.replace(/\D/g, ""))} /></label>
      </div>
      <div className="flex justify-end"><button type="button" className={primary} disabled={!Number(count)} onClick={() => void save()}>Registrar</button></div>
    </Modal>
  );
}
