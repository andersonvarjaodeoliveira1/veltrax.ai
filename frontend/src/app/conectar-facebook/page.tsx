"use client";

import { Download } from "lucide-react";
import { FacebookConnectCard } from "@/components/app/facebook-connect-card";
import { PageHeader } from "@/components/app/page-header";

function FacebookIcon({ className }: { className?: string }) {
  return <span aria-hidden className={className}>f</span>;
}

export default function ConnectFacebookPage() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-4 sm:p-8">
      <PageHeader icon={FacebookIcon as never} title="Conectar ao Facebook" description={<>Salve as suas páginas uma vez. Depois, cada vídeo pronto pode ser publicado na página escolhida, com a legenda feita pela IA.</>} />
      <FacebookConnectCard />
      <section className="space-y-2 rounded-[18px] border border-border bg-card p-5 text-sm">
        <p className="font-medium">Ainda não tem a extensão?</p>
        <p className="text-xs text-muted-foreground">É ela que lê o seu login do Facebook neste Chrome e publica por você. Use a versão 1.2.0 ou mais nova.</p>
        <a href="/extensao/clipgringa-flow.zip" download className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm hover:text-foreground"><Download className="size-4" /> Baixar a extensão</a>
        <p className="text-xs text-muted-foreground">Descompacte, abra <span className="font-mono">chrome://extensions</span>, ligue o “Modo do desenvolvedor” e use “Carregar sem compactação” na pasta <span className="font-mono">flow</span>.</p>
      </section>
    </div>
  );
}
