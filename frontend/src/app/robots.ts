import type { MetadataRoute } from "next";

/** Ferramenta privada: nada deve ser indexado nem copiado por rastreadores. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", disallow: "/" },
      { userAgent: ["GPTBot", "ChatGPT-User", "OAI-SearchBot", "ClaudeBot", "Claude-User", "Claude-SearchBot", "anthropic-ai", "PerplexityBot", "Perplexity-User", "CCBot", "Google-Extended", "Applebot-Extended", "Bytespider", "Amazonbot", "Meta-ExternalAgent", "cohere-ai", "Diffbot"], disallow: "/" },
    ],
  };
}
