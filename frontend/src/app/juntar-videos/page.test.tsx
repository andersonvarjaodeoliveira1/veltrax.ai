import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import JoinVideosPage from "./page";

it("mostra o passo a passo e começa pelo passo 1", () => {
  render(<JoinVideosPage />);
  expect(screen.getByLabelText("Passo a passo")).toBeTruthy();
  expect(screen.getByText("Passo 1 · Escolha os vídeos")).toBeTruthy();
  expect(screen.getByLabelText("Escolher vídeos")).toBeTruthy();
});
