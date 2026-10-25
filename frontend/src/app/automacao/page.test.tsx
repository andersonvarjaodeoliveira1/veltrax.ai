import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import AutomationPage from "./page";

vi.mock("@/components/app/clone-wizard", () => ({ CloneWizard: () => <p>wizard</p> }));

beforeEach(() => {
  window.localStorage.clear();
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("runs the light (even with reduced motion, like the influencer chat) around the main button and switches tabs", async () => {
  vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] });
  vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
  const { container } = render(<AutomationPage />);
  const orbit = container.querySelector(".cg-orbit") as HTMLElement;
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(orbit.style.getPropertyValue("--cg-angle")).toMatch(/deg$/);
  fireEvent.click(screen.getByRole("button", { name: "Copys" }));
  expect(screen.getByRole("button", { name: "Copys" })).toHaveAttribute("aria-current", "true");
  fireEvent.click(screen.getByRole("button", { name: /Clonar um vídeo/ }));
  expect(screen.getByText("wizard")).toBeInTheDocument();
});
