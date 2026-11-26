import type { MetadataRoute } from "next";

import { AI_AGENT_TOKENS } from "@/lib/ai-agents";

export const LEGAL_PAGES = ["/privacy", "/terms", "/data-deletion"];

/** Ferramenta privada: nada deve ser indexado nem copiado por rastreadores, fora os textos legais. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      // Os textos legais ficam abertos: a Meta confere a política de privacidade e a exclusão de dados do app
      // com o robô dela (facebookexternalhit) e recusa o endereço se o robots.txt proibir.
      { userAgent: "*", allow: LEGAL_PAGES, disallow: "/" },
      { userAgent: ["facebookexternalhit", "meta-externalfetcher"], allow: LEGAL_PAGES, disallow: "/" },
      // Robôs e agentes de IA: proibidos em tudo, inclusive nos textos legais.
      { userAgent: [...AI_AGENT_TOKENS], disallow: "/" },
    ],
  };
}
