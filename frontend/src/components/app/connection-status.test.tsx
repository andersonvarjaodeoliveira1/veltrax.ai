import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConnectionStatus } from "./connection-status";

const hook = vi.hoisted(() => ({ value: { state: "connected", account: { plan: "Pro", credits: 10, seenAt: 1, version: "1.21.1" } } as { state: string; account: { plan: string | null; credits: number | null; seenAt: number | null; version?: string | null } } }));
vi.mock("@/hooks/use-flow-connection", () => ({ useFlowConnection: () => hook.value }));

function stubFetch(latest = "1.21.1", ready = true) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (String(url).includes("version.json")) return new Response(JSON.stringify({ version: latest }), { status: 200 });
    return new Response(JSON.stringify({ ready }), { status: 200 });
  }));
}
beforeEach(() => { window.localStorage.clear(); hook.value = { state: "connected", account: { plan: "Pro", credits: 10, seenAt: 1, version: "1.21.1" } }; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.localStorage.clear(); });

const openPanel = async () => { await userEvent.setup().click(screen.getByRole("button", { name: /Conexões:/ })); };

it("sem extensão: mostra 'Falta conectar' e o botão de instalar", async () => {
  hook.value = { state: "no-extension", account: { plan: null, credits: null, seenAt: null } };
  stubFetch();
  render(<ConnectionStatus />);
  expect(screen.getByRole("button", { name: /Falta conectar/ })).toBeInTheDocument();
  await openPanel();
  expect(screen.getByRole("link", { name: "Instalar a extensão" })).toHaveAttribute("href", "/conectar-flow");
});

it("extensão antiga: avisa a versão e oferece atualizar", async () => {
  hook.value = { state: "connected", account: { plan: "Pro", credits: 1, seenAt: 1, version: "1.19.1" } };
  stubFetch("1.21.1");
  render(<ConnectionStatus />);
  await act(async () => { await Promise.resolve(); });
  await openPanel();
  expect(await screen.findByText(/Desatualizada \(1\.19\.1\)\. A nova é a 1\.21\.1/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Atualizar a extensão" })).toBeInTheDocument();
});

it("Flow sem login: oferece abrir o Flow", async () => {
  hook.value = { state: "logged-out", account: { plan: null, credits: null, seenAt: null, version: "1.21.1" } };
  stubFetch();
  render(<ConnectionStatus />);
  await openPanel();
  expect(screen.getByRole("link", { name: "Abrir o Flow e entrar" })).toHaveAttribute("href", expect.stringContaining("labs.google"));
});

it("tudo pronto: mostra 'Tudo conectado' com a conta de IA ligada", async () => {
  window.localStorage.setItem("gv-account-ai-v1", JSON.stringify({ site: "gemini", at: Date.now() }));
  stubFetch("1.21.1", true);
  render(<ConnectionStatus />);
  expect(await screen.findByRole("button", { name: /Tudo conectado/ }, { timeout: 3000 })).toBeInTheDocument();
  await openPanel();
  expect(screen.getByText(/Gerando pela sua conta do Gemini/)).toBeInTheDocument();
});

it("sem conta de IA escolhida: usa créditos e oferece conectar", async () => {
  stubFetch();
  render(<ConnectionStatus />);
  await openPanel();
  expect(screen.getByText(/Usando os créditos do plano/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Conectar minha conta de IA" })).toBeInTheDocument();
});
