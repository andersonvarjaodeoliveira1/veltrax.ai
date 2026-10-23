import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ConnectFlowPage from "./page";

afterEach(() => { cleanup(); window.localStorage.clear(); });

it("guides the member through the two steps and remembers them", async () => {
  window.localStorage.clear();
  const user = userEvent.setup();
  render(<ConnectFlowPage />);
  expect(screen.getByRole("status")).toHaveTextContent(/Faça os dois passos para liberar/);
  const open = screen.getByRole("link", { name: /Abrir o Flow e entrar/ });
  expect(open).toHaveAttribute("href", "https://labs.google/fx/pt/tools/flow");
  await user.click(open);
  await user.click(screen.getByRole("link", { name: /Baixar a extensão/ }));
  expect(await screen.findByText(/Tudo certo/)).toBeInTheDocument();
  expect(JSON.parse(window.localStorage.getItem("gv-conectar-flow-v1") ?? "{}")).toEqual({ flow: true, extension: true });
});

it("lets the member pick the Flow category and remembers it", async () => {
  window.localStorage.clear();
  const user = userEvent.setup();
  render(<ConnectFlowPage />);
  expect(screen.getByRole("button", { name: /Veo 3.1 - Lite/ })).toHaveAttribute("aria-pressed", "true");
  await user.click(screen.getByRole("button", { name: /Veo 3.1 - Fast/ }));
  expect(screen.getByRole("button", { name: /Veo 3.1 - Fast/ })).toHaveAttribute("aria-pressed", "true");
  expect(window.localStorage.getItem("gv-flow-model")).toBe("fast");
});
