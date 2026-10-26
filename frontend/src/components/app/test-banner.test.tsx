import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TestBanner } from "./test-banner";

afterEach(() => vi.unstubAllGlobals());

describe("TestBanner", () => {
  it("mostra a validade e o WhatsApp nas contas de teste", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ test_expires_at: "2026-11-02T15:00:00Z" }))));
    render(<TestBanner enabled />);
    await waitFor(() => expect(screen.getByText(/02\/11\/2026/)).toBeInTheDocument());
    expect(screen.getByRole("link").getAttribute("href")).toContain("wa.me/5511913142143");
  });
  it("não aparece em conta normal", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ test_expires_at: null })));
    vi.stubGlobal("fetch", f);
    const { container } = render(<TestBanner enabled />);
    await waitFor(() => expect(f).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
