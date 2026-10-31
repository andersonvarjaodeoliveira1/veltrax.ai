import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { fakeAiExtension } from "@/test/fake-ai-extension";
import { AccountAiCheck } from "./account-ai-check";

let ext: ReturnType<typeof fakeAiExtension>;
const stubStatus = (ready: boolean) => vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ready }), { status: 200 })));
beforeEach(() => stubStatus(true));
afterEach(() => { cleanup(); ext?.stop(); vi.unstubAllGlobals(); });

it("tudo certo: os quatro passos ficam ok e o teste real é feito", async () => {
  ext = fakeAiExtension({ probe: "ready", answer: { ok: true, text: "OK" } });
  render(<AccountAiCheck site="gemini" />);
  await userEvent.setup().click(screen.getByRole("button", { name: /Verificar minha conta do Gemini/ }));
  expect(await screen.findByText(/Pode gerar pela sua conta/)).toBeInTheDocument();
  expect(ext.asked[0]?.site).toBe("gemini");
});

it("sem extensão: para no primeiro passo e diz como resolver", async () => {
  ext = fakeAiExtension({ hello: false });
  render(<AccountAiCheck site="chatgpt" />);
  await userEvent.setup().click(screen.getByRole("button", { name: /Verificar minha conta do ChatGPT/ }));
  expect(await screen.findByText(/Não detectei a extensão/, undefined, { timeout: 4000 })).toBeInTheDocument();
  expect(ext.asked).toHaveLength(0);
}, 8000);

it("sem login no site: para no segundo passo", async () => {
  ext = fakeAiExtension({ probe: "login" });
  render(<AccountAiCheck site="claude" />);
  await userEvent.setup().click(screen.getByRole("button", { name: /Verificar minha conta do Claude/ }));
  expect(await screen.findByText(/você não entrou na conta/)).toBeInTheDocument();
  expect(ext.asked).toHaveLength(0);
});

it("relay desligado no servidor: avisa para deixar a aba aberta", async () => {
  stubStatus(false);
  ext = fakeAiExtension({ probe: "ready" });
  render(<AccountAiCheck site="gemini" />);
  await userEvent.setup().click(screen.getByRole("button", { name: /Verificar minha conta do Gemini/ }));
  expect(await screen.findByText(/não vê a sua conta ligada/)).toBeInTheDocument();
  expect(ext.asked).toHaveLength(0);
});

it("o teste real falha: mostra o motivo e o botão do relatório", async () => {
  ext = fakeAiExtension({ probe: "ready", answer: { ok: false, error: "blocked" } });
  render(<AccountAiCheck site="gemini" />);
  await userEvent.setup().click(screen.getByRole("button", { name: /Verificar minha conta do Gemini/ }));
  expect(await screen.findByText(/captcha/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Copiar relatório/ })).toBeInTheDocument();
});
