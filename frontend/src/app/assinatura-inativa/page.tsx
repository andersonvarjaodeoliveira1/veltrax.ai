import type { Metadata } from "next";
import Link from "next/link";

import { GtAuthFrame } from "@/components/auth/gt-auth-frame";
import { FEEDBACK_WHATSAPP_URL } from "@/lib/acesso";
import { SUPPORT_WHATSAPP_LABEL } from "@/lib/cadastro";
import { noIndexFollowMetadata } from "@/lib/seo";

export const metadata: Metadata = { ...noIndexFollowMetadata, title: "Assinatura inativa" };

// Quem entrou como assinante da Gringatools e cancelou, pediu reembolso ou deixou vencer cai aqui.
export default function AssinaturaInativaPage() {
  return (
    <GtAuthFrame>
      <div className="w-full">
        <h1 className="text-[40px] font-bold leading-tight tracking-tight text-[#0F172A]">Assinatura inativa</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-[#525252]">
          O ClipGringa é um bônus para quem está com a assinatura da Gringatools ativa, e não encontramos uma assinatura ativa neste e-mail.
          Quando a assinatura voltar a ficar ativa, é só pedir o link de entrada de novo.
        </p>
        <div className="mt-8 rounded-lg bg-[#F4F4F6] p-5">
          <p className="text-sm font-medium text-[#171717]">Acha que é engano?</p>
          <p className="mt-1 text-sm text-[#525252]">WhatsApp {SUPPORT_WHATSAPP_LABEL}</p>
          <a href={FEEDBACK_WHATSAPP_URL} target="_blank" rel="noopener noreferrer"
            className="mt-4 inline-flex h-12 items-center rounded-md bg-[#7B3FE4] px-6 text-[15px] font-semibold text-white transition-colors hover:bg-[#6A32CC]">
            Chamar o suporte no WhatsApp
          </a>
        </div>
        <p className="mt-8 text-sm text-[#525252]">
          Não é assinante? <Link href="/criar-acesso" className="font-medium text-[#7B3FE4] underline-offset-2 hover:underline">Criar acesso</Link>
          <span className="mx-2 text-[#A1A1AA]">|</span>
          <Link href="/sign-in" className="font-medium text-[#7B3FE4] underline-offset-2 hover:underline">Voltar para a entrada</Link>
        </p>
      </div>
    </GtAuthFrame>
  );
}
