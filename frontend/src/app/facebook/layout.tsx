import { AppShell } from "@/components/app/app-shell";
import { RequireSession } from "@/components/app/require-session";
import { noIndexMetadata } from "@/lib/seo";
import { getServerSession } from "@/server/session";

export const metadata = noIndexMetadata;

// EM CONSTRUÇÃO: só administradores entram. Os demais veem um aviso e nada é carregado.
export default async function FacebookLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession();
  const admin = Boolean((session?.user as { is_admin?: boolean } | undefined)?.is_admin);
  return (
    <RequireSession>
      <AppShell>
        {admin ? children : (
          <div className="mx-auto w-full max-w-xl p-8">
            <p className="rounded-[18px] border border-white/10 bg-[#1a191d] p-5 text-sm text-white/80">Esta área está sendo construída e ainda não está disponível.</p>
          </div>
        )}
      </AppShell>
    </RequireSession>
  );
}
