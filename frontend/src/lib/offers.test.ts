import { describe, expect, it } from "vitest";
import { coherenceNotice } from "./offers";

describe("aviso de coerência entre o anúncio e a página", () => {
  it("diz a situação em uma palavra e uma frase", () => {
    expect(coherenceNotice({ level: "alinhado", title: "Jogo de Lençol", shared: ["lençol"], only_page: ["queen"] })).toEqual({
      tone: "good", label: "Alinhado", text: "A página fala do mesmo assunto do anúncio.",
      details: ["Título da página: Jogo de Lençol", "Em comum com o anúncio: lençol"],
    });
    expect(coherenceNotice({ level: "diferente", title: "Curso de inglês", shared: [], only_page: ["curso", "inglês"] })).toMatchObject({
      tone: "bad", label: "Diferente", details: ["Título da página: Curso de inglês", "Só na página: curso, inglês"],
    });
  });

  it("explica quando não deu para comparar", () => {
    expect(coherenceNotice({ level: "sem_link" })).toMatchObject({ tone: "neutral", label: "Sem link" });
    expect(coherenceNotice({ level: "sem_titulo", url: "https://x.com" })).toMatchObject({ tone: "neutral", label: "Sem título" });
    expect(coherenceNotice({ level: "nao_abriu", reason: "http" }).text).toContain("https");
    expect(coherenceNotice({ level: "nao_abriu", reason: "status" }).text).toContain("Não consegui abrir a página do link");
  });
});
