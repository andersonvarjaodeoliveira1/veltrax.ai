export const SITE_NAME = "ClipGringa";
export const DEFAULT_SITE_URL =
  process.env.NEXT_PUBLIC_APP_URL || "https://clipgringa.gringatools.com";
export const HOSTED_APP_URL = DEFAULT_SITE_URL;

/**
 * Link público do código-fonte. A licença AGPL-3.0 exige oferecer o código
 * (com as nossas alterações) a quem usa o serviço pela rede.
 * Defina NEXT_PUBLIC_SOURCE_URL com o repositório público do ClipGringa.
 */
export const GITHUB_URL =
  process.env.NEXT_PUBLIC_SOURCE_URL || "https://github.com/gringatools/clipgringa";

export function getSiteUrl() {
  try {
    return new URL(process.env.NEXT_PUBLIC_APP_URL || DEFAULT_SITE_URL).origin;
  } catch {
    return DEFAULT_SITE_URL;
  }
}
