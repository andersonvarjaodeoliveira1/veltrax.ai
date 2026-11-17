import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), useSearchParams: () => new URLSearchParams() }));

import { ClipSpyPanel } from "./clipspy-panel";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const ITEMS = [
  { id: "1", source: "manual", external_id: "a", advertiser: "Body Explained", title: "Three signs you need water", permalink: "https://www.facebook.com/55/posts/1", thumbnail: "",
    metrics: { reactions: 30, hook: "Pergunta direta" }, score: 30, is_champion: true, term: "", status: "salvo" },
];

function stub(status: Record<string, unknown>) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url.endsWith("/status")) return new Response(JSON.stringify(status));
    if (url.includes("/bank")) return new Response(JSON.stringify({ items: ITEMS }));
    return new Response(JSON.stringify({ pages: [] }));
  }));
}

describe("ClipSpy", () => {
  it("mostra o passo a passo em inglês só na conta do revisor da Meta", async () => {
    stub({ configured: true, reviewer: true });
    render(<ClipSpyPanel />);
    expect(await screen.findByRole("heading", { name: "Meta App Review: start here" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open Analisar página" }));
    expect(await screen.findByLabelText("Página do Facebook (nome ou endereço)")).toBeInTheDocument();
  });

  it("conta comum não vê o passo a passo", async () => {
    stub({ configured: true });
    render(<ClipSpyPanel />);
    await screen.findByPlaceholderText(/emagrecimento/);
    await waitFor(() => expect(screen.queryByText("Meta App Review: start here")).not.toBeInTheDocument());
  });

  it("a biblioteca copia o resumo e exporta para CSV", async () => {
    stub({ configured: true });
    const writeText = vi.fn<(text: string) => Promise<void>>(async () => {});
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    const created: Blob[] = [];
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: (blob: Blob) => { created.push(blob); return "blob:x"; }, revokeObjectURL: () => {} }));
    render(<ClipSpyPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "Biblioteca" }));

    fireEvent.click(await screen.findByRole("button", { name: "Copiar resumo" }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(String(writeText.mock.calls[0][0])).toContain("1. Body Explained (Referência manual, campeão)");

    fireEvent.click(screen.getByRole("button", { name: "Exportar para CSV" }));
    expect(created).toHaveLength(1);
    expect(created[0].type).toContain("text/csv");
    expect(created[0].size).toBeGreaterThan(200); // o conteúdo do arquivo é conferido em clipspy-export.test.ts
  });

  describe("dados na frente", () => {
    const ad = (id: number, term: string, days: number, champion = false) => ({
      id: String(id), source: "meta_adlib", external_id: `x${id}`, advertiser: `Anunciante ${id % 3}`, title: `Texto do anúncio número ${id}`,
      permalink: "", thumbnail: "", metrics: { run_days: days }, score: days, is_champion: champion, term, status: "novo",
    });
    const ADS = [ad(1, "abnehmen", 5), ad(2, "abnehmen", 24, true), ad(3, "skincare", 17), ad(4, "abnehmen", 9), ad(5, "abnehmen", 21), ad(6, "skincare", 3), ad(7, "abnehmen", 12), ad(8, "abnehmen", 2)];

    function stubAds(items: unknown[], pages = [{ id: "p1", name: "Página 1" }, { id: "p2", name: "Página 2" }]) {
      const calls: string[] = [];
      vi.stubGlobal("fetch", vi.fn(async (url: string) => {
        calls.push(String(url));
        if (url.endsWith("/status")) return new Response(JSON.stringify({ configured: true }));
        if (url.includes("/bank?champion=1")) return new Response(JSON.stringify({ items: (items as { is_champion: boolean }[]).filter((i) => i.is_champion) }));
        if (url.includes("/bank")) return new Response(JSON.stringify({ items }));
        if (url.includes("/page-analysis/pages")) return new Response(JSON.stringify({ pages }));
        return new Response(JSON.stringify({}));
      }));
      return calls;
    }

    it("ao entrar mostra os números e os criativos guardados, do mais antigo no ar para o mais novo", async () => {
      stubAds(ADS);
      render(<ClipSpyPanel />);
      const summary = await screen.findByTestId("clipspy-summary");
      expect(summary).toHaveTextContent("8criativos guardados");
      expect(summary).toHaveTextContent("1campeão");
      expect(summary).toHaveTextContent("3anunciantes");
      expect(summary).toHaveTextContent("2páginas conectadas");

      const stored = await screen.findByTestId("clipspy-stored");
      const texts = Array.from(stored.querySelectorAll("p.line-clamp-3")).map((p) => p.textContent);
      expect(texts).toEqual([2, 5, 3, 7, 4, 1].map((n) => `Texto do anúncio número ${n}`)); // 24, 21, 17, 12, 9 e 5 dias
      expect(screen.getByRole("button", { name: "Ver os 8 na Biblioteca" })).toBeInTheDocument();
      // os nomes das abas não mudam: o passo a passo do revisor da Meta cita esses nomes
      for (const name of ["Pesquisar", "Biblioteca", "Adicionar referência", "Analisar página"]) expect(screen.getAllByRole("button", { name }).length).toBeGreaterThan(0);
    });

    it("filtra pelo termo de uma busca já feita", async () => {
      stubAds(ADS);
      render(<ClipSpyPanel />);
      const stored = await screen.findByTestId("clipspy-stored");
      fireEvent.click(screen.getByRole("button", { name: "skincare 2" }));
      expect(Array.from(stored.querySelectorAll("p.line-clamp-3")).map((p) => p.textContent)).toEqual(["Texto do anúncio número 3", "Texto do anúncio número 6"]);
      fireEvent.click(screen.getByRole("button", { name: "Todas as buscas" }));
      expect(stored.querySelectorAll("p.line-clamp-3")).toHaveLength(6);
    });

    it("o número de criativos abre a Biblioteca com todos; o de campeões, só com eles", async () => {
      stubAds(ADS);
      render(<ClipSpyPanel />);
      const summary = await screen.findByTestId("clipspy-summary");
      fireEvent.click(summary.querySelectorAll("button")[0]);
      await waitFor(() => expect(screen.getByLabelText("Só os campeões")).not.toBeChecked());
      await waitFor(() => expect(screen.getAllByText(/Texto do anúncio número/)).toHaveLength(8));
      fireEvent.click(summary.querySelectorAll("button")[1]);
      await waitFor(() => expect(screen.getByLabelText("Só os campeões")).toBeChecked());
      await waitFor(() => expect(screen.getAllByText(/Texto do anúncio número/)).toHaveLength(1));
    });

    it("conta sem nada guardado não ganha bloco vazio", async () => {
      stubAds([], []);
      render(<ClipSpyPanel />);
      await screen.findByPlaceholderText(/emagrecimento/);
      await waitFor(() => expect(screen.queryByTestId("clipspy-summary")).not.toBeInTheDocument());
      expect(screen.queryByTestId("clipspy-stored")).not.toBeInTheDocument();
    });
  });
});
