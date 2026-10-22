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
  expect(open).toHaveAttribute("href", "https://flow.google.com");
  await user.click(open);
  await user.click(screen.getByRole("link", { name: /Baixar a extensão/ }));
  expect(await screen.findByText(/Tudo certo/)).toBeInTheDocument();
  expect(JSON.parse(window.localStorage.getItem("gv-conectar-flow-v1") ?? "{}")).toEqual({ flow: true, extension: true });
});
