import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LoadingTips } from "./loading-tips";

afterEach(() => vi.useRealTimers());

describe("LoadingTips", () => {
  it("mostra os textos da imagem e vai passando para o próximo", () => {
    vi.useFakeTimers();
    render(<LoadingTips label="Entendendo a imagem de referência" />);
    expect(screen.getByTestId("loading-tips")).toHaveTextContent("Olhando a foto do produto");
    act(() => { vi.advanceTimersByTime(2900); });
    expect(screen.getByTestId("loading-tips")).toHaveTextContent("Identificando cor, formato e rótulo");
  });
  it("usa textos do vídeo quando é vídeo", () => {
    render(<LoadingTips label="Entendendo o vídeo de referência" />);
    expect(screen.getByTestId("loading-tips")).toHaveTextContent("Ouvindo o vídeo de referência");
  });
});
