import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { fakeAiExtension } from "@/test/fake-ai-extension";
import { writeChoice } from "@/lib/account-ai";

const toast = vi.hoisted(() => ({ message: vi.fn(), warning: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import { AccountAiRelay } from "./account-ai-relay";

let ext: ReturnType<typeof fakeAiExtension>;
beforeEach(() => { window.localStorage.clear(); toast.message.mockClear(); toast.warning.mockClear(); });
afterEach(() => { cleanup(); ext?.stop(); vi.unstubAllGlobals(); window.localStorage.clear(); });

function server(jobs: { id: string; prompt: string }[]) {
  const posted: { url: string; body: Record<string, unknown> }[] = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    posted.push({ url: String(url), body });
    if (String(url).endsWith("/poll")) {
      const job = jobs.shift() ?? null;
      if (!job) await new Promise((r) => setTimeout(r, 40));
      return new Response(JSON.stringify({ job }), { status: 200 });
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return posted;
}

it("entrega o pedido do servidor à extensão e devolve a resposta da conta", async () => {
  ext = fakeAiExtension({ answer: { ok: true, text: '{"hooks":["a"]}' } });
  const posted = server([{ id: "j1", prompt: "Escreva ganchos" }]);
  writeChoice("gemini");
  render(<AccountAiRelay />);
  await waitFor(() => expect(posted.some((p) => p.url.endsWith("/result"))).toBe(true), { timeout: 4000 });
  expect(ext.asked).toEqual([{ site: "gemini", prompt: "Escreva ganchos" }]);
  expect(posted.find((p) => p.url.endsWith("/result"))?.body).toMatchObject({ id: "j1", text: '{"hooks":["a"]}', error: "" });
  expect(posted.find((p) => p.url.endsWith("/poll"))?.body).toMatchObject({ site: "gemini" });
});

it("avisa o servidor quando a conta não está logada", async () => {
  ext = fakeAiExtension({ answer: { ok: false, error: "login" } });
  const posted = server([{ id: "j2", prompt: "x" }]);
  writeChoice("chatgpt");
  render(<AccountAiRelay />);
  await waitFor(() => expect(posted.some((p) => p.url.endsWith("/result"))).toBe(true), { timeout: 4000 });
  expect(posted.find((p) => p.url.endsWith("/result"))?.body).toMatchObject({ id: "j2", text: "", error: "login" });
});

it("não busca pedidos quando a pessoa não escolheu uma conta", async () => {
  ext = fakeAiExtension();
  const posted = server([]);
  render(<AccountAiRelay />);
  await new Promise((r) => setTimeout(r, 300));
  expect(posted).toHaveLength(0);
});

it("avisa por onde o texto saiu: API, conta ou créditos do plano", async () => {
  ext = fakeAiExtension();
  server([]);
  render(<AccountAiRelay />);
  const say = (path: string) => act(() => { window.dispatchEvent(new CustomEvent("gv-ai-path", { detail: path })); });
  say("api:claude");
  expect(toast.message).toHaveBeenLastCalledWith(expect.stringContaining("chave de API do Claude"), expect.anything());
  say("account:gemini");
  expect(toast.message).toHaveBeenLastCalledWith(expect.stringContaining("conta do Gemini"), expect.anything());
  say("plan");
  expect(toast.message).toHaveBeenLastCalledWith(expect.stringContaining("créditos do plano"), expect.anything());
});

it("alerta quando escolheu a conta mas o texto saiu pelo plano", async () => {
  ext = fakeAiExtension({ hello: false });
  server([]);
  writeChoice("claude");
  render(<AccountAiRelay />);
  act(() => { window.dispatchEvent(new CustomEvent("gv-ai-path", { detail: "plan" })); });
  expect(toast.warning).toHaveBeenCalledWith(expect.stringContaining("conta do Claude não respondeu"), expect.anything());
});
