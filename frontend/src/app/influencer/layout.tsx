import { RequireSession } from "@/components/app/require-session";
import { noIndexMetadata } from "@/lib/seo";

export const metadata = noIndexMetadata;

export default function InfluencerLayout({ children }: { children: React.ReactNode }) {
  return <RequireSession>{children}</RequireSession>;
}
