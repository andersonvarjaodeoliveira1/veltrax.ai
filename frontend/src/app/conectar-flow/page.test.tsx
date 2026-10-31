import { afterEach, expect, it } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ConnectFlowPage from "./page";

afterEach(() => { cleanup(); window.localStorage.clear(); });

it("shows one guided card with the extension step first", async () => {
  render(<ConnectFlowPage />);
  expect(screen.getAllByTestId("connect-all")).toHaveLength(1);
  expect(screen.queryByTestId("flow-status")).not.toBeInTheDocument();
  expect(screen.queryByTestId("step-flow")).not.toBeInTheDocument();
  expect(await screen.findByRole("link", { name: /Baixar a extensão/ }, { timeout: 8000 })).toHaveAttribute("href", "/extensao/clipgringa-flow.zip");
}, 12000);

it("lets the member pick the Flow category and remembers it", async () => {
  window.localStorage.clear();
  const user = userEvent.setup();
  render(<ConnectFlowPage />);
  expect(screen.getByRole("button", { name: /^Veo 3\.1 - Lite(?! \[)/ })).toHaveAttribute("aria-pressed", "true");
  await user.click(screen.getByRole("button", { name: /Veo 3.1 - Fast/ }));
  expect(screen.getByRole("button", { name: /Veo 3.1 - Fast/ })).toHaveAttribute("aria-pressed", "true");
  expect(window.localStorage.getItem("gv-flow-model")).toBe("fast");
});

it("marks the extension and Flow steps done when the extension answers", async () => {
  render(<ConnectFlowPage />);
  window.postMessage({ source: "clipgringa-flow", type: "status", loggedIn: true, plan: "Pro", credits: 840, seenAt: Date.now(), version: "1.21.1" }, window.location.origin);
  expect(await screen.findByText(/Conta conectada · plano Pro · 840 créditos/)).toBeInTheDocument();
  expect(screen.getByTestId("connect-step-ext")).toHaveAttribute("data-state", "done");
  expect(screen.getByTestId("connect-step-flow")).toHaveAttribute("data-state", "done");
});

it("says the extension was not found when nobody answers", async () => {
  render(<ConnectFlowPage />);
  expect(await screen.findByText("Ainda não encontrei no Chrome.", {}, { timeout: 8000 })).toBeInTheDocument();
}, 12000);

it("shows Lower Priority only to Ultra accounts, and only preselects it when the member picks it", async () => {
  window.localStorage.clear();
  const user = userEvent.setup();
  render(<ConnectFlowPage />);
  expect(screen.queryByRole("button", { name: /Lower Priority\]/ })).not.toBeInTheDocument();
  await act(async () => { window.postMessage({ source: "clipgringa-flow", type: "status", loggedIn: true, plan: "Ultra", credits: 100, seenAt: Date.now() }, window.location.origin); });
  const lower = await screen.findByRole("button", { name: /Lower Priority\]/ });
  expect(lower).toHaveAttribute("aria-pressed", "false");
  await user.click(lower);
  expect(lower).toHaveAttribute("aria-pressed", "true");
  expect(window.localStorage.getItem("gv-flow-model")).toBe("lower");
});
