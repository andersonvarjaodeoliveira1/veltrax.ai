import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import ConnectFlowPage from "./page";

vi.mock("@/lib/auth-client", () => ({ useSession: () => ({ data: { user: { is_admin: true } } }) }));

afterEach(() => { cleanup(); window.localStorage.clear(); });

it("the administrator account stays on Lower Priority and has no category to choose", () => {
  render(<ConnectFlowPage />);
  expect(screen.getByTestId("category-admin")).toHaveTextContent(/Lower Priority/);
  expect(screen.queryByRole("button", { name: /Veo 3.1 - Fast/ })).not.toBeInTheDocument();
});
