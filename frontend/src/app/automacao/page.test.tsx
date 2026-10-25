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

it("starts on the wizard, switches tabs and comes back through the Clonar um vídeo pill", () => {
  render(<AutomationPage />);
  expect(screen.getByText("wizard")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Copys" }));
  expect(screen.getByRole("button", { name: "Copys" })).toHaveAttribute("aria-current", "true");
  expect(screen.queryByText("wizard")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Clonar um vídeo/ }));
  expect(screen.getByText("wizard")).toBeInTheDocument();
});
