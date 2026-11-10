import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { HelpBubbles } from "./help-bubbles";

vi.mock("next/navigation", () => ({ usePathname: () => "/list" }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

it("o assistente responde a dúvida e manda a página atual", async () => {
  const fetchMock = vi.fn(async () => json({ answer: "Abra Conectar ao Flow no menu." }));
  vi.stubGlobal("fetch", fetchMock);
  render(<HelpBubbles />);
  fireEvent.click(screen.getByRole("button", { name: /Tirar uma dúvida/ }));
  fireEvent.change(screen.getByLabelText("Sua dúvida"), { target: { value: "Como conecto o Flow?" } });
  fireEvent.keyDown(screen.getByLabelText("Sua dúvida"), { key: "Enter" });
  expect(await screen.findByText("Abra Conectar ao Flow no menu.")).toBeInTheDocument();
  const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe("/api/multiplier/clone/help-ask");
  expect(JSON.parse(String(init.body))).toMatchObject({ question: "Como conecto o Flow?", page: "/list" });
});

it("mostra um aviso amigável quando o assistente falha", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => json({ detail: "AI_QUOTA" }, 503)));
  render(<HelpBubbles />);
  fireEvent.click(screen.getByRole("button", { name: /Tirar uma dúvida/ }));
  fireEvent.change(screen.getByLabelText("Sua dúvida"), { target: { value: "oi" } });
  fireEvent.keyDown(screen.getByLabelText("Sua dúvida"), { key: "Enter" });
  expect(await screen.findByText(/Não consegui responder agora/)).toBeInTheDocument();
});

it("o relato exige e-mail válido e envia com telefone", async () => {
  const fetchMock = vi.fn(async () => json({ ok: true }));
  vi.stubGlobal("fetch", fetchMock);
  render(<HelpBubbles email="" />);
  fireEvent.click(screen.getByRole("button", { name: /Relatar erro/ }));
  fireEvent.change(screen.getByLabelText(/O que você fez/), { target: { value: "O botão não abre o Flow" } });
  fireEvent.click(screen.getByRole("button", { name: /Enviar por e-mail/ }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/e-mail válido/);
  expect(fetchMock).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Seu e-mail"), { target: { value: "a@b.com" } });
  fireEvent.change(screen.getByLabelText(/telefone/), { target: { value: "(11) 91234-5678" } });
  fireEvent.click(screen.getByRole("button", { name: /Enviar por e-mail/ }));
  await waitFor(() => expect(screen.getByText(/Recebemos/)).toBeInTheDocument());
  const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  expect(JSON.parse(String(init.body))).toMatchObject({ kind: "bug", email: "a@b.com", phone: "(11) 91234-5678", page: "/list" });
});

it("o relato também vai direto para o WhatsApp do administrador, com o texto pronto", () => {
  render(<HelpBubbles email="a@b.com" />);
  fireEvent.click(screen.getByRole("button", { name: /Relatar erro/ }));
  fireEvent.click(screen.getByRole("radio", { name: "Sugestão" }));
  fireEvent.change(screen.getByLabelText(/Qual é a sua ideia/), { target: { value: "Queria mais estilos de câmera" } });
  const link = screen.getByRole("link", { name: "Enviar pelo WhatsApp" });
  const href = link.getAttribute("href") ?? "";
  expect(href).toContain("https://wa.me/5511913142143?text=");
  expect(decodeURIComponent(href)).toContain("Queria mais estilos de câmera");
  expect(decodeURIComponent(href)).toContain("Sugestão");
});

it("não abre o WhatsApp com a mensagem vazia", () => {
  render(<HelpBubbles email="a@b.com" />);
  fireEvent.click(screen.getByRole("button", { name: /Relatar erro/ }));
  fireEvent.click(screen.getByRole("link", { name: "Enviar pelo WhatsApp" }));
  expect(screen.getByRole("alert")).toHaveTextContent(/pelo menos uma frase/);
});
