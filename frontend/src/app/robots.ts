import type { MetadataRoute } from "next";

/** Ferramenta privada: nada deve ser indexado nem copiado por rastreadores. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", disallow: "/" }],
  };
}
