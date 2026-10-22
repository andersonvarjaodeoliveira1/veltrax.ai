import { redirect } from "next/navigation";

import { getServerSession } from "@/server/session";

/**
 * Trava no servidor: quem não está logado (ex.: janela anônima) nunca recebe a tela do app,
 * vai direto para o login. Os dados já são protegidos pelas rotas de API; isto fecha a tela também.
 */
export async function RequireSession({ children }: { children: React.ReactNode }) {
  const session = await getServerSession();
  if (!session?.user?.id) redirect("/sign-in");
  return <>{children}</>;
}
