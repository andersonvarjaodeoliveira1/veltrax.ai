import { expect, it } from "vitest";
import { ctaFor, ctaSuffix, defaultKeyword, keywordsFor, translateKeyword } from "./clone-language";

it("as palavras de exemplo seguem o idioma escolhido", () => {
  expect(keywordsFor("pt-BR").slice(0, 4)).toEqual(["QUERO", "EU QUERO", "LINK", "INFO"]);
  expect(keywordsFor("en")).toContain("I WANT");
  expect(defaultKeyword("es")).toBe("QUIERO");
  expect(defaultKeyword("idioma-estranho")).toBe("QUERO");
});

it("troca só palavra de exemplo ao mudar de idioma", () => {
  expect(translateKeyword("QUERO", "pt-BR", "en")).toBe("I WANT");
  expect(translateKeyword("link", "pt-BR", "de")).toBe("LINK");
  expect(translateKeyword("MINHAMARCA", "pt-BR", "en")).toBe("MINHAMARCA");
});

it("as chamadas prontas saem no idioma", () => {
  expect(ctaFor("en", "link")).toContain("Comment {KEYWORD}");
  expect(ctaFor("fr", "whats")).toContain("WhatsApp");
  expect(ctaSuffix("it")).toContain("{KEYWORD}");
});
