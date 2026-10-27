import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LinkVideo } from "./link-video";

const bridge = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("@/lib/shopee-bridge", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/shopee-bridge")>()), readShopeeViaExtension: bridge.read }));

afterEach(() => { vi.unstubAllGlobals(); bridge.read.mockReset(); });

describe("LinkVideo", () => {
  it("baixa pelo link e entrega o vídeo como arquivo", async () => {
    const calls: { url: string; body: string }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => { calls.push({ url, body: String(init?.body) }); return new Response(new Blob(["video"], { type: "video/mp4" }), { status: 200 }); }));
    const onFile = vi.fn();
    render(<LinkVideo onFile={onFile} />);
    expect(screen.getByRole("button", { name: "Usar o link" })).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Link do vídeo para clonar"), "https://vm.tiktok.com/ZM123/");
    await userEvent.click(screen.getByRole("button", { name: "Usar o link" }));
    await vi.waitFor(() => expect(onFile).toHaveBeenCalled());
    expect(JSON.parse(calls[0].body)).toEqual({ url: "https://vm.tiktok.com/ZM123/" });
    const file = onFile.mock.calls[0][0] as File;
    expect(file).toBeInstanceOf(File);
    expect(file.name).toBe("video-do-link.mp4");
  });

  it("mostra o motivo quando não consegue baixar", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ detail: "Não consegui baixar esse link (o site pode ter bloqueado). Baixe o vídeo e suba o arquivo." }), { status: 422 })));
    const onFile = vi.fn();
    render(<LinkVideo onFile={onFile} />);
    await userEvent.type(screen.getByLabelText("Link do vídeo para clonar"), "https://www.instagram.com/reel/abc/");
    await userEvent.click(screen.getByRole("button", { name: "Usar o link" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("suba o arquivo");
    expect(onFile).not.toHaveBeenCalled();
  });
});

describe("LinkVideo · Shopee pela extensão", () => {
  it("mostra os vídeos do anúncio para escolher e baixa o escolhido", async () => {
    bridge.read.mockResolvedValue({ ok: true, title: "Bola PIC", images: [], videos: [{ url: "https://down-bs.vod.susercontent.com/api/v4/1/mms/a.mp4", poster: "" }, { url: "https://down-bs.vod.susercontent.com/api/v4/1/mms/b.mp4", poster: "" }] });
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => { calls.push(String(init?.body)); return new Response(new Blob(["video"], { type: "video/mp4" }), { status: 200 }); }));
    const onFile = vi.fn();
    render(<LinkVideo onFile={onFile} />);
    await userEvent.type(screen.getByLabelText("Link do vídeo para clonar"), "https://shopee.com.br/Bola-i.1.2");
    await userEvent.click(screen.getByRole("button", { name: "Usar o link" }));
    expect(await screen.findByTestId("shopee-videos")).toHaveTextContent("Bola PIC");
    await userEvent.click(screen.getByRole("button", { name: "Usar o vídeo 2" }));
    await vi.waitFor(() => expect(onFile).toHaveBeenCalled());
    expect(JSON.parse(calls[0])).toEqual({ cdn_url: "https://down-bs.vod.susercontent.com/api/v4/1/mms/b.mp4" });
  });

  it("explica quando o anúncio não tem vídeo do vendedor", async () => {
    bridge.read.mockResolvedValue({ ok: true, title: "Bola", images: ["x"], videos: [] });
    render(<LinkVideo onFile={() => {}} />);
    await userEvent.type(screen.getByLabelText("Link do vídeo para clonar"), "https://shopee.com.br/Bola-i.1.2");
    await userEvent.click(screen.getByRole("button", { name: "Usar o link" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("não tem vídeo do vendedor");
  });
});
