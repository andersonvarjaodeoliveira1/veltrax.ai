"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ExternalLink, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Page = { name: string; url: string };
type Status = { loggedIn: boolean; pages: Page[]; version: string } | "none" | null;

/** Mostra se o Facebook está conectado na extensão e quais páginas já foram salvas. */
export function FacebookConnectCard() {
  const [status, setStatus] = useState<Status>(null);
  const answered = useRef(false);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const d = event.data;
      if ((event.origin && event.origin !== window.location.origin) || !d || d.source !== "clipgringa-flow" || d.type !== "fb-status") return;
      answered.current = true;
      setStatus({ loggedIn: d.loggedIn === true, pages: Array.isArray(d.pages) ? d.pages : [], version: String(d.version || "") });
    };
    const ask = () => window.postMessage({ source: "clipgringa-page", type: "fb-status?" }, window.location.origin);
    window.addEventListener("message", onMessage);
    ask();
    const wait = window.setTimeout(() => { if (!answered.current) setStatus("none"); }, 2500);
    const timer = window.setInterval(ask, 5000);
    return () => { window.removeEventListener("message", onMessage); window.clearTimeout(wait); window.clearInterval(timer); };
  }, []);

  const ok = status && status !== "none" && status.loggedIn;
  const pages = status && status !== "none" ? status.pages : [];
  return (
    <section className="space-y-3 rounded-[18px] border border-border bg-card p-5" data-testid="step-facebook">
      <p className="flex items-center gap-2 font-medium">
        <span className="grid size-6 place-items-center rounded-full bg-[#7B3FE4]/25 text-xs">{ok && pages.length > 0 ? <Check className="size-3.5 text-[#5BD69A]" /> : "f"}</span>
        Facebook <span className="rounded-full bg-[#7B3FE4] px-2 py-0.5 text-[10px] font-semibold text-white">BETA</span>
      </p>
      <p className="text-xs text-muted-foreground">Para publicar os vídeos prontos na sua página. Usa o login do Facebook que você já tem neste Chrome. Nenhuma senha passa pelo ClipGringa.</p>
      <p className={cn("text-sm", ok ? "text-[#5BD69A]" : "text-muted-foreground")} data-testid="fb-state">
        {status === null && "Verificando…"}
        {status === "none" && "Extensão não encontrada. Instale a versão 1.1.0 ou mais nova (passo acima) e recarregue esta página."}
        {status && status !== "none" && !status.loggedIn && "Facebook ainda não conectado: abra o Facebook neste Chrome e entre na sua conta."}
        {ok && (pages.length > 0 ? `Facebook conectado · ${pages.length} ${pages.length === 1 ? "página salva" : "páginas salvas"}` : "Facebook conectado. Falta salvar a sua página.")}
      </p>
      <a href="https://www.facebook.com/pages/?category=your_pages" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm hover:text-foreground">
        <ExternalLink className="size-4" /> Abrir o Facebook e escolher a página
      </a>
      <p className="text-xs text-muted-foreground">Na sua página, clique no botão roxo <b>“Salvar esta página no ClipGringa”</b> que a extensão mostra no canto da tela. Pode salvar várias páginas.</p>
      {pages.length > 0 && (
        <ul className="space-y-1.5">
          {pages.map((page) => (
            <li key={page.url} className="flex items-center gap-2 rounded-[12px] bg-muted/40 px-3 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate">{page.name}</span>
              <button type="button" aria-label={`Remover ${page.name}`} onClick={() => window.postMessage({ source: "clipgringa-page", type: "fb-remove-page", url: page.url }, window.location.origin)} className="text-muted-foreground hover:text-foreground"><Trash2 className="size-4" /></button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
