import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { fakeAiExtension } from "@/test/fake-ai-extension";
import { OPEN_ACCOUNT_AI_EVENT, readChoice } from "@/lib/account-ai";
import { AccountAiSetup } from "./account-ai-setup";

let ext: ReturnType<typeof fakeAiExtension>;
beforeEach(() => { window.localStorage.clear(); vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ integrations: [] }), { status: 200 }))); });
afterEach(() => { cleanup(); ext?.stop(); vi.unstubAllGlobals(); window.localStorage.clear(); });

const openQuiz = () => act(() => { window.dispatchEvent(new Event(OPEN_ACCOUNT_AI_EVENT)); });

it("o quiz conecta a conta escolhida: detecta o login, testa e guarda a escolha", async () => {
  ext = fakeAiExtension({ probe: "ready", answer: { ok: true, text: "OK" } });
  render(<AccountAiSetup enabled />);
  openQuiz();
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: /^Gemini/ }));
  expect(await screen.findByTestId("account-ai-done", undefined, { timeout: 6000 })).toHaveTextContent("conta do Gemini está conectada");
  expect(ext.asked[0]?.site).toBe("gemini");
  expect(readChoice()?.site).toBe("gemini");
}, 15000);

it("enquanto a pessoa não entrou na conta, mostra o que falta e não guarda a escolha", async () => {
  ext = fakeAiExtension({ probe: "login" });
  render(<AccountAiSetup enabled />);
  openQuiz();
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: /^ChatGPT/ }));
  expect(await screen.findByTestId("account-ai-connect")).toHaveTextContent(/ainda não entrou na conta/);
  expect(screen.getByRole("link", { name: /Abrir o ChatGPT/ })).toHaveAttribute("href", expect.stringContaining("chatgpt.com"));
  expect(readChoice()).toBeNull();
});

it("mostra o motivo quando o teste falha e deixa tentar de novo", async () => {
  ext = fakeAiExtension({ probe: "ready", answer: { ok: false, error: "login" } });
  render(<AccountAiSetup enabled />);
  openQuiz();
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: /^Claude/ }));
  const fail = await screen.findByTestId("account-ai-fail", undefined, { timeout: 6000 });
  expect(fail).toHaveTextContent("Você não está logado no Claude");
  expect(screen.getByRole("button", { name: "Tentar de novo" })).toBeInTheDocument();
  expect(readChoice()).toBeNull();
}, 15000);

it("quem tem chave de API só registra a escolha, sem conectar conta", async () => {
  ext = fakeAiExtension();
  render(<AccountAiSetup enabled />);
  openQuiz();
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: /Tenho chave de API/ }));
  expect(readChoice()?.site).toBe("api");
  await waitFor(() => expect(screen.queryByTestId("account-ai-setup")).not.toBeInTheDocument());
});

it("sem a extensão nova, pede para instalar ou atualizar", async () => {
  ext = fakeAiExtension({ hello: false });
  render(<AccountAiSetup enabled />);
  openQuiz();
  expect(await screen.findByTestId("account-ai-noext", undefined, { timeout: 5000 })).toHaveTextContent("1.16.0");
}, 10000);
