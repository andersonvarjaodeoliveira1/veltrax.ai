import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SetupTutorial, TUTORIAL_DONE_KEY, OPEN_TUTORIAL_EVENT } from "./setup-tutorial";
import { OPEN_ACCOUNT_AI_EVENT } from "@/lib/account-ai";

vi.mock("@/hooks/use-flow-connection", () => ({ useFlowConnection: () => ({ state: "no-extension", account: {} }) }));

afterEach(() => { cleanup(); window.localStorage.clear(); });

it("abre uma vez, explica o que fazer e por quê, e lembra que já viu", async () => {
  const user = userEvent.setup();
  render(<SetupTutorial enabled />);
  expect(screen.getByText(/passo 1 de 4/)).toBeInTheDocument();
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
