import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SetupTutorial, TUTORIAL_DONE_KEY, OPEN_TUTORIAL_EVENT } from "./setup-tutorial";
import { OPEN_ACCOUNT_AI_EVENT } from "@/lib/account-ai";

vi.mock("@/hooks/use-flow-connection", () => ({ useFlowConnection: () => ({ state: "no-extension", account: {} }) }));

const account = (status: Record<string, unknown>) => vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(status))));

afterEach(() => { cleanup(); window.localStorage.clear(); vi.unstubAllGlobals(); });

it("abre uma vez, explica o que fazer e por quê, e lembra que já viu", async () => {
  const user = userEvent.setup();
  account({ configured: true });
  render(<SetupTutorial enabled />);
  expect(await screen.findByText(/passo 1 de 4/)).toBeInTheDocument();
  expect(screen.getByText(/O que fazer:/)).toBeInTheDocument();
  expect(screen.getByText(/Por que:/)).toBeInTheDocument();
  expect(screen.getByText("Extensão não encontrada neste Chrome")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Próximo" }));
  await user.click(screen.getByRole("button", { name: "Próximo" }));
  const opened = vi.fn();
  window.addEventListener(OPEN_ACCOUNT_AI_EVENT, opened);
  await user.click(screen.getByRole("button", { name: "Escolher minha IA agora" }));
  expect(opened).toHaveBeenCalled();
  expect(window.localStorage.getItem(TUTORIAL_DONE_KEY)).toBe("1");
  window.removeEventListener(OPEN_ACCOUNT_AI_EVENT, opened);
});

it("não abre de novo depois de visto, mas pode ser reaberto", async () => {
  window.localStorage.setItem(TUTORIAL_DONE_KEY, "1");
  render(<SetupTutorial enabled />);
  expect(screen.queryByTestId("setup-tutorial")).toBeNull();
  window.dispatchEvent(new Event(OPEN_TUTORIAL_EVENT));
  expect(await screen.findByTestId("setup-tutorial")).toBeInTheDocument();
});

it("abre mesmo quando a consulta da conta falha", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("sem rede"); }));
  render(<SetupTutorial enabled />);
  expect(await screen.findByTestId("setup-tutorial")).toBeInTheDocument();
});

it("não abre sozinho na conta de demonstração do revisor da Meta", async () => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ configured: true, reviewer: true })));
  vi.stubGlobal("fetch", fetchMock);
  render(<SetupTutorial enabled />);
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(screen.queryByTestId("setup-tutorial")).toBeNull();
  expect(window.localStorage.getItem(TUTORIAL_DONE_KEY)).toBeNull();
});
