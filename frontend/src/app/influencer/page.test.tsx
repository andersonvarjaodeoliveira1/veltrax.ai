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

  it("quando a busca automática falha, leva ao Pinterest já com a busca", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (String(url).includes("influencer-profile")) return new Response(JSON.stringify({ name: "Marta", age: "50", look: "loira", setting: "cozinha", searches: ["mulher loira 50 anos"] }), { status: 200 });
      return new Response(JSON.stringify({ detail: "x" }), { status: 502 });
    }));
    render(<InfluencerPage />);
    fireEvent.change(screen.getByLabelText("Anúncio ou descrição da pessoa"), { target: { value: "Mulher loira de 50 anos na cozinha" } });
    fireEvent.click(screen.getByRole("button", { name: /Descobrir a pessoa/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Buscar fotos automaticamente/ }));
    const open = await screen.findByRole("link", { name: /Abrir o Pinterest com a busca/ });
    expect(open.getAttribute("href")).toContain("q=mulher%20loira%2050%20anos");
    expect(screen.getByTestId("photo-drop")).toBeInTheDocument();
  });

  it("monta o storyboard e mostra o gasto estimado em créditos", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (String(url).includes("influencer-profile")) return new Response(JSON.stringify({ name: "Marta", age: "50", look: "loira", setting: "cozinha", searches: ["x"] }), { status: 200 });
      return new Response(JSON.stringify({ scenes: [{ line: "Eu não dormia", what: "Ela fala" }, { line: "Até testar", what: "Mostra" }], imagePrompts: ["i1", "i2"], videoPrompts: ["v1", "v2"] }), { status: 200 });
    }));
    render(<InfluencerPage />);
    const copy = "Esta melatonina natural que não se acha na farmácia me fez parar de acordar no meio da noite e ninguém fala sobre isso. Até dois meses atrás eu achava normal ficar cansada o dia todo e depender de café para fazer qualquer coisa.";
    fireEvent.change(screen.getByLabelText("Anúncio ou descrição da pessoa"), { target: { value: copy } });
    fireEvent.click(screen.getByRole("button", { name: /Descobrir a pessoa/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Montar o storyboard/ }));
    expect(await screen.findByTestId("storyboard")).toHaveTextContent("Eu não dormia");
    expect(screen.getByText(/gasto estimado/)).toHaveTextContent(/créditos do seu Flow/);
    expect(screen.getByRole("button", { name: /Copiar pacote e abrir o Flow/ })).toBeInTheDocument();
  });

  it("envia produto, ângulo e idioma ao montar o storyboard", async () => {
    let body: Record<string, unknown> = {};
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes("influencer-profile")) return new Response(JSON.stringify({ name: "Marta", age: "50", look: "loira", setting: "cozinha", searches: ["x"] }), { status: 200 });
      if (String(url).includes("product-look")) return new Response(JSON.stringify({ look: "dark blue jar with a white lid" }), { status: 200 });
      if (String(url).includes("influencer-storyboard")) { body = JSON.parse(String(init?.body)); return new Response(JSON.stringify({ scenes: [{ line: "a", what: "b" }], imagePrompts: ["i"], videoPrompts: ["v"] }), { status: 200 }); }
      return new Response(JSON.stringify({ pins: [] }), { status: 200 });
    }));
    render(<InfluencerPage />);
    fireEvent.change(screen.getByLabelText("Anúncio ou descrição da pessoa"), { target: { value: "Mulher loira de 50 anos na cozinha mostrando o produto" } });
    fireEvent.click(screen.getByRole("button", { name: /Descobrir a pessoa/ }));
    await screen.findByTestId("product-block");
    fireEvent.change(screen.getByLabelText("Fotos do produto"), { target: { files: [new File(["x"], "p.png", { type: "image/png" })] } });
    expect(await screen.findByDisplayValue(/dark blue jar/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Pergunta" }));
    fireEvent.click(screen.getByRole("radio", { name: "Inglês" }));
    fireEvent.click(screen.getByRole("button", { name: /Montar o storyboard/ }));
    await waitFor(() => expect(body.angle).toBe("question"));
    expect(body.language).toBe("en");
    expect(body.product_look).toBe("dark blue jar with a white lid");
    expect(body.show_product).toBe(true);
  });

  it("mostra um erro simples quando a leitura falha", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ detail: "x" }), { status: 502 })));
    render(<InfluencerPage />);
    fireEvent.change(screen.getByLabelText("Anúncio ou descrição da pessoa"), { target: { value: "Mulher de 50 anos na cozinha" } });
    fireEvent.click(screen.getByRole("button", { name: /Descobrir a pessoa/ }));
    expect(await screen.findByText(/Não consegui ler o anúncio/)).toBeInTheDocument();
  });
});
