import { RequireSession } from "@/components/app/require-session";
import { AppShell } from "@/components/app/app-shell";
import { noIndexMetadata } from "@/lib/seo";

export const metadata = noIndexMetadata;

export default function AutomationLayout({ children }: { children: React.ReactNode }) {
  return <RequireSession><AppShell>{children}</AppShell></RequireSession>;
}
