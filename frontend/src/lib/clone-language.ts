// Palavras de exemplo (comentário que dispara a automação) e chamadas prontas, no idioma em que a pessoa fala no vídeo.
const KEYWORDS: Record<string, string[]> = {
  "pt-BR": ["QUERO", "EU QUERO", "LINK", "INFO", "GUIA", "AULA"],
  en: ["I WANT", "LINK", "SEND IT", "INFO", "GUIDE", "CLASS"],
  es: ["QUIERO", "YO QUIERO", "LINK", "INFO", "GUÍA", "CLASE"],
  fr: ["JE VEUX", "LIEN", "ENVOIE", "INFO", "GUIDE", "COURS"],
  de: ["ICH WILL", "SCHICK", "LINK", "INFO", "GUIDE", "KURS"],
  it: ["VOGLIO", "IO VOGLIO", "LINK", "INFO", "GUIDA", "CORSO"],
};

type CtaKind = "link" | "material" | "whats";
const CTAS: Record<string, Record<CtaKind, string>> = {
  "pt-BR": { link: "Comente {KEYWORD} que eu te envio o link no direct", material: "Comente {KEYWORD} e receba o material grátis", whats: "Comente {KEYWORD} e eu te chamo no WhatsApp" },
  en: { link: "Comment {KEYWORD} and I'll send you the link in your DMs", material: "Comment {KEYWORD} and get the free material", whats: "Comment {KEYWORD} and I'll message you on WhatsApp" },
  es: { link: "Comenta {KEYWORD} y te envío el enlace por mensaje directo", material: "Comenta {KEYWORD} y recibe el material gratis", whats: "Comenta {KEYWORD} y te escribo por WhatsApp" },
  fr: { link: "Commente {KEYWORD} et je t'envoie le lien en message privé", material: "Commente {KEYWORD} et reçois le contenu gratuit", whats: "Commente {KEYWORD} et je t'écris sur WhatsApp" },
  de: { link: "Kommentiere {KEYWORD} und ich schicke dir den Link per Direktnachricht", material: "Kommentiere {KEYWORD} und erhalte das kostenlose Material", whats: "Kommentiere {KEYWORD} und ich schreibe dir auf WhatsApp" },
  it: { link: "Scrivi {KEYWORD} e ti mando il link in privato", material: "Scrivi {KEYWORD} e ricevi il materiale gratuito", whats: "Scrivi {KEYWORD} e ti scrivo su WhatsApp" },
};
const SUFFIX: Record<string, string> = { "pt-BR": "Comente {KEYWORD} para receber", en: "Comment {KEYWORD} to receive it", es: "Comenta {KEYWORD} para recibirlo", fr: "Commente {KEYWORD} pour le recevoir", de: "Kommentiere {KEYWORD}, um es zu bekommen", it: "Scrivi {KEYWORD} per riceverlo" };

const lang = (code: string | undefined) => (code && KEYWORDS[code] ? code : "pt-BR");

export const keywordsFor = (code: string | undefined) => KEYWORDS[lang(code)];
export const defaultKeyword = (code: string | undefined) => KEYWORDS[lang(code)][0];
export const ctaFor = (code: string | undefined, kind: CtaKind) => CTAS[lang(code)][kind];
export const ctaSuffix = (code: string | undefined) => SUFFIX[lang(code)];

/** Troca a palavra-chave pela equivalente do novo idioma, só quando ela ainda é uma das de exemplo (nunca mexe numa palavra que a pessoa escreveu). */
export function translateKeyword(keyword: string, from: string | undefined, to: string | undefined): string {
  const index = KEYWORDS[lang(from)].indexOf(keyword.trim().toUpperCase());
  return index === -1 ? keyword : KEYWORDS[lang(to)][index];
}
