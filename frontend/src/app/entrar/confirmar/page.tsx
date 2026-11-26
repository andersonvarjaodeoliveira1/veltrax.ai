import type { Metadata } from "next";

import { ConfirmLogin } from "@/components/auth/confirm-login";
import { GtAuthFrame } from "@/components/auth/gt-auth-frame";
import { noIndexFollowMetadata } from "@/lib/seo";

export const metadata: Metadata = { ...noIndexFollowMetadata, title: "Entrar no ClipGringa", referrer: "no-referrer" };

// Destino do link de entrada enviado por e-mail. A entrada só acontece quando a pessoa aperta o botão.
export default async function ConfirmarEntradaPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const token = (await searchParams).token ?? "";
  return (
    <GtAuthFrame>
      <ConfirmLogin token={token} />
    </GtAuthFrame>
  );
}
