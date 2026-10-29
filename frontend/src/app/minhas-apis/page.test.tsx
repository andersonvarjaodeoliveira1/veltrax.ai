import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MyApisPage from "./page";

const base = [
  { provider: "gemini", label: "Gemini (Google)", help: "ajuda", connected: false, hint: "", updated_at: null },
  { provider: "openai", label: "ChatGPT (OpenAI)", help: "ajuda", connected: true, hint: "1234", updated_at: null },
];

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("lists providers, connects a key and shows errors from the server", async () => {
  const calls: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? "GET"} ${url}`);
    if (init?.method === "PUT") {
      const key = JSON.parse(String(init.body)).key;
      if (key === "ruim-ruim") return new Response(JSON.stringify({ detail: "O provedor recusou essa chave." }), { status: 400 });
      return new Response(JSON.stringify({ integrations: base.map((i) => (i.provider === "gemini" ? { ...i, connected: true, hint: "9999" } : i)) }), { status: 200 });
    }
    return new Response(JSON.stringify({ integrations: base }), { status: 200 });
  }));
  const user = userEvent.setup();
  render(<MyApisPage />);

  expect(await screen.findByText("Gemini (Google)")).toBeInTheDocument();
  expect(screen.getByText(/Conectado · …1234/)).toBeInTheDocument();

  await user.type(screen.getByLabelText("Chave de Gemini (Google)"), "ruim-ruim");
  await user.click(screen.getAllByRole("button", { name: "Conectar" })[0]);
  expect(await screen.findByText("O provedor recusou essa chave.")).toBeInTheDocument();

  await user.clear(screen.getByLabelText("Chave de Gemini (Google)"));
  await user.type(screen.getByLabelText("Chave de Gemini (Google)"), "chave-boa-12345");
  await user.click(screen.getAllByRole("button", { name: "Conectar" })[0]);
  expect(await screen.findByText(/Chave testada e conectada/)).toBeInTheDocument();
  expect(calls.filter((c) => c.startsWith("PUT")).length).toBe(2);
});

it("conecta o Ollama com endereço e modelo", async () => {
  const bodies: Record<string, unknown>[] = [];
  const list = [{ provider: "ollama", label: "Ollama", help: "ajuda", connected: false, hint: "", updated_at: null }];
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === "PUT") {
      bodies.push(JSON.parse(String(init.body)));
      return new Response(JSON.stringify({ integrations: list.map((i) => ({ ...i, connected: true, hint: "llama3 · meu.host" })) }), { status: 200 });
    }
    return new Response(JSON.stringify({ integrations: list }), { status: 200 });
  }));
  const user = userEvent.setup();
  render(<MyApisPage />);
  await user.type(await screen.findByLabelText("Endereço do Ollama"), "https://meu.host/v1");
  await user.type(screen.getByLabelText("Modelo do Ollama"), "llama3");
  await user.click(screen.getByRole("button", { name: "Conectar" }));
  await screen.findByText(/Conectado/);
  expect(bodies).toEqual([{ key: "", url: "https://meu.host/v1", model: "llama3" }]);
});
