import { render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import AdminActivityPage from "./page";

afterEach(() => vi.unstubAllGlobals());

it("mostra o alerta de erros e a tabela por conta", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
    days: 7,
    totals: { imagem: { last_24h: 2, period: 5 }, cena: { last_24h: 1, period: 3 }, erro: { last_24h: 1, period: 1 } },
    users: [{ id: "u1", email: "a@b.com", name: "A", images: 5, scenes: 3, errors: 1, last_at: null }],
    errors: [{ id: 1, kind: "erro", detail: "HTTP 500 em /multiplier/x", email: "a@b.com", at: null }],
  }), { status: 200 })));
  render(<AdminActivityPage />);
  expect(await screen.findByText(/1 erro nas últimas 24 horas/)).toBeTruthy();
  expect(screen.getAllByText("a@b.com").length).toBeGreaterThan(0);
  expect(screen.getByText("HTTP 500 em /multiplier/x")).toBeTruthy();
});
