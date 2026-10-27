import { describe, expect, it, vi } from "vitest";
import { normalizeShopeeUrl, readShopeeViaExtension } from "./shopee-bridge";

function fromExtension(data: Record<string, unknown>) {
  window.dispatchEvent(new MessageEvent("message", { data: { source: "clipgringa-flow", ...data }, source: window, origin: window.location.origin }));
}

describe("shopee-bridge", () => {
  it("aceita só endereços da Shopee em https", () => {
    expect(normalizeShopeeUrl("shopee.com.br/Bola-i.1.2")).toBe("https://shopee.com.br/Bola-i.1.2");
    expect(normalizeShopeeUrl("https://s.shopee.com.br/abc")).toContain("s.shopee.com.br");
    expect(normalizeShopeeUrl("https://shopee.com.br.evil.com/x")).toBeNull();
    expect(normalizeShopeeUrl("http://shopee.com.br/x")).toBeNull();
    expect(normalizeShopeeUrl("https://tiktok.com/x")).toBeNull();
    expect(normalizeShopeeUrl("")).toBeNull();
  });

  it("devolve o resultado da extensão", async () => {
    const posted: { type: string; id: string; url: string }[] = [];
    const spy = vi.spyOn(window, "postMessage").mockImplementation(((data: { type: string; id: string; url: string }) => { posted.push(data); }) as never);
    const promise = readShopeeViaExtension("https://shopee.com.br/x");
    const request = posted[0];
    expect(request.type).toBe("shopee-read");
    fromExtension({ type: "shopee-ack", id: request.id });
    fromExtension({ type: "shopee-result", id: request.id, data: { ok: true, title: "Bola", videos: [{ url: "https://a/b.mp4", poster: "" }], images: ["https://a/c.jpg"] } });
    expect(await promise).toEqual({ ok: true, title: "Bola", videos: [{ url: "https://a/b.mp4", poster: "" }], images: ["https://a/c.jpg"] });
    spy.mockRestore();
  });

  it("avisa que a extensão não está instalada quando ninguém responde", async () => {
    const spy = vi.spyOn(window, "postMessage").mockImplementation((() => {}) as never);
    expect(await readShopeeViaExtension("https://shopee.com.br/x")).toEqual({ ok: false, error: "no-extension" });
    spy.mockRestore();
  });
});

describe("expandShopeeLink", () => {
  it("troca o link curto pelo link do produto", async () => {
    const { expandShopeeLink } = await import("./shopee-bridge");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ url: "https://shopee.com.br/product/1407654055/58219994665" }), { status: 200 })));
    expect(await expandShopeeLink("https://s.shopee.com.br/6VOxfMfRjm")).toBe("https://shopee.com.br/product/1407654055/58219994665");
    vi.unstubAllGlobals();
  });
  it("não chama o servidor para link normal e mantém o link se falhar", async () => {
    const { expandShopeeLink } = await import("./shopee-bridge");
    const fetchMock = vi.fn(async () => new Response("{}", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await expandShopeeLink("https://shopee.com.br/Bola-i.1.2")).toBe("https://shopee.com.br/Bola-i.1.2");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await expandShopeeLink("https://shope.ee/abc")).toBe("https://shope.ee/abc");
    vi.unstubAllGlobals();
  });
});
