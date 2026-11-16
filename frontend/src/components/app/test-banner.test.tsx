import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TestBanner } from "./test-banner";

// O aviso guarda a data na sessão: sem limpar, o teste seguinte nasce com o aviso do anterior.
afterEach(() => { vi.unstubAllGlobals(); window.sessionStorage.clear(); });

describe("TestBanner", () => {
  it("mostra a validade e o WhatsApp nas contas de teste", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ test_expires_at: "2026-11-02T15:00:00Z" }))));
    render(<TestBanner enabled />);
    // no CI a resposta simulada pode demorar mais que o 1 s padrão do waitFor
    await waitFor(() => expect(screen.getByText(/02\/11\/2026/)).toBeInTheDocument(), { timeout: 5000 });
    expect(screen.getByRole("link").getAttribute("href")).toContain("wa.me/5511913142143");
  });
  it("não aparece em conta normal", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ test_expires_at: null })));
    vi.stubGlobal("fetch", f);
    const { container } = render(<TestBanner enabled />);
    await waitFor(() => expect(f).toHaveBeenCalled(), { timeout: 5000 });
    await waitFor(() => expect(container).toBeEmptyDOMElement(), { timeout: 5000 });
  });
});
