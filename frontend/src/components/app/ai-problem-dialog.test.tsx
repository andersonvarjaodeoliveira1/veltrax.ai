import { afterEach, expect, it } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { AiProblemDialog } from "./ai-problem-dialog";

afterEach(() => cleanup());

it("abre a janela explicando que a conta da OpenAI está sem créditos", async () => {
  render(<AiProblemDialog />);
  act(() => { window.dispatchEvent(new CustomEvent("gv-ai-problem", { detail: { kind: "no_credits", provider: "openai" } })); });
  const box = await screen.findByTestId("ai-problem");
  expect(box).toHaveTextContent("sem créditos");
  expect(box).toHaveTextContent("assinatura do ChatGPT");
  expect(screen.getByText("Abrir a conta no provedor")).toHaveAttribute("href", expect.stringContaining("platform.openai.com"));
});
