import { describe, expect, it } from "vitest";

import type { Creative } from "@/lib/clipspy";
import { CSV_HEADER, exportFileName, referencesCsv, referencesSummary, structureLine } from "@/lib/clipspy-export";

const base: Creative = { id: "1", source: "manual", external_id: "x", advertiser: "Body Explained", title: "Three signs\nyou need water", permalink: "https://www.facebook.com/55/posts/1",
  thumbnail: "", metrics: {}, score: 0, is_champion: true, term: "", status: "salvo" };
const modeled: Creative = { ...base, metrics: { views: 224000, comments: 60, hook: "Pergunta direta", feeling: "Curiosidade", cta: "Comente AGUA", note: "Fala olhando para a câmera",
  recipe: { beats: [{ beat_role: "hook", weight: 0.1 }, { beat_role: "problema", weight: 0.4 }, { beat_role: "cta", weight: 0.2 }], summary: "Abre com pergunta e fecha pedindo comentário." } } };
const ad: Creative = { ...base, id: "2", source: "meta_adlib", advertiser: "Loja; do \"Zé\"", title: "=SOMA(A1:A9) oferta", is_champion: false, term: "emagrecimento", metrics: { run_days: 42 } };

describe("exportar a biblioteca do ClipSpy", () => {
  it("escreve a estrutura do vencedor em uma linha", () => {
    expect(structureLine(modeled)).toBe("gancho 10% > problema 40% > chamada final 20%");
    expect(structureLine(base)).toBe("");
  });

  it("monta o CSV com ponto e vírgula, marca de UTF-8 e uma linha por referência", () => {
    const csv = referencesCsv([modeled, ad]);
    expect(csv.startsWith("﻿")).toBe(true);
    const lines = csv.slice(1).trimEnd().split("\r\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe(CSV_HEADER.join(";"));
    expect(lines[1]).toBe("Body Explained;Referência manual;sim;Three signs you need water;224000;;60;;;Pergunta direta;Curiosidade;Comente AGUA;gancho 10% > problema 40% > chamada final 20%;Abre com pergunta e fecha pedindo comentário.;Fala olhando para a câmera;;https://www.facebook.com/55/posts/1");
  });

  it("protege separador, aspas e texto que a planilha leria como fórmula", () => {
    const line = referencesCsv([ad]).slice(1).trimEnd().split("\r\n")[1];
    expect(line.startsWith('"Loja; do ""Zé""";Ad Library;não;\'=SOMA(A1:A9) oferta;')).toBe(true);
    expect(line.endsWith(";emagrecimento;https://www.facebook.com/55/posts/1")).toBe(true);
  });

  it("monta o resumo em texto, dizendo quando a estrutura ainda não foi modelada", () => {
    const text = referencesSummary([modeled, ad], new Date("2026-11-16T12:00:00Z"));
    expect(text.split("\n")[0]).toBe("Referências do ClipSpy, 16/11/2026 (2 referências)");
    expect(text).toContain("1. Body Explained (Referência manual, campeão)\n   Texto: Three signs you need water\n   Números: 224.000 visualizações, 60 comentários\n   Hook: Pergunta direta");
    expect(text).toContain("   Estrutura: gancho 10% > problema 40% > chamada final 20%\n   Como funciona: Abre com pergunta e fecha pedindo comentário.");
    expect(text).toContain("   Números: 42 dias no ar\n   Estrutura: ainda não modelada");
    expect(referencesSummary([base], new Date("2026-11-16T12:00:00Z")).split("\n")[0]).toContain("(1 referência)");
  });

  it("dá nome ao arquivo com a data de Brasília", () => {
    expect(exportFileName(new Date("2026-11-17T01:30:00Z"))).toBe("clipspy-referencias-2026-11-16.csv");
  });
});
