import { RequireSession } from "@/components/app/require-session";
import { AppShell } from "@/components/app/app-shell";
import { noIndexMetadata } from "@/lib/seo";

export const metadata = noIndexMetadata;

export default function InfluencerLayout({ children }: { children: React.ReactNode }) {
  return <RequireSession><AppShell>{children}</AppShell></RequireSession>;
}
