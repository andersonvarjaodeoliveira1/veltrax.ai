import { AppShell } from "@/components/app/app-shell";
import { RequireSession } from "@/components/app/require-session";
import { noIndexMetadata } from "@/lib/seo";

export const metadata = noIndexMetadata;

// EM CONSTRUÇÃO, aberto a todos os membros. O que é só de administrador (navegador de perfis e proxy)
// é decidido pelo backend, que devolve "advanced" na visão geral.
export default function FacebookLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireSession>
      <AppShell>{children}</AppShell>
    </RequireSession>
  );
}
