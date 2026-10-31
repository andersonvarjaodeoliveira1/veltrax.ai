import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

const flow = vi.hoisted(() => ({ state: "connected" as string }));
vi.mock("@/hooks/use-flow-connection", () => ({ useFlowConnection: () => ({ state: flow.state, account: { plan: null, credits: null } }) }));
const probe = vi.hoisted(() => ({ value: "ready" as string }));
vi.mock("@/lib/account-ai", async (orig) => ({ ...(await orig<typeof import("@/lib/account-ai")>()), probeSite: vi.fn(async () => probe.value) }));
import { ConnectAll } from "./connect-all";

describe("ConnectAll", () => {
  beforeEach(() => { window.localStorage.clear(); });
  it("shows all connected and picks Gemini", async () => {
    flow.state = "connected"; probe.value = "ready";
    render(<ConnectAll />);
    expect(await screen.findByText(/Já conectado ✓ Pode criar seus vídeos/, {}, { timeout: 4000 })).toBeTruthy();
    await waitFor(() => expect(window.localStorage.getItem("gv-account-ai-v1") ?? "").toContain("gemini"));
  });
  it("offers the connect button when something is missing", async () => {
    flow.state = "logged-out"; probe.value = "login";
    render(<ConnectAll />);
    expect(await screen.findByRole("button", { name: /Conectar Flow e Gemini/ })).toBeTruthy();
  });
  it("closes only the tabs it opened once Flow and Gemini are connected", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const tabs = [{ close: vi.fn(), location: { href: "" }, opener: {} }, { close: vi.fn(), location: { href: "" }, opener: {} }];
    const open = vi.spyOn(window, "open").mockImplementation(() => tabs.shift() as unknown as Window);
    const all = [...tabs];
    flow.state = "connected"; probe.value = "login";
    render(<ConnectAll />);
    fireEvent.click(await screen.findByRole("button", { name: /Conectar Flow e Gemini/ }));
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(open).toHaveBeenCalledTimes(2);
    expect(all[0].location.href).toContain("labs.google");
    probe.value = "ready";
    await act(async () => { await vi.advanceTimersByTimeAsync(12000); });
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(all[0].close).toHaveBeenCalled();
    expect(all[1].close).toHaveBeenCalled();
    open.mockRestore(); vi.useRealTimers();
  });
});
