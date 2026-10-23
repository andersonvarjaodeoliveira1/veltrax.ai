import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import InfluencerPage from "./page";

beforeEach(() => window.localStorage.clear());
afterEach(() => vi.restoreAllMocks());

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
const BRIEF = { persona: { name: "Bia", age: "22 anos", look: "loira", setting: "quarto" }, searches: ["loira 22 anos"], copy: "Fala de teste longa o bastante para o vídeo." };

function mockApi(extra: Record<string, (body: unknown) => Response> = {}, bodies: Record<string, unknown>[] = []) {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : init?.body;
    if (u.includes("influencer-brief")) {
      bodies.push(body as Record<string, unknown>);
      if (extra.brief) return extra.brief(body);
      return json(BRIEF);
    }
    if (u.includes("influencer-pins")) return json({ pins: [{ id: "1", thumb: "https://i.pinimg.com/474x/a.jpg", full: "https://i.pinimg.com/736x/a.jpg" }] });
    if (u.includes("influencer-prompt")) return json({ prompts: ["POV selfie. visible pores"], summaries: ["Selfie realista da Bia"] });
    if (u.includes("influencer-storyboard")) { bodies.push(body as Record<string, unknown>); return json({ scenes: [{ line: "Eu não dormia", what: "x" }], imagePrompts: ["i"], videoPrompts: ["v"] }); }
    return json({});
  }));
}

async function noProduct() {
  fireEvent.click(await screen.findByRole("button", { name: "Não tenho" }));
}

async function sendPrompt(text = "Gere uma influencer de 22 anos loira vendendo roupas") {
  fireEvent.change(screen.getByLabelText("Descreva a influencer"), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "Criar a influencer" }));
}

describe("Criar influencer em chat", () => {
  it("abre com a pergunta inicial, exemplos e a caixa de mensagem", () => {
    mockApi();
    render(<InfluencerPage />);
    expect(screen.getByRole("heading", { name: "O que vamos criar hoje?" })).toBeInTheDocument();
    expect(screen.getByTestId("influencer-examples")).toBeInTheDocument();
    expect(screen.getByTestId("chat-composer")).toBeInTheDocument();
    expect(screen.queryByText(/XP|Missão|Etapa/)).toBeNull();
  });

  it("clicar em Recriar preenche o pedido e o nicho", () => {
    mockApi();
    render(<InfluencerPage />);
    fireEvent.click(screen.getAllByRole("button", { name: /Recriar/ })[0]);
    expect((screen.getByLabelText("Descreva a influencer") as HTMLTextAreaElement).value.length).toBeGreaterThan(10);
  });

  it("pergunta, pede aprovação, mostra fotos e escreve o prompt em português", async () => {
    const bodies: Record<string, unknown>[] = [];
    mockApi({ brief: (body) => ((body as { answers?: unknown }).answers ? json(BRIEF) : json({ questions: [{ question: "Qual estilo?", options: [{ label: "Casual" }, { label: "Chique" }, { label: "Esportivo" }] }] })) }, bodies);
    render(<InfluencerPage />);
    fireEvent.click(within(screen.getByRole("group", { name: "Nicho (opcional)" })).getByRole("button", { name: /Shopee/ }));
    await sendPrompt();
    await noProduct();
    fireEvent.click(await screen.findByRole("radio", { name: /Casual/ }));
    fireEvent.click(screen.getByRole("button", { name: /Continuar/ }));
    expect(await screen.findByTestId("chat-approval")).toHaveTextContent("Bia");
    expect(bodies[0].skill).toBe("shopee");
    expect(bodies[0].language).toBe("pt");
    fireEvent.click(screen.getByRole("button", { name: /^Aprovar/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Aprovar 1/ }));
    expect(await screen.findByText(/Selfie realista da Bia/)).toBeInTheDocument();
    expect(screen.getByText(/visible pores/)).toBeInTheDocument();
  });

  it("escolhe quantos vídeos, mostra o gasto e monta um storyboard por vídeo", async () => {
    const bodies: Record<string, unknown>[] = [];
    mockApi({}, bodies);
    render(<InfluencerPage />);
    await sendPrompt();
    fireEvent.click(within(await screen.findByTestId("chat-niche")).getByRole("button", { name: /Nutra/ }));
    await noProduct();
    fireEvent.click(await screen.findByRole("button", { name: /^Aprovar/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Seguir sem foto" }));
    fireEvent.click(await screen.findByRole("button", { name: /Fazer os vídeos/ }));
    fireEvent.click(screen.getByRole("radio", { name: /^2 vídeos/ }));
    fireEvent.click(await screen.findByRole("radio", { name: /Lite · 10 créditos por cena/ }));
    expect(await screen.findByTestId("video-approval")).toHaveTextContent("80 créditos");
    fireEvent.click(screen.getByRole("button", { name: /^Aprovar/ }));
    expect(await screen.findByRole("tab", { name: "Vídeo 2" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Copiar pacote e abrir o Flow/ })).toBeInTheDocument();
    await waitFor(() => expect(bodies.filter((b) => "scene_count" in b).length).toBe(2));
    expect(bodies.filter((b) => "scene_count" in b)[0].language).toBe("pt-BR");
  });

  it("mostra erro simples quando a IA falha", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ detail: "x" }, 502)));
    render(<InfluencerPage />);
    await sendPrompt();
    fireEvent.click(within(await screen.findByTestId("chat-niche")).getByRole("button", { name: /Nutra/ }));
    await noProduct();
    expect(await screen.findByRole("alert")).toHaveTextContent(/Algo deu errado/);
  });

  it("pergunta o nicho e a foto ou o link do produto, e coloca no prompt", async () => {
    const bodies: Record<string, unknown>[] = [];
    mockApi({}, bodies);
    render(<InfluencerPage />);
    await sendPrompt();
    expect(await screen.findByTestId("chat-niche")).toBeInTheDocument();
    fireEvent.click(within(screen.getByTestId("chat-niche")).getByRole("button", { name: /Dropshipping/ }));
    expect(await screen.findByTestId("chat-product")).toHaveTextContent(/foto do produto ou o link/);
    fireEvent.click(screen.getByRole("button", { name: "Colar o link" }));
    fireEvent.change(screen.getByLabelText("Colar o link", { selector: "input" }), { target: { value: "https://loja.com/produto" } });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar" }));
    expect(await screen.findByTestId("chat-approval")).toBeInTheDocument();
    expect(String(bodies[0].prompt)).toContain("https://loja.com/produto");
    expect(bodies[0].skill).toBe("dropshipping");
  });
});
