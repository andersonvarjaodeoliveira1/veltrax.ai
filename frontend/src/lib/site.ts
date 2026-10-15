export const SITE_NAME = "ClipGringa";
export const DEFAULT_SITE_URL =
  process.env.NEXT_PUBLIC_APP_URL || "https://clipgringa.gringatools.com";
export const HOSTED_APP_URL = DEFAULT_SITE_URL;


export function getSiteUrl() {
  try {
    return new URL(process.env.NEXT_PUBLIC_APP_URL || DEFAULT_SITE_URL).origin;
  } catch {
    return DEFAULT_SITE_URL;
  }
}

/** Nome exibido no painel (instalação de conta única). */
export const DISPLAY_NAME = "GRINGATOOLS";
