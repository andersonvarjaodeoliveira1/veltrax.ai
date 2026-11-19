import type { Metadata } from "next";

import { GtAuthFrame } from "@/components/auth/gt-auth-frame";
import { SignupCapture } from "@/components/auth/signup-capture";
import { noIndexFollowMetadata } from "@/lib/seo";

export const metadata: Metadata = { ...noIndexFollowMetadata, title: "Criar acesso" };

// Captura antes do cadastro: nome, e-mail, CPF e telefone. A conta nasce aguardando a liberação do suporte.
export default function CriarAcessoPage() {
  return <GtAuthFrame><SignupCapture /></GtAuthFrame>;
}
