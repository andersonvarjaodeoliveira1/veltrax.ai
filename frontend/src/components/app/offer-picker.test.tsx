import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { OfferPicker } from "./offer-picker";

afterEach(() => vi.unstubAllGlobals());

it("carrega a oferta escolhida", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ offers: [{ id: "o1", name: "Lençol", product: "Lençol", keyword: "QUERO", language: "pt-BR", approved_copy: "", notes: "", reference_url: "", updated_at: null }] }), { status: 200 })));
  const onPick = vi.fn();
  render(<OfferPicker onPick={onPick} />);
  await userEvent.setup().click(await screen.findByRole("button", { name: "Lençol" }));
  expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: "o1", keyword: "QUERO" }));
});

it("convida a salvar a primeira oferta quando não há nenhuma", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ offers: [] }), { status: 200 })));
  render(<OfferPicker onPick={vi.fn()} />);
  expect(await screen.findByRole("link", { name: "Salve uma oferta" })).toHaveAttribute("href", "/ofertas");
});
