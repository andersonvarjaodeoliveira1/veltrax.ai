import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ConnectFlowPage from "./page";

vi.mock("@/lib/auth-client", () => ({ useSession: () => ({ data: { user: { is_admin: true } } }) }));

afterEach(() => { cleanup(); window.localStorage.clear(); });

it("the administrator account starts on Lower Priority but can still pick another model", async () => {
  const user = userEvent.setup();
  render(<ConnectFlowPage />);
  await act(async () => { window.postMessage({ source: "clipgringa-flow", type: "status", loggedIn: true, plan: "Ultra", credits: 100, seenAt: Date.now() }, window.location.origin); });
  const lower = await screen.findByRole("button", { name: /Lower Priority\]/ });
  await waitFor(() => expect(lower).toHaveAttribute("aria-pressed", "true"));
  await user.click(screen.getByRole("button", { name: /Veo 3.1 - Fast/ }));
  expect(screen.getByRole("button", { name: /Veo 3.1 - Fast/ })).toHaveAttribute("aria-pressed", "true");
  expect(window.localStorage.getItem("gv-flow-model")).toBe("fast");
});
