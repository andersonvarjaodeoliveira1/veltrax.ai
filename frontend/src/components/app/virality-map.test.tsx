import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { server } from "@/test/setup";
import { ViralityPreview } from "./virality-map";

const region = (score: number, note = "nota") => ({ score, note });
const result = {
  score: 62, hold_rate: 45,
  regions: { attention: region(80, "Abre com pergunta"), emotion: region(60), memory: region(30, "Falta uma frase para repetir"), language: region(70), vision: region(50), sound: region(50) },
  strongest_line: "Yawning cools the brain.", drops: [{ quote: "in three steps", why: "Vira aula.", fix: "Corte." }],
  fixes: ["Comece pela pergunta"], better_hook: "Why do you yawn?", trending: ["Pergunta rápida"], verdict: "Arrume o meio.",
};

describe("Prévia de viralização", () => {
  it("não aparece sem roteiro", () => {
    const { container } = render(<ViralityPreview script="curto" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("mostra a nota, o mapa e abre na área mais fraca", async () => {
    let sent: Record<string, string> = {};
    server.use(http.post("/api/multiplier/clone/virality", async ({ request }) => { sent = (await request.json()) as Record<string, string>; return HttpResponse.json(result); }));
    render(<ViralityPreview script="Yawning cools the brain. Here is how it works." niche="Saúde" />);
    await userEvent.click(screen.getByRole("button", { name: "Prever viralização" }));
    expect(await screen.findByText("62")).toBeInTheDocument();
    expect(sent.niche).toBe("Saúde");
    expect(screen.getByRole("img", { name: "Mapa de viralização, nota 62 de 100" })).toBeInTheDocument();
    expect(screen.getByText("Falta uma frase para repetir")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Atenção, 80 de 100, Forte" }));
    expect(screen.getByText("Abre com pergunta")).toBeInTheDocument();
    expect(screen.getByText("Why do you yawn?")).toBeInTheDocument();
    expect(screen.getByText(/não é garantia/)).toBeInTheDocument();
  });

  it("avisa quando a análise falha", async () => {
    server.use(http.post("/api/multiplier/clone/virality", () => HttpResponse.json({ detail: "x" }, { status: 500 })));
    render(<ViralityPreview script="Yawning cools the brain. Here is how it works." />);
    await userEvent.click(screen.getByRole("button", { name: "Prever viralização" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível analisar agora");
  });
});
