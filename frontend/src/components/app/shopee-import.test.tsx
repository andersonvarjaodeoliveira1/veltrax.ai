import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ShopeeImport } from "./shopee-import";

const bridge = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("@/lib/shopee-bridge", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/shopee-bridge")>()), readShopeeViaExtension: bridge.read }));

const img = "data:image/jpeg;base64,/9j/4AAQ";
afterEach(() => { vi.unstubAllGlobals(); bridge.read.mockReset(); });
beforeEach(() => bridge.read.mockResolvedValue({ ok: false, error: "no-extension" }));

function stub(responses: { ok: boolean; body: unknown }[]) {
  const calls: { url: string; body?: BodyInit | null }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, body: init?.body });
    if (String(url).startsWith("data:")) return new Response(new Blob(["x"]));
    const next = responses.shift()!;
    return new Response(JSON.stringify(next.body), { status: next.ok ? 200 : 422 });
  }));
  return calls;
}

describe("ShopeeImport", () => {
  it("busca pelo link, mostra as fotos e entrega as escolhidas", async () => {
    const calls = stub([{ ok: true, body: { title: "Creme 200ml", seller_gallery: true, images: [{ name: "a", image: img }, { name: "b", image: img }, { name: "c", image: img }, { name: "d", image: img }] } }]);
    const onUse = vi.fn();
    render(<ShopeeImport onUse={onUse} />);
    await userEvent.type(screen.getByLabelText("Link do produto da Shopee"), "https://shopee.com.br/Creme-i.1.2");
    await userEvent.click(screen.getByRole("button", { name: /Buscar imagens/ }));
    expect(await screen.findByText("Creme 200ml")).toBeInTheDocument();
    expect((calls[0].body as FormData).get("url")).toBe("https://shopee.com.br/Creme-i.1.2");
    expect(screen.getByLabelText("Foto 1 (escolhida)")).toBeInTheDocument();
    expect(screen.getByLabelText("Foto 4")).toBeInTheDocument(); // só as 3 primeiras vêm marcadas
    await userEvent.click(screen.getByLabelText("Foto 3 (escolhida)")); // desmarca
    expect(screen.getByText(/galeria do vendedor \(sem fotos de avaliações\)/)).toBeInTheDocument();
    const use = screen.getByRole("button", { name: /Usar 2 fotos no produto/ });
    expect(use).toBeDisabled(); // só libera depois de confirmar que são fotos do vendedor
    await userEvent.click(screen.getByLabelText(/Confirmo que estas fotos são do anúncio do vendedor/));
    await userEvent.click(use);
    await waitFor(() => expect(onUse).toHaveBeenCalled());
    const [files, title] = onUse.mock.calls[0];
    expect(files).toHaveLength(2);
    expect(files[0]).toBeInstanceOf(File);
    expect(title).toBe("Creme 200ml");
    expect(screen.getByLabelText("Baixar foto 1")).toHaveAttribute("download", "produto-1.jpg");
  });

  it("mostra a animação de busca enquanto procura e some quando termina", async () => {
    let release: (value: Response) => void = () => {};
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => { release = resolve; })));
    render(<ShopeeImport onUse={() => {}} />);
    expect(screen.queryByTestId("shopee-searching")).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Link do produto da Shopee"), "https://exemplo.com/produto");
    await userEvent.click(screen.getByRole("button", { name: /Buscar imagens/ }));
    expect(await screen.findByTestId("shopee-searching")).toHaveTextContent(/Abrindo o anúncio/);
    release(new Response(JSON.stringify({ title: "X", images: [{ name: "a", image: img }] }), { status: 200 }));
    await waitFor(() => expect(screen.queryByTestId("shopee-searching")).not.toBeInTheDocument());
  });

  it("avisa sobre fotos de avaliações antes de qualquer busca", () => {
    render(<ShopeeImport onUse={() => {}} />);
    expect(screen.getByText(/avaliações de clientes/)).toBeInTheDocument();
  });

  it("mostra o aviso quando a Shopee não deixa ler o link e permite anexar arquivos", async () => {
    const calls = stub([{ ok: false, body: { detail: "A Shopee não deixou ler esse link automaticamente. Anexe as imagens (ou um .zip) do produto." } }, { ok: true, body: { title: "", images: [{ name: "x", image: img }] } }]);
    render(<ShopeeImport onUse={() => {}} />);
    await userEvent.type(screen.getByLabelText("Link do produto da Shopee"), "https://shopee.com.br/x");
    await userEvent.click(screen.getByRole("button", { name: /Buscar imagens/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Anexe as imagens");
    const input = screen.getByLabelText("Anexar imagens ou ZIP do produto") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["z"], "fotos.zip", { type: "application/zip" })] } });
    expect(await screen.findByLabelText("Foto 1 (escolhida)")).toBeInTheDocument();
    expect((calls[1].body as FormData).getAll("files")).toHaveLength(1);
  });
});

describe("ShopeeImport · pela extensão", () => {
  it("lê as fotos no navegador da pessoa e manda só os endereços ao servidor", async () => {
    bridge.read.mockResolvedValue({ ok: true, title: "Bola PIC", videos: [], images: ["https://down-br.img.susercontent.com/file/br-1-aaaaaaaaaaaaaaaaaaaa", "https://down-br.img.susercontent.com/file/br-1-bbbbbbbbbbbbbbbbbbbb"] });
    const calls = stub([{ ok: true, body: { title: "Bola PIC", seller_gallery: true, images: [{ name: "a", image: img }] } }]);
    render(<ShopeeImport onUse={() => {}} />);
    await userEvent.type(screen.getByLabelText("Link do produto da Shopee"), "https://shopee.com.br/Bola-i.1.2");
    await userEvent.click(screen.getByRole("button", { name: /Buscar imagens/ }));
    expect(await screen.findByText("Bola PIC")).toBeInTheDocument();
    const form = calls[0].body as FormData;
    expect(form.getAll("image_urls")).toHaveLength(2);
    expect(form.get("url")).toBeNull();
  });

  it("avisa quando a Shopee pede login no navegador", async () => {
    bridge.read.mockResolvedValue({ ok: false, error: "login" });
    render(<ShopeeImport onUse={() => {}} />);
    await userEvent.type(screen.getByLabelText("Link do produto da Shopee"), "https://shopee.com.br/Bola-i.1.2");
    await userEvent.click(screen.getByRole("button", { name: /Buscar imagens/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("pediu login");
  });
});
