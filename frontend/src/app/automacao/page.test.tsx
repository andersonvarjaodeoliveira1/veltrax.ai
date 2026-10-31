import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import AutomationPage from "./page";

vi.mock("@/components/app/clone-wizard", () => ({ CloneWizard: () => <p>wizard</p> }));

beforeEach(() => {
  window.localStorage.clear();
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("starts on Vídeo automático, with manual steps and the library in the side menu", () => {
  render(<AutomationPage />);
  expect(screen.getByText("wizard")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Vídeo automático/ })).toHaveAttribute("aria-current", "page");
  expect(screen.queryByRole("button", { name: "Copys" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Vídeo manual/ }));
  expect(screen.getByRole("button", { name: "Criar" })).toHaveAttribute("aria-current", "true");
  fireEvent.click(screen.getByRole("button", { name: "Copys" }));
  expect(screen.getByRole("button", { name: "Copys" })).toHaveAttribute("aria-current", "true");
  expect(screen.queryByText("wizard")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Biblioteca/ }));
  expect(screen.getByRole("button", { name: "Vídeos criados" })).toHaveAttribute("aria-current", "true");
  expect(screen.getByRole("button", { name: "Banco de imagens" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Vídeo automático/ }));
  expect(screen.getByText("wizard")).toBeInTheDocument();
});
