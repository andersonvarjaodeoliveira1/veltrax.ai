import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ReferenceSummary } from "./reference-summary";

describe("ReferenceSummary", () => {
  it("não mostra nada sem vídeo e sem copy", () => {
    const { container } = render(<ReferenceSummary file={null} transcript="" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("mostra a copy e copia com um clique", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<ReferenceSummary file={null} transcript={"Olha isso\nVocê precisa ver"} />);
    expect(screen.getByText(/Você precisa ver/)).toBeInTheDocument();
    expect(screen.getByText(/5 palavras/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Copiar/ }));
    expect(writeText).toHaveBeenCalledWith("Olha isso\nVocê precisa ver");
    expect(await screen.findByText("Copiado")).toBeInTheDocument();
  });

  it("avisa que ainda está lendo só enquanto a leitura roda", () => {
    render(<ReferenceSummary file={new File(["x"], "a.mp4", { type: "video/mp4" })} transcript="" reading />);
    expect(screen.getByText(/Ainda lendo o que é dito/)).toBeInTheDocument();
  });

  it("vídeo sem fala mostra o aviso no próprio card, sem ficar lendo para sempre", () => {
    render(<ReferenceSummary file={new File(["x"], "a.mp4", { type: "video/mp4" })} transcript="" noSpeech />);
    expect(screen.queryByText(/Ainda lendo/)).not.toBeInTheDocument();
    expect(screen.getByText(/Não encontrei fala nesse vídeo/)).toBeInTheDocument();
  });
});
