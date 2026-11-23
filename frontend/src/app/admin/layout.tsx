import { AdminGate } from "@/components/app/admin-gate";
import { AdminTabs } from "@/components/admin/admin-tabs";
import { RequireSession } from "@/components/app/require-session";
import { AppShell } from "@/components/app/app-shell";
import { noIndexMetadata } from "@/lib/seo";

export const metadata = noIndexMetadata;

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <RequireSession><AppShell>
      <AdminGate><AdminTabs />{children}</AdminGate>
    </AppShell></RequireSession>;
}
