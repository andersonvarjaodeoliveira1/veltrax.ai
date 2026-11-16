import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { TakesPanel } from "./takes-panel";
import { saveRecipe } from "@/lib/winner-recipe";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.localStorage.clear(); });

function stubTakes() {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    if (url.endsWith("/takes")) return new Response(JSON.stringify({ takes: [
      { id: "t1", idx: 0, hook_title: "O erro que seca a pele", duration: 16, score: 0.8, in_recipe: true },
      { id: "t2", idx: 1, hook_title: "Faça isso à noite", duration: 8, score: 0.6, in_recipe: false },
    ] }));
    return new Response(JSON.stringify({ ok: true }));
  }));
  return calls;
}

describe("takes com a receita do vencedor", () => {
  it("sem receita guardada, gera como antes", async () => {
    const calls = stubTakes();
    render(<TakesPanel finalId="f1" target={null} />);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("takes-generate"));
    await screen.findByTestId("takes-review");
    expect(calls[0].init).toEqual({ method: "POST" });
  });

  it("com receita, manda os beats do vencedor e marca os takes que seguem o formato", async () => {
    saveRecipe("Body Explained", { beats: [{ beat_role: "problema", weight: 0.6 }, { beat_role: "cta", weight: 0.2 }], summary: "" });
    const calls = stubTakes();
    render(<TakesPanel finalId="f1" target={null} />);
    expect(await screen.findByRole("checkbox")).toBeChecked();
    expect(screen.getByText(/Seguir o formato do vencedor \(Body Explained\)/)).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("takes-generate"));
    await screen.findByTestId("takes-review");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ recipe: { beats: [{ beat_role: "problema", weight: 0.6 }, { beat_role: "cta", weight: 0.2 }] } });
    expect(screen.getAllByText("No formato do vencedor")).toHaveLength(1);
  });

  it("desmarcando, não manda a receita", async () => {
    saveRecipe("Body Explained", { beats: [{ beat_role: "hook", weight: 1 }], summary: "" });
    const calls = stubTakes();
    render(<TakesPanel finalId="f1" target={null} />);
    fireEvent.click(await screen.findByRole("checkbox"));
    fireEvent.click(screen.getByTestId("takes-generate"));
    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    expect(calls[0].init).toEqual({ method: "POST" });
  });
});
