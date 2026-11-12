"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { fb, metaCallbackUrl, type MapResult, type MetaStatus } from "@/lib/facebook";
import { cn } from "@/lib/utils";
import { card, Modal, primary, secondary } from "./ui";

/** Leva a pessoa para o login do Facebook; ela autoriza e volta para /facebook/meta com tudo mapeado. */
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

export function mapSummary(r: MapResult): string {
  const parts = [
    r.novas.length ? `${r.novas.length} ${r.novas.length === 1 ? "página nova" : "páginas novas"}` : "",
    r.conectadas.length ? `${r.conectadas.length} ${r.conectadas.length === 1 ? "atualizada" : "atualizadas"}` : "",
    r.expirados?.length ? `entre de novo com ${r.expirados.join(" e ")}` : "",
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : "Tudo em dia";
}

/** Faixa do Facebook: entrar com um clique, ver os perfis conectados e atualizar tudo. */
export function MetaCard({ onChange }: { onChange: () => Promise<void> }) {
  const { status, reload } = useMetaStatus();
  const [setup, setSetup] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!status) return null;
  const sync = async () => {
    setBusy(true);
    try { toast.success(mapSummary(await fb.metaSync())); await Promise.all([reload(), onChange()]); }
    catch (problem) { toast.error((problem as Error).message); } finally { setBusy(false); }
  };
  const forget = async (id: string, name: string) => {
    try { await fb.metaForget(id); toast.success(`Login de ${name} esquecido. As páginas continuam conectadas.`); await reload(); }
    catch (problem) { toast.error((problem as Error).message); }
  };
  const has = status.profiles.length > 0;
  return (
    <div className={cn(card, "space-y-3")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-white">{has ? "Facebook conectado" : "Conecte o Facebook"}</p>
          <p className="text-xs text-white/60">{has ? "Perfis, páginas, números e comentários são atualizados sozinhos a cada 6 horas." : "Entre uma vez. O perfil e todas as páginas dele aparecem aqui, já prontos para postar."}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {has ? <button type="button" className={secondary} disabled={busy} onClick={() => void sync()}>{busy ? "Atualizando…" : "Atualizar agora"}</button> : null}
          {status.configured
            ? <button type="button" className={has ? secondary : primary} onClick={() => void goToFacebookLogin()}>{has ? "Conectar outro perfil" : "Entrar com o Facebook"}</button>
            : <button type="button" className={secondary} onClick={() => setSetup(true)}>Ativar o Entrar com o Facebook</button>}
        </div>
      </div>
      {has ? (
        <ul className="flex flex-wrap gap-1.5">
          {status.profiles.map((p) => (
            <li key={p.id} className="flex items-center gap-2 rounded-[8px] bg-white/[0.06] px-2.5 py-1.5 text-xs text-white">
              {p.name}<span className="text-white/50">{p.pages} {p.pages === 1 ? "página" : "páginas"}</span>
              <button type="button" className="text-white/40 hover:text-white" aria-label={`Esquecer o login de ${p.name}`} onClick={() => void forget(p.id, p.name)}>Sair</button>
            </li>
          ))}
        </ul>
      ) : null}
      {has && status.configured ? <p className="text-xs text-white/50">Para outro perfil, abra o ClipGringa no navegador onde esse perfil está logado e clique em Conectar outro perfil.</p> : null}
      {setup ? <MetaSetupDialog onClose={() => setSetup(false)} /> : null}
    </div>
  );
}

/** Uma vez só, pelo administrador: criar o app da Meta e colar o ID e a chave em Admin. */
export function MetaSetupDialog({ onClose }: { onClose: () => void }) {
  const [url, setUrl] = useState("");
  useEffect(() => { setUrl(metaCallbackUrl()); }, []);
  const copy = () => { void navigator.clipboard.writeText(url).then(() => toast.success("Endereço copiado")); };
  return (
    <Modal open onClose={onClose} title="Ativar o Entrar com o Facebook" description="Feito uma vez pelo administrador. Depois, cada pessoa só clica em Entrar com o Facebook.">
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
      <p className="text-xs text-white/50">Com o app em modo de desenvolvimento, só quem tem função no app consegue entrar. Para liberar a todos os membros, o app precisa passar pela análise da Meta.</p>
      <div className="flex justify-end"><button type="button" className={primary} onClick={onClose}>Entendi</button></div>
    </Modal>
  );
}
