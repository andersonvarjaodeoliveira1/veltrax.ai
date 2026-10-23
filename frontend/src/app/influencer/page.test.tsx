import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import InfluencerPage from "./page";

afterEach(() => vi.restoreAllMocks());

describe("Criar influencer", () => {
  it("do anúncio à busca no Pinterest e aos prompts", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      calls.push(String(url));
      if (String(url).includes("influencer-profile")) {
        return new Response(JSON.stringify({ name: "Marta", age: "50 a 55 anos", look: "loira, cardigan bege", setting: "cozinha de casa", searches: ["mulher loira 50 anos selfie"] }), { status: 200 });
      }
      return new Response(JSON.stringify({ prompts: ["POV selfie of a woman. visible pores"] }), { status: 200 });
    }));
    render(<InfluencerPage />);
    expect(screen.queryByText(/Gerar prompts/)).toBeNull();
    fireEvent.change(screen.getByLabelText("Anúncio ou descrição da pessoa"), { target: { value: "Avatar: Mulher branca, loira, de +50 anos, na cozinha." } });
    fireEvent.click(screen.getByRole("button", { name: /Descobrir a pessoa/ }));
    const link = await screen.findByRole("link", { name: /mulher loira 50 anos selfie/ });
    expect(link.getAttribute("href")).toContain("pinterest.com/search/pins/?q=mulher%20loira");
    expect(screen.getByDisplayValue("Marta")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Gerar prompts$/ }));
    await waitFor(() => expect(screen.getByText(/POV selfie of a woman/)).toBeInTheDocument());
    expect(calls.some((url) => url.includes("influencer-prompt"))).toBe(true);
    expect(screen.getByTestId("flow-generate")).toHaveTextContent(/Conecte aqui/);
  });

  it("busca fotos no Pinterest e usa a escolhida", async () => {
    let promptBody: FormData | undefined;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes("influencer-profile")) return new Response(JSON.stringify({ name: "Marta", age: "50", look: "loira", setting: "cozinha", searches: ["mulher loira"] }), { status: 200 });
      if (String(url).includes("influencer-pins")) return new Response(JSON.stringify({ pins: [{ id: "1", thumb: "https://i.pinimg.com/474x/a.jpg", full: "https://i.pinimg.com/736x/a.jpg", link: "" }] }), { status: 200 });
      promptBody = init?.body as FormData;
      return new Response(JSON.stringify({ prompts: ["p. visible pores"] }), { status: 200 });
    }));
    render(<InfluencerPage />);
    fireEvent.change(screen.getByLabelText("Anúncio ou descrição da pessoa"), { target: { value: "Mulher loira de 50 anos na cozinha" } });
    fireEvent.click(screen.getByRole("button", { name: /Descobrir a pessoa/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Buscar fotos automaticamente/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Usar esta foto" }));
    fireEvent.click(screen.getByRole("button", { name: /Gerar prompts com a foto/ }));
    await waitFor(() => expect(promptBody?.get("image_url")).toBe("https://i.pinimg.com/736x/a.jpg"));
  });

  it("mostra um erro simples quando a leitura falha", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ detail: "x" }), { status: 502 })));
    render(<InfluencerPage />);
    fireEvent.change(screen.getByLabelText("Anúncio ou descrição da pessoa"), { target: { value: "Mulher de 50 anos na cozinha" } });
    fireEvent.click(screen.getByRole("button", { name: /Descobrir a pessoa/ }));
    expect(await screen.findByText(/Não consegui ler o anúncio/)).toBeInTheDocument();
  });
});
