import { AdminGate } from "@/components/app/admin-gate";
import { AppShell } from "@/components/app/app-shell";
import { noIndexMetadata } from "@/lib/seo";

export const metadata = noIndexMetadata;

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>
      <AdminGate>{children}</AdminGate>
    </AppShell>;
}
