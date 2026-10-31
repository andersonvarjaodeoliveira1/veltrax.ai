import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const flow = vi.hoisted(() => ({ state: "connected" as string }));
vi.mock("@/hooks/use-flow-connection", () => ({ useFlowConnection: () => ({ state: flow.state, account: {} }) }));
const probe = vi.hoisted(() => ({ value: "ready" as string }));
vi.mock("@/lib/account-ai", async (orig) => ({ ...(await orig<typeof import("@/lib/account-ai")>()), probeSite: vi.fn(async () => probe.value) }));
import { ConnectAll } from "./connect-all";

describe("ConnectAll", () => {
  beforeEach(() => { window.localStorage.clear(); });
  it("shows all connected and picks Gemini", async () => {
    flow.state = "connected"; probe.value = "ready";
    render(<ConnectAll />);
    expect(await screen.findByText("Tudo conectado. Pode criar seus vídeos.")).toBeTruthy();
    expect(window.localStorage.getItem("gv-account-ai-v1")).toContain("gemini");
  });
  it("offers the connect button when something is missing", async () => {
    flow.state = "logged-out"; probe.value = "login";
    render(<ConnectAll />);
    expect(await screen.findByRole("button", { name: /Conectar Flow e Gemini/ })).toBeTruthy();
  });
});
