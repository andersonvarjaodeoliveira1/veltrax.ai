import { afterEach, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { OPEN_ACCOUNT_AI_EVENT } from "@/lib/account-ai";
import { act, cleanup, render, screen } from "@testing-library/react";
import { AiProblemDialog } from "./ai-problem-dialog";

afterEach(() => cleanup());

it("abre a janela explicando que a conta da OpenAI está sem créditos", async () => {
  render(<AiProblemDialog />);
  act(() => { window.dispatchEvent(new CustomEvent("gv-ai-problem", { detail: { kind: "no_credits", provider: "openai" } })); });
  const box = await screen.findByTestId("ai-problem");
  expect(box).toHaveTextContent("saldo da sua chave da OpenAI (ChatGPT) acabou");
  expect(box).toHaveTextContent("assinatura do ChatGPT");
  expect(screen.getByRole("link", { name: "Colocar saldo na OpenAI (ChatGPT)" })).toHaveAttribute("href", expect.stringContaining("platform.openai.com"));
});

it("cada opção traz o seu próprio botão", async () => {
  render(<AiProblemDialog />);
  act(() => { window.dispatchEvent(new CustomEvent("gv-ai-problem", { detail: { kind: "no_credits", provider: "openai" } })); });
  const box = await screen.findByTestId("ai-problem");
  expect(box).toHaveTextContent("Opção 1");
  expect(box).toHaveTextContent("Opção 3");
  expect(screen.getByRole("link", { name: "Pegar chave do Gemini" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Abrir Minhas APIs" })).toHaveAttribute("href", "/minhas-apis");
  expect(screen.getByRole("link", { name: "Chamar o administrador" })).toBeInTheDocument();
});

it("a primeira opção conecta a conta de IA do navegador, sem chave", async () => {
  const opened = vi.fn();
  window.addEventListener(OPEN_ACCOUNT_AI_EVENT, opened);
  render(<AiProblemDialog />);
  act(() => { window.dispatchEvent(new CustomEvent("gv-ai-problem", { detail: { kind: "no_credits", provider: "openai" } })); });
  await screen.findByTestId("ai-problem");
  const first = screen.getByText(/Opção 1/).closest("li") as HTMLElement;
  expect(first).toHaveTextContent("Usar a sua conta do ChatGPT, Gemini ou Claude");
  await userEvent.click(screen.getByRole("button", { name: "Conectar minha conta" }));
  expect(opened).toHaveBeenCalled();
  expect(screen.queryByTestId("ai-problem")).toBeNull();
  window.removeEventListener(OPEN_ACCOUNT_AI_EVENT, opened);
});
