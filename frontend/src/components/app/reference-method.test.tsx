import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { ReferenceSummary } from "./reference-summary";

afterEach(() => vi.unstubAllGlobals());

it("mostra o método do criativo quando a pessoa pede", async () => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ hook: "Abre com uma dúvida", angle: "Curiosidade", mechanism: "Mostra o uso", cta: "Comente QUERO", why_it_works: "Prende no começo" }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  render(<ReferenceSummary file={null} transcript="Texto do criativo com mais de vinte caracteres para analisar." />);
  await userEvent.setup().click(screen.getByRole("button", { name: /Ver o método deste criativo/ }));
  expect(await screen.findByTestId("method")).toHaveTextContent("Abre com uma dúvida");
  expect(screen.getByTestId("method")).toHaveTextContent("Comente QUERO");
  expect(fetchMock).toHaveBeenCalledWith("/api/multiplier/clone/method", expect.objectContaining({ method: "POST" }));
});

it("avisa quando a análise falha", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 502 })));
  render(<ReferenceSummary file={null} transcript="Texto do criativo com mais de vinte caracteres para analisar." />);
  await userEvent.setup().click(screen.getByRole("button", { name: /Ver o método deste criativo/ }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível analisar");
});
