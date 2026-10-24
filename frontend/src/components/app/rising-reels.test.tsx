import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { RisingReels } from "./rising-reels";

afterEach(() => cleanup());
const H = 3_600_000;

it("mostra o reel que subiu e explica quando ainda não há leitura", () => {
  const { rerender } = render(<RisingReels pages={[{ name: "Pág", url: "u" }]} />);
  expect(screen.getByTestId("rising-reels")).toHaveTextContent(/Nenhum reel lido ainda/);
  rerender(<RisingReels pages={[{ name: "Concorrente X", url: "u2", spy: true, reels: { "77": { f: 0, h: [[0, 1000], [5 * H, 13000]] } } }]} />);
  const item = screen.getByTestId("rising-item");
  expect(item).toHaveTextContent("Concorrente X");
  expect(item).toHaveTextContent(/\+12 mil em 5 h/);
  expect(screen.getByRole("link", { name: "Abrir o reel" })).toHaveAttribute("href", "https://www.facebook.com/reel/77");
});
