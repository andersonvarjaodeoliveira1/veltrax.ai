import { RequireSession } from "@/components/app/require-session";
import { FeatureIntro } from "@/components/app/feature-intro";
import { noIndexMetadata } from "@/lib/seo";

export const metadata = noIndexMetadata;

export default function InfluencerLayout({ children }: { children: React.ReactNode }) {
  return <RequireSession><FeatureIntro image="/funil/avatar.jpg" title="Criar avatar (influencer)" tagline="Crie o seu influencer de IA e os vídeos dele, só conversando." steps={["Conferindo a sua conta", "Carregando as suas skills", "Abrindo o chat do avatar"]}>{children}</FeatureIntro></RequireSession>;
}
