"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { fb, metaCallbackUrl, type MetaPage, type MetaStatus } from "@/lib/facebook";
import { cn } from "@/lib/utils";
import { card, Modal, primary, secondary } from "./ui";

/** Leva a pessoa para o login do Facebook; ela autoriza as páginas e volta para /facebook/meta. */
export async function goToFacebookLogin() {
  try { window.location.href = (await fb.metaStart()).url; }
  catch (problem) { toast.error((problem as Error).message); }
}

export function useMetaStatus() {
  const [status, setStatus] = useState<MetaStatus | null>(null);
  const reload = useCallback(async () => { try { setStatus(await fb.metaStatus()); } catch { setStatus(null); } }, []);
  useEffect(() => { void reload(); }, [reload]);
  return { status, reload };
}

/** Faixa no topo da aba Páginas: entrar com o Facebook ou trazer as páginas dele. */
export function MetaCard({ onChange }: { onChange: () => Promise<void> }) {
  const { status, reload } = useMetaStatus();
  const [picking, setPicking] = useState(false);
  const [setup, setSetup] = useState(false);
  if (!status) return null;
  const logout = async () => {
    try { await fb.metaLogout(); toast.success("Login do Facebook esquecido. As páginas conectadas continuam postando."); await reload(); }
    catch (problem) { toast.error((problem as Error).message); }
  };
  return (
    <div className={cn(card, "flex flex-wrap items-center justify-between gap-3")}>
      <div className="min-w-0">
        <p className="text-sm font-medium text-white">{status.connected ? `Facebook conectado, ${status.name}` : "Conecte o Facebook"}</p>
        <p className="text-xs text-white/60">{status.connected ? "As páginas que você trouxer postam sozinhas no horário." : "Entre uma vez e escolha as páginas. Não precisa copiar token."}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {status.connected ? (
          <>
            <button type="button" className={primary} onClick={() => setPicking(true)}>Trazer páginas do Facebook</button>
            <button type="button" className={secondary} onClick={() => void goToFacebookLogin()}>Entrar de novo</button>
            <button type="button" className="text-xs text-white/50 hover:text-white" onClick={() => void logout()}>Sair</button>
          </>
        ) : status.configured ? (
          <button type="button" className={primary} onClick={() => void goToFacebookLogin()}>Entrar com o Facebook</button>
        ) : (
          <button type="button" className={secondary} onClick={() => setSetup(true)}>Ativar o Entrar com o Facebook</button>
        )}
      </div>
      {picking ? <MetaPagesDialog onClose={() => setPicking(false)} onDone={onChange} /> : null}
      {setup ? <MetaSetupDialog onClose={() => setSetup(false)} /> : null}
    </div>
  );
}

export function MetaPagesDialog({ onClose, onDone }: { onClose: () => void; onDone: () => Promise<void> }) {
  const [pages, setPages] = useState<MetaPage[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => { fb.metaPages().then(setPages).catch((problem) => { toast.error((problem as Error).message); setPages([]); }); }, []);
  const bring = async (p: MetaPage) => {
    setBusy(p.id);
    try {
      const r = await fb.metaLink(p.id);
      setPages((list) => (list ?? []).map((x) => (x.id === p.id ? { ...x, page_id: r.page_id } : x)));
      toast.success(`${r.name} conectada`); await onDone();
    } catch (problem) { toast.error((problem as Error).message); } finally { setBusy(null); }
  };
  return (
    <Modal open onClose={onClose} title="Páginas do seu Facebook" description="Escolha as páginas que o ClipGringa vai cuidar. Cada uma entra já conectada para postar.">
      {pages === null ? <p className="text-sm text-white/60">Carregando…</p> : pages.length === 0 ? <p className="text-sm text-white/70">Nenhuma página apareceu. Entre de novo e marque as páginas na tela do Facebook.</p> : (
        <ul className="max-h-[55dvh] space-y-1.5 overflow-y-auto pr-1">
          {pages.map((p) => (
            <li key={p.id} className="flex items-center gap-3 rounded-[12px] border border-white/10 px-3 py-2.5">
              <span className="min-w-0 flex-1 truncate text-sm text-white">{p.name}</span>
              {p.page_id ? <span className="text-xs text-white/50">Já conectada</span>
                : !p.can_post ? <span className="text-xs text-white/50">Sem permissão para postar</span>
                : <button type="button" className={secondary} disabled={busy === p.id} onClick={() => void bring(p)}>{busy === p.id ? "Conectando…" : "Trazer"}</button>}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

/** Uma vez só, pelo administrador: criar o app da Meta e colar o ID e a chave em Admin. */
export function MetaSetupDialog({ onClose }: { onClose: () => void }) {
  const [url, setUrl] = useState("");
  useEffect(() => { setUrl(metaCallbackUrl()); }, []);
  const copy = () => { void navigator.clipboard.writeText(url).then(() => toast.success("Endereço copiado")); };
  return (
    <Modal open onClose={onClose} title="Ativar o Entrar com o Facebook" description="Feito uma vez, serve para todas as páginas. Depois é só clicar em Entrar com o Facebook.">
      <ol className="list-decimal space-y-2.5 pl-4 text-sm text-white/80">
        <li>Abra <a className="underline" href="https://developers.facebook.com/apps/creation/" target="_blank" rel="noopener noreferrer">developers.facebook.com</a> e crie um app. No caso de uso, escolha gerenciar tudo na sua página.</li>
        <li>Adicione o produto Login do Facebook e, em Configurações, cole este endereço em URIs de redirecionamento do OAuth válidos:
          <span className="mt-1.5 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-[6px] bg-black/30 px-2 py-1.5 text-xs text-white">{url}</code>
            <button type="button" className={secondary} onClick={copy}>Copiar</button>
          </span>
        </li>
        <li>Em Configurações do app, Básico, copie o ID do app e a Chave secreta.</li>
        <li>Cole os dois em <Link className="underline" href="/admin">Admin</Link>, Configurações do sistema, nos campos do app da Meta, e salve.</li>
      </ol>
      <p className="text-xs text-white/50">Enquanto o app estiver em modo de desenvolvimento, só quem é administrador do app consegue entrar. Para você, isso basta.</p>
      <div className="flex justify-end"><button type="button" className={primary} onClick={onClose}>Entendi</button></div>
    </Modal>
  );
}
