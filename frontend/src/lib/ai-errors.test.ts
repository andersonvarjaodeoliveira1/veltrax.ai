import { expect, it, vi } from "vitest";
import { aiErrorText, aiProblemOf } from "./ai-errors";

it("explica quando a falha é da API, da chave ou do limite", () => {
  expect(aiErrorText("AI_KEY_INVALID")).toMatch(/recusou a chave/);
  expect(aiErrorText("AI_NO_CREDITS:openai")).toMatch(/OpenAI.*sem créditos/);
  expect(aiErrorText("AI_KEY_INVALID:anthropic")).toMatch(/recusou a chave/);
  expect(aiErrorText("AI_QUOTA")).toMatch(/limite de uso/);
  expect(aiErrorText("TOKENS_EXHAUSTED")).toMatch(/Minhas APIs/);
  expect(aiErrorText("Could not generate this step. Try again.")).toMatch(/API/);
  expect(aiErrorText("outra coisa")).toBeNull();
  expect(aiErrorText(undefined)).toBeNull();
});

it("abre o aviso em janela quando a falha é da conta/chave da pessoa", () => {
  const seen: unknown[] = [];
  const on = (event: Event) => seen.push((event as CustomEvent).detail);
  window.addEventListener("gv-ai-problem", on);
  vi.spyOn(Date, "now").mockReturnValue(4_000_000_000_000);
  aiErrorText("AI_NO_CREDITS:openai");
  vi.spyOn(Date, "now").mockReturnValue(4_000_000_010_000);
  aiErrorText("AI_ACCOUNT:gemini:login");
  window.removeEventListener("gv-ai-problem", on);
  vi.restoreAllMocks();
  expect(seen).toEqual([{ kind: "no_credits", provider: "openai" }, { kind: "account", provider: "gemini", reason: "login" }]);
  expect(aiProblemOf("AI_QUOTA")).toEqual({ kind: "quota", provider: "" });
});

it("explica o motivo quando a geração pela conta (extensão) falha", () => {
  expect(aiErrorText("AI_ACCOUNT:chatgpt:login")).toMatch(/logado no ChatGPT/);
  expect(aiErrorText("AI_ACCOUNT:claude:timeout")).toMatch(/Claude demorou/);
  expect(aiErrorText("AI_ACCOUNT:gemini:blocked")).toMatch(/verificação/);
});
