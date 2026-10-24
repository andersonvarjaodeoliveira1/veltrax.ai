import { RequireSession } from "@/components/app/require-session";
import { AppShell } from "@/components/app/app-shell";
import { FeatureIntro } from "@/components/app/feature-intro";
import { noIndexMetadata } from "@/lib/seo";

export const metadata = noIndexMetadata;

export default function AutomationLayout({ children }: { children: React.ReactNode }) {
  return <RequireSession><FeatureIntro image="/funil/automacao.jpg" title="Modelar vídeo orgânico" tagline="Copie um viral e refaça com o seu produto e o seu avatar." steps={["Conferindo a sua conta", "Preparando o modelo do vídeo", "Abrindo a automação"]}><AppShell>{children}</AppShell></FeatureIntro></RequireSession>;
}
