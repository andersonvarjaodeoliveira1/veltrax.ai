import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { JoinGuide } from "./join-guide";

it("lista a ordem das cenas, os takes de cada uma e a copy", () => {
  render(<JoinGuide videos={[{ label: "Vídeo 01", scenes: [{ n: "01", files: ["Video01_Cena01.mp4", "Video01_Cena01_Take2.mp4"] }, { n: "02", files: ["Video01_Cena02.mp4"] }] }]} copy="Minha copy" />);
  expect(screen.getByText("1º")).toBeTruthy();
  expect(screen.getByText(/escolha um: Video01_Cena01.mp4 · Video01_Cena01_Take2.mp4/)).toBeTruthy();
  expect(screen.getByText("Video01_Cena02.mp4")).toBeTruthy();
  expect(screen.getByText("Minha copy")).toBeTruthy();
  expect(screen.getByText("Baixar .txt")).toBeTruthy();
});

it("não mostra nada sem cenas nem copy", () => {
  const { container } = render(<JoinGuide videos={[]} copy="" />);
  expect(container.firstChild).toBeNull();
});
