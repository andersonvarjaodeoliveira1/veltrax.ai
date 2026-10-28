import { expect, it } from "vitest";
import { aiErrorText } from "./ai-errors";

it("explica quando a falha é da API, da chave ou do limite", () => {
  expect(aiErrorText("AI_KEY_INVALID")).toMatch(/recusou a chave/);
  expect(aiErrorText("AI_QUOTA")).toMatch(/limite de uso/);
  expect(aiErrorText("TOKENS_EXHAUSTED")).toMatch(/Minhas APIs/);
  expect(aiErrorText("Could not generate this step. Try again.")).toMatch(/API/);
  expect(aiErrorText("outra coisa")).toBeNull();
  expect(aiErrorText(undefined)).toBeNull();
});
