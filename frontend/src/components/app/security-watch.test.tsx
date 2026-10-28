import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SecurityWatch, looksAutomated } from "./security-watch";

afterEach(() => vi.unstubAllGlobals());

function stub(sequence: { strikes: number; blocked: boolean }[]) {
  let i = 0;
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (String(url).includes("/status")) return new Response(JSON.stringify({ strikes: 0, blocked: false, limit: 2 }));
    const next = sequence[Math.min(i, sequence.length - 1)]; i += 1;
    return new Response(JSON.stringify({ ok: true, ...next, limit: 2 }));
  }));
}

it("1ª tentativa mostra o aviso amarelo, 2ª bloqueia e manda falar no WhatsApp", async () => {
  stub([{ strikes: 1, blocked: false }, { strikes: 2, blocked: true }]);
  render(<SecurityWatch enabled />);
  fireEvent.keyDown(document, { key: "F12" });
  expect(await screen.findByTestId("security-warn")).toHaveTextContent("Se isso acontecer de novo");
  await new Promise((r) => setTimeout(r, 3100));
  fireEvent.keyDown(document, { key: "u", ctrlKey: true });
  const block = await screen.findByTestId("security-block");
  expect(block).toHaveTextContent("Atividade incomum detectada");
  expect(screen.getByRole("link", { name: /Falar com o Anderson/ })).toHaveAttribute("href", expect.stringContaining("5511913142143"));
}, 10000);

it("conta já bloqueada no servidor mostra o bloqueio ao abrir", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ strikes: 2, blocked: true, limit: 2 }))));
  render(<SecurityWatch enabled />);
  await waitFor(() => expect(screen.getByTestId("security-block")).toBeInTheDocument());
});

it("administrador (enabled=false) nunca é avisado nem bloqueado", () => {
  stub([{ strikes: 2, blocked: true }]);
  render(<SecurityWatch enabled={false} />);
  fireEvent.keyDown(document, { key: "F12" });
  expect(screen.queryByTestId("security-block")).toBeNull();
});

it("reconhece navegador automatizado", () => {
  expect(looksAutomated({ webdriver: true, userAgent: "x" })).toBe(true);
  expect(looksAutomated({ userAgent: "Mozilla HeadlessChrome/120" })).toBe(true);
  expect(looksAutomated({ webdriver: false, userAgent: "Mozilla/5.0 Chrome" })).toBe(false);
});
