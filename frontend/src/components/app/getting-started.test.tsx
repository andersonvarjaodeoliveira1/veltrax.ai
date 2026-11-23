import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { GettingStarted } from "./getting-started";
import { OPEN_ACCOUNT_AI_EVENT, writeChoice } from "@/lib/account-ai";

const flow = vi.hoisted(() => ({ value: { state: "no-extension", account: { plan: null, credits: null, version: null } } as { state: string; account: { plan: string | null; credits: number | null; version: string | null } } }));
const tokens = vi.hoisted(() => ({ value: null as null | Record<string, unknown> }));
vi.mock("@/hooks/use-flow-connection", () => ({ useFlowConnection: () => flow.value }));
vi.mock("@/hooks/use-token-balance", () => ({ useTokenBalance: () => tokens.value }));

function server(integrations: { provider: string; connected: boolean }[], relayReady = false) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url.includes("version.json")) return new Response(JSON.stringify({ version: "1.24.2" }));
    if (url.includes("/api/integrations")) return new Response(JSON.stringify({ integrations }));
    if (url.includes("ai-relay/status")) return new Response(JSON.stringify({ ready: relayReady }));
    return new Response("{}", { status: 404 });
  }));
}
const step = (id: string) => screen.getByTestId(`start-step-${id}`);

beforeEach(() => {
  flow.value = { state: "no-extension", account: { plan: null, credits: null, version: null } };
  tokens.value = { unlimited: false, granted: 0, used: 0, remaining: 0, exhausted: true };
});
afterEach(() => { cleanup(); window.localStorage.clear(); vi.unstubAllGlobals(); });

it("conta nova: mostra o que falta em cada etapa e por onde começar", async () => {
  server([]);
  render(<GettingStarted />);
  expect(await screen.findByText("Primeiros passos para usar o ClipGringa")).toBeInTheDocument();
  expect(await within(step("ai")).findByText(/Nenhuma API ou conta conectada/)).toBeInTheDocument();
  expect(screen.getByText(/0 de 4 prontos\. Falta: instalar a extensão no Chrome/)).toBeInTheDocument();
  expect(within(step("ext")).getByText("Não encontrada neste Chrome")).toBeInTheDocument();
  expect(within(step("flow")).getByText("Depende da extensão")).toBeInTheDocument();
  expect(within(step("tokens")).getByText("Você ainda não tem tokens liberados")).toBeInTheDocument();
  expect(within(step("ext")).getByRole("link", { name: "Instalar a extensão" })).toHaveAttribute("href", "/conectar-flow");
  expect(within(step("ai")).getByRole("link", { name: "Conectar minha API" })).toHaveAttribute("href", "/minhas-apis");
  expect(within(step("tokens")).getByRole("link", { name: "Pedir mais tokens" })).toHaveAttribute("href", expect.stringContaining("wa.me/5511913142143"));
});

it("mostra os dados reais de cada etapa quando está tudo conectado", async () => {
  flow.value = { state: "connected", account: { plan: "Pro", credits: 820, version: "1.24.2" } };
  tokens.value = { unlimited: false, granted: 50000, used: 100, remaining: 49900, exhausted: false, own_key: true };
  server([{ provider: "gemini", connected: true }, { provider: "openai", connected: true }, { provider: "pexels", connected: true }]);
  render(<GettingStarted />);
  expect(await within(step("ai")).findByText("Pela sua chave de API (Gemini, OpenAI)")).toBeInTheDocument();
  expect(within(step("ext")).getByText("Instalada, versão 1.24.2")).toBeInTheDocument();
  expect(within(step("flow")).getByText("Conta conectada, plano Pro, 820 créditos")).toBeInTheDocument();
  expect(within(step("tokens")).getByText("Você usa a sua própria IA, não gasta tokens")).toBeInTheDocument();
  expect(screen.getByText("Tudo conectado, você já pode criar")).toBeInTheDocument();
  expect(screen.getByText("4 de 4 prontos")).toBeInTheDocument();
});

it("avisa quando a extensão está desatualizada e quando a IA é pela conta", async () => {
  flow.value = { state: "logged-out", account: { plan: null, credits: null, version: "1.24.0" } };
  tokens.value = { unlimited: false, granted: 50000, used: 37600, remaining: 12400, exhausted: false };
  writeChoice("gemini");
  server([], true);
  render(<GettingStarted />);
  expect(await within(step("ext")).findByText("Instalada na versão 1.24.0, mas já existe a 1.24.2")).toBeInTheDocument();
  expect(within(step("ext")).getByRole("link", { name: "Atualizar a extensão" })).toBeInTheDocument();
  expect(within(step("flow")).getByText("Flow aberto, mas sem login")).toBeInTheDocument();
  expect(await within(step("ai")).findByText("Pela sua conta do Gemini, ligada agora")).toBeInTheDocument();
});

it("sem IA própria, mostra o saldo de tokens", async () => {
  tokens.value = { unlimited: false, granted: 50000, used: 37600, remaining: 12400, exhausted: false };
  server([]);
  render(<GettingStarted />);
  expect(await within(step("tokens")).findByText("12.400 restantes de 50.000")).toBeInTheDocument();
});

it("explica como cada etapa funciona e abre a escolha da conta de IA", async () => {
  const user = userEvent.setup();
  server([]);
  render(<GettingStarted />);
  await within(step("ai")).findByText(/Nenhuma API ou conta conectada/);
  await user.click(within(step("ai")).getByRole("button", { name: "Como funciona" }));
  expect(within(step("ai")).getByText(/A ordem de uso é: sua chave de API, depois a sua conta, depois os tokens/)).toBeInTheDocument();
  const opened = vi.fn();
  window.addEventListener(OPEN_ACCOUNT_AI_EVENT, opened);
  await user.click(within(step("ai")).getByRole("button", { name: "Usar minha conta de IA" }));
  expect(opened).toHaveBeenCalled();
  window.removeEventListener(OPEN_ACCOUNT_AI_EVENT, opened);
  expect(screen.getByRole("link", { name: /Vídeo orgânico/ })).toHaveAttribute("href", "/automacao");
});

it("pode ser escondido e lembra a escolha", async () => {
  const user = userEvent.setup();
  server([]);
  const view = render(<GettingStarted />);
  await user.click(await screen.findByRole("button", { name: /Primeiros passos/ }));
  expect(screen.queryByTestId("start-step-ext")).toBeNull();
  expect(screen.getByText(/0 de 4 prontos/)).toBeInTheDocument();
  view.unmount();
  render(<GettingStarted />);
  expect(await screen.findByRole("button", { name: /Primeiros passos/ })).toHaveAttribute("aria-expanded", "false");
});
