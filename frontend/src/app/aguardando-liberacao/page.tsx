import type { Metadata } from "next";
import Link from "next/link";

import { GtAuthFrame } from "@/components/auth/gt-auth-frame";
import { SUPPORT_WHATSAPP_LABEL, SUPPORT_WHATSAPP_URL } from "@/lib/cadastro";
import { noIndexFollowMetadata } from "@/lib/seo";

export const metadata: Metadata = { ...noIndexFollowMetadata, title: "Aguardando liberação" };

// Quem criou a conta pela captura fica aqui até o suporte liberar o acesso.
export default async function AguardandoLiberacaoPage({ searchParams }: { searchParams: Promise<{ novo?: string }> }) {
  const novo = (await searchParams).novo === "1";
  return (
    <GtAuthFrame>
      <div className="w-full">
        <h1 className="text-[40px] font-bold leading-tight tracking-tight text-[#0F172A]">Aguardando liberação</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-[#525252]">
          {novo ? "Conta criada. " : ""}O seu cadastro está aguardando a liberação do suporte. Assim que for liberado, você recebe um e-mail e já pode entrar com o e-mail e a senha que criou.
        </p>
        <div className="mt-8 rounded-lg bg-[#F4F4F6] p-5">
          <p className="text-sm font-medium text-[#171717]">Precisa falar com o suporte?</p>
          <p className="mt-1 text-sm text-[#525252]">WhatsApp {SUPPORT_WHATSAPP_LABEL}</p>
          <a href={SUPPORT_WHATSAPP_URL} target="_blank" rel="noopener noreferrer"
            className="mt-4 inline-flex h-12 items-center rounded-md bg-[#7B3FE4] px-6 text-[15px] font-semibold text-white transition-colors hover:bg-[#6A32CC]">
            Chamar o suporte no WhatsApp
          </a>
        </div>
        <p className="mt-8 text-sm text-[#525252]">Já foi liberado? <Link href="/sign-in" className="font-medium text-[#7B3FE4] underline-offset-2 hover:underline">Entrar</Link></p>
      </div>
    </GtAuthFrame>
  );
}
