import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import OffersPage from "./page";

const offer = { id: "o1", name: "Jogo de lençol", product: "Lençol", keyword: "QUERO", language: "pt-BR", approved_copy: "Copy aprovada com bem mais de vinte caracteres", notes: "", reference_url: "", updated_at: null };

beforeEach(() => { vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => new Response(JSON.stringify(init?.method === "POST" ? { id: "o2" } : { offers: [offer] }), { status: 200 }))); });
afterEach(() => vi.unstubAllGlobals());

it("lista as ofertas salvas", async () => {
  render(<OffersPage />);
  expect(await screen.findByText("Jogo de lençol")).toBeInTheDocument();
  expect(screen.getByText(/Palavra: QUERO/)).toBeInTheDocument();
});

it("exige um nome para salvar e manda a oferta nova ao servidor", async () => {
  const user = userEvent.setup();
  render(<OffersPage />);
  await screen.findByText("Jogo de lençol");
  await user.click(screen.getByRole("button", { name: "Salvar oferta" }));
  expect(screen.getByRole("alert")).toHaveTextContent("Dê um nome");
  await user.type(screen.getByLabelText("Nome da oferta"), "Campanha nova");
  await user.type(screen.getByLabelText("Palavra que a pessoa comenta"), "link");
  await user.click(screen.getByRole("button", { name: "Salvar oferta" }));
  await waitFor(() => {
    const calls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.filter((c) => (c[1] as RequestInit | undefined)?.method === "POST");
    expect(calls).toHaveLength(1);
    expect(JSON.parse((calls[0][1] as RequestInit).body as string)).toMatchObject({ name: "Campanha nova", keyword: "LINK" });
  });
});
