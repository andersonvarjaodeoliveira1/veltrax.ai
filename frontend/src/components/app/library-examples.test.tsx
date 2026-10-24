import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LibraryExamples, ExampleToggle } from "./library-examples";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

it("mostra os exemplos agrupados por tema e abre os cortes para assistir", async () => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url === "/api/tasks/examples") return json({ examples: [
      { id: "a", group: "Receitas", title: "Wrap de atum", clips_count: 3, top_virality_score: 88, cover_url: "/tasks/examples/a/clips/c1/file" },
      { id: "b", group: "Humor", title: "Piadas", clips_count: 1, top_virality_score: null, cover_url: null },
    ] });
    if (url === "/api/tasks/examples/a") return json({ id: "a", title: "Wrap de atum", clips: [{ id: "c1", video_url: "/tasks/examples/a/clips/c1/file", hook_title: "Receita rápida" }] });
    return json({}, 404);
  }));
  render(<LibraryExamples />);
  const headings = await screen.findAllByRole("heading", { level: 3 });
  expect(headings.map((h) => h.textContent)).toEqual(["Humor", "Receitas"]);
  fireEvent.click(screen.getByRole("button", { name: /Assistir exemplo: Wrap de atum/ }));
  expect(await screen.findByText("Receita rápida")).toBeInTheDocument();
});

it("não mostra nada quando ainda não há exemplos", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => json({ examples: [] })));
  const { container } = render(<LibraryExamples />);
  await new Promise((r) => setTimeout(r, 20));
  expect(container.querySelector('[data-testid="library-examples"]')).toBeNull();
});

it("o admin marca um corte como exemplo com o tema escolhido", async () => {
  const fetchMock = vi.fn(async () => json({ ok: true }));
  vi.stubGlobal("fetch", fetchMock);
  const changed = vi.fn();
  render(<ExampleToggle id="t1" isExample={false} onChanged={changed} />);
  fireEvent.change(screen.getByLabelText("Tema do exemplo"), { target: { value: "Humor" } });
  fireEvent.click(screen.getByRole("button", { name: /Marcar exemplo/ }));
  await vi.waitFor(() => expect(changed).toHaveBeenCalled());
  const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe("/api/tasks/t1/example");
  expect(JSON.parse(String(init.body))).toEqual({ is_example: true, group: "Humor" });
});
