import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FacebookPublish } from "./facebook-publish";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const clip = { filename: "a.mp4", video_url: "/clips/a.mp4", text: "Fala do vídeo", hook_title: "Gancho" };

function answer(payload: Record<string, unknown>) {
  act(() => { window.dispatchEvent(new MessageEvent("message", { data: { source: "clipgringa-flow", ...payload }, origin: window.location.origin })); });
}

afterEach(() => vi.unstubAllGlobals());

describe("Publicar no Facebook", () => {
  it("mostra as páginas salvas, escreve a legenda com IA e manda o pacote para a extensão", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (String(url).includes("influencer-caption")
      ? new Response(JSON.stringify({ caption: "Legenda pronta #ok" }), { status: 200 })
      : new Response(new Uint8Array([1, 2, 3]), { status: 200 }))));
    const posted: Record<string, unknown>[] = [];
    window.addEventListener("message", (event) => { if (event.data?.source === "clipgringa-page") posted.push(event.data); });
    render(<FacebookPublish clip={clip} />);
    fireEvent.click(screen.getByRole("button", { name: "Publicar no Facebook" }));
    answer({ type: "fb-status", loggedIn: true, version: "1.1.0", pages: [{ name: "Minha Página", url: "https://www.facebook.com/minhapagina" }] });
    expect(await screen.findByRole("option", { name: "Minha Página" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Escrever com IA/ }));
    expect(await screen.findByDisplayValue("Legenda pronta #ok")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Publicar agora/ }));
    await vi.waitFor(() => expect(posted.some((m) => m.type === "fb-publish")).toBe(true));
    const job = (posted.find((m) => m.type === "fb-publish") as { job: { pageUrl: string; caption: string; b64: string } }).job;
    expect(job.pageUrl).toBe("https://www.facebook.com/minhapagina");
    expect(job.caption).toBe("Legenda pronta #ok");
    expect(job.b64).toBe("AQID");
  });

  it("avisa quando a extensão não responde", async () => {
    vi.useFakeTimers();
    render(<FacebookPublish clip={clip} />);
    fireEvent.click(screen.getByRole("button", { name: "Publicar no Facebook" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(2600); });
    vi.useRealTimers();
    expect(screen.getByText(/Não encontrei a extensão/)).toBeInTheDocument();
  });
});
