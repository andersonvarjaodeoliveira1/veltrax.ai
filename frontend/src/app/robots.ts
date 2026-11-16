import type { MetadataRoute } from "next";

export const LEGAL_PAGES = ["/privacy", "/terms", "/data-deletion"];

/** Ferramenta privada: nada deve ser indexado nem copiado por rastreadores, fora os textos legais. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      // Os textos legais ficam abertos: a Meta confere a política de privacidade e a exclusão de dados do app
      // com o robô dela (facebookexternalhit) e recusa o endereço se o robots.txt proibir.
      { userAgent: "*", allow: LEGAL_PAGES, disallow: "/" },
      { userAgent: ["facebookexternalhit", "meta-externalfetcher"], allow: LEGAL_PAGES, disallow: "/" },
      { userAgent: ["GPTBot", "ChatGPT-User", "OAI-SearchBot", "ClaudeBot", "Claude-User", "Claude-SearchBot", "anthropic-ai", "PerplexityBot", "Perplexity-User", "CCBot", "Google-Extended", "Applebot-Extended", "Bytespider", "Amazonbot", "Meta-ExternalAgent", "cohere-ai", "Diffbot"], disallow: "/" },
    ],
  };
}
