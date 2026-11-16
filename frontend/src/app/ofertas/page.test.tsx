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

it("confere a página do link e mostra o aviso sem impedir de salvar", async () => {
  const user = userEvent.setup();
  const calls: Array<{ url: string; body: unknown }> = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (String(url).endsWith("/coherence")) {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      return new Response(JSON.stringify({ level: "parcial", url: "https://loja.exemplo.com", title: "Chá Detox Slim", shared: ["chá"], only_page: ["detox", "slim"] }), { status: 200 });
    }
    return new Response(JSON.stringify({ offers: [] }), { status: 200 });
  }));
  render(<OffersPage />);
  const button = await screen.findByRole("button", { name: "Conferir a página do link" });
  expect(button).toBeDisabled(); // sem link e sem produto ou copy não há o que conferir
  await user.type(screen.getByLabelText("Produto"), "Chá da manhã");
  await user.type(screen.getByLabelText(/Mensagem privada/), "Aqui: https://loja.exemplo.com");
  await user.click(button);
  const status = await screen.findByRole("status");
  expect(status).toHaveTextContent("Em parte. A página fala só em parte do que o anúncio diz.");
  expect(status).toHaveTextContent("Título da página: Chá Detox Slim");
  expect(status).toHaveTextContent("Em comum com o anúncio: chá");
  expect(status).toHaveTextContent("Só na página: detox, slim");
  expect(calls).toEqual([{ url: "/api/multiplier/offers/coherence", body: { product: "Chá da manhã", approved_copy: "", dm_message: "Aqui: https://loja.exemplo.com" } }]);
  expect(screen.getByRole("button", { name: "Salvar oferta" })).toBeEnabled();
  // Mudou o texto conferido: o resultado antigo some.
  await user.type(screen.getByLabelText("Produto"), "!");
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});

