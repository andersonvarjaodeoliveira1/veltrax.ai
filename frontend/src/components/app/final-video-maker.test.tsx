import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FinalVideoMaker } from "./final-video-maker";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

it("escolhe o estilo, cria o vídeo final e mostra o resultado com o botão de baixar", async () => {
  const bodies: Record<string, unknown>[] = [];
  let polls = 0;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "POST") { bodies.push(JSON.parse(String(init.body))); return new Response(JSON.stringify({ id: "abc", status: "processing" }), { status: 200 }); }
    polls += 1;
    const done = polls > 1;
    return new Response(JSON.stringify({ id: "abc", status: done ? "done" : "processing", step: "Criando a legenda", error: null, warning: "", duration: 14.2 }), { status: 200 });
  }));
  const user = userEvent.setup();
  render(<FinalVideoMaker videoIds={["v1", "v2", "v3"]} />);
  await user.click(screen.getByTestId("final-open"));
  expect(screen.getByText(/Junto as 3 cenas/)).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "TikTok" }));
  await user.type(screen.getByPlaceholderText(/Isso muda tudo/), "Meu título");
  await user.click(screen.getByRole("button", { name: "Rápido" }));
  await user.click(screen.getByRole("button", { name: "Criar o vídeo final" }));
  expect(await screen.findByText(/Criando a legenda/, {}, { timeout: 4000 })).toBeInTheDocument();
  expect(bodies).toEqual([{ video_ids: ["v1", "v2", "v3"], template: "tiktok", title: "Meu título", aspect: "9:16", speed: 1.2, captions: true }]);
  const done = await screen.findByTestId("final-done", {}, { timeout: 8000 });
  expect(done).toHaveTextContent("14s");
  expect(screen.getByRole("link", { name: /Baixar o vídeo/ })).toHaveAttribute("href", "/api/multiplier/final/abc/file?download=1");
});

it("mostra o aviso de limite quando o servidor recusa", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ detail: "x" }), { status: 409 })));
  const user = userEvent.setup();
  render(<FinalVideoMaker videoIds={["v1"]} />);
  await user.click(screen.getByTestId("final-open"));
  await user.click(screen.getByRole("button", { name: "Criar o vídeo final" }));
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("limite de 10"));
});
