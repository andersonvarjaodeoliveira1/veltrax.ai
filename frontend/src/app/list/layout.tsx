import { RequireSession } from "@/components/app/require-session";
import { AppShell } from "@/components/app/app-shell";
import { FeatureIntro } from "@/components/app/feature-intro";
import { noIndexMetadata } from "@/lib/seo";

export const metadata = noIndexMetadata;

export default function ListLayout({ children }: { children: React.ReactNode }) {
  return <RequireSession><FeatureIntro image="/funil/cortes.jpg" title="Cortes para TikTok" tagline="Transforme vídeos longos em cortes prontos para viralizar." steps={["Conferindo a sua conta", "Buscando os seus cortes", "Abrindo a biblioteca"]}><AppShell>{children}</AppShell></FeatureIntro></RequireSession>;
}
