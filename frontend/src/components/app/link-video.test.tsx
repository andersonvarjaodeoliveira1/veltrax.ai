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

  it("sem extensão explica o motivo real em vez de tentar baixar pelo servidor", async () => {
    bridge.read.mockResolvedValue({ ok: false, error: "no-extension" });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<LinkVideo onFile={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Link do vídeo para clonar"), "https://shopee.com.br/Bola-i.1.2");
    await userEvent.click(screen.getByRole("button", { name: "Usar o link" }));
    expect(await screen.findByText(/Não encontrei a extensão ClipGringa/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sem vídeo do vendedor mostra as fotos, sem erro, e deixa usar no produto", async () => {
    bridge.read.mockResolvedValue({ ok: true, title: "Bola", images: ["https://down-br.img.susercontent.com/file/a", "https://down-br.img.susercontent.com/file/b"], videos: [] });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Blob(["img"], { type: "image/jpeg" }), { status: 200 })));
    const onPhotos = vi.fn();
    render(<LinkVideo onFile={() => {}} onPhotos={onPhotos} />);
    await userEvent.type(screen.getByLabelText("Link do vídeo para clonar"), "https://shopee.com.br/Bola-i.1.2");
    await userEvent.click(screen.getByRole("button", { name: "Usar o link" }));
    expect(await screen.findByTestId("shopee-photos")).toHaveTextContent("não tem vídeo do vendedor, mas tem 2 fotos");
    expect(screen.queryByRole("alert")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Usar essas fotos no meu produto" }));
    await vi.waitFor(() => expect(onPhotos).toHaveBeenCalled());
    expect(onPhotos.mock.calls[0][0]).toHaveLength(2);
  });

  it("mostra a animação de carregamento enquanto lê o link", async () => {
    bridge.read.mockReturnValue(new Promise(() => {}));
    render(<LinkVideo onFile={() => {}} />);
    await userEvent.type(screen.getByLabelText("Link do vídeo para clonar"), "https://shopee.com.br/Bola-i.1.2");
    await userEvent.click(screen.getByRole("button", { name: "Usar o link" }));
    expect(await screen.findByTestId("link-loading")).toHaveTextContent("Abrindo o anúncio da Shopee");
  });

  it("avisa quando não acha nem vídeo nem fotos", async () => {
    bridge.read.mockResolvedValue({ ok: true, title: "", images: [], videos: [] });
    render(<LinkVideo onFile={() => {}} />);
    await userEvent.type(screen.getByLabelText("Link do vídeo para clonar"), "https://shopee.com.br/Bola-i.1.2");
    await userEvent.click(screen.getByRole("button", { name: "Usar o link" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("não achei vídeo nem fotos");
  });
});
