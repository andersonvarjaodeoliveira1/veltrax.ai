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
});
