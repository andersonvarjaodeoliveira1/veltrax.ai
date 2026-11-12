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
  render(<FinalVideoMaker items={[{ label: "Video01", videoIds: ["v1", "v2", "v3"] }]} />);
  await user.click(screen.getByTestId("final-open"));
  expect(screen.getByText(/Junto as 3 cenas/)).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "TikTok" }));
  await user.type(screen.getByPlaceholderText(/Isso muda tudo/), "Meu título");
  await user.click(screen.getByRole("button", { name: "Rápido" }));
  await user.click(screen.getByRole("button", { name: "Criar o vídeo final" }));
  expect(await screen.findByText(/Criando a legenda/, {}, { timeout: 4000 })).toBeInTheDocument();
  expect(bodies).toEqual([{ video_ids: ["v1", "v2", "v3"], template: "tiktok", title: "Meu título", aspect: "9:16", speed: 1.2, captions: true, silence: "off", transition: "none", denoise: false }]);
  const done = await screen.findByTestId("final-done", {}, { timeout: 8000 });
  expect(done).toHaveTextContent("14s");
  expect(screen.getByRole("link", { name: /Baixar o vídeo/ })).toHaveAttribute("href", "/api/multiplier/final/abc/file?download=1");
});

it("mostra o aviso de limite quando o servidor recusa", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ detail: "x" }), { status: 409 })));
  const user = userEvent.setup();
  render(<FinalVideoMaker items={[{ label: "Video01", videoIds: ["v1"] }]} />);
  await user.click(screen.getByTestId("final-open"));
  await user.click(screen.getByRole("button", { name: "Criar o vídeo final" }));
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("limite de 20"));
});

it("lote: cria um vídeo final para cada vídeo, com as mesmas escolhas de edição", async () => {
  const bodies: Record<string, unknown>[] = [];
  let n = 0;
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === "POST") { bodies.push(JSON.parse(String(init.body))); n += 1; return new Response(JSON.stringify({ id: `j${n}`, status: "processing" }), { status: 200 }); }
    return new Response(JSON.stringify({ id: "x", status: "processing", step: "Na fila", error: null, warning: "", duration: null }), { status: 200 });
  }));
  const user = userEvent.setup();
  render(<FinalVideoMaker items={[{ label: "Video01", videoIds: ["a", "b"] }, { label: "Video02", videoIds: ["c", "d"] }]} />);
  await user.click(screen.getByTestId("final-open"));
  expect(screen.getByText("Finalizar todos os 2 vídeos")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Forte (vídeo bem seco)" }));
  await user.click(screen.getByRole("button", { name: "Deslizar" }));
  await user.click(screen.getByLabelText("Limpar o ruído do áudio"));
  await user.click(screen.getByRole("button", { name: "Criar o vídeo final" }));
  await waitFor(() => expect(bodies).toHaveLength(2));
  expect(bodies.map((b) => b.video_ids)).toEqual([["a", "b"], ["c", "d"]]);
  expect(bodies[0]).toMatchObject({ silence: "strong", transition: "slide", denoise: true });
  expect(await screen.findByText("Video02")).toBeInTheDocument();
});

it("vídeo que nasceu de um tema de página entra na agenda dela com um clique", async () => {
  window.localStorage.setItem("cg_fb_target", JSON.stringify({ pageId: "p9", pageName: "Brasil Curioso", title: "O deserto cheio de lagoas", caption: "Legenda pronta", at: Date.now() }));
  const posts: { url: string; body: Record<string, unknown> }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      posts.push({ url, body: JSON.parse(String(init.body)) });
      return new Response(JSON.stringify(url.includes("/api/facebook/") ? { agendados: 1 } : { id: "abc", status: "processing" }), { status: 200 });
    }
    return new Response(JSON.stringify({ id: "abc", status: "done", step: "", error: null, warning: "", duration: 16 }), { status: 200 });
  }));
  const user = userEvent.setup();
  render(<FinalVideoMaker items={[{ label: "Video01", videoIds: ["v1", "v2"] }]} />);
  await user.click(screen.getByTestId("final-open"));
  expect(screen.getByPlaceholderText(/Isso muda tudo/)).toHaveValue("O deserto cheio de lagoas");
  await user.click(screen.getByRole("button", { name: "Criar o vídeo final" }));
  await user.click(await screen.findByRole("button", { name: "Colocar na agenda de Brasil Curioso" }, { timeout: 8000 }));
  expect(await screen.findByText(/Entrou na agenda de Brasil Curioso/)).toBeInTheDocument();
  expect(posts[1]).toEqual({ url: "/api/facebook/pages/p9/clips", body: { clip_ids: [], videos: [{ source: "final", id: "abc" }], title: "O deserto cheio de lagoas", caption: "Legenda pronta" } });
  window.localStorage.removeItem("cg_fb_target");
});

it("sem página de destino não oferece a agenda", async () => {
  window.localStorage.removeItem("cg_fb_target");
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => new Response(JSON.stringify(init?.method === "POST" ? { id: "abc", status: "processing" } : { id: "abc", status: "done", step: "", error: null, warning: "", duration: 9 }), { status: 200 })));
  const user = userEvent.setup();
  render(<FinalVideoMaker items={[{ label: "Video01", videoIds: ["v1"] }]} />);
  await user.click(screen.getByTestId("final-open"));
  await user.click(screen.getByRole("button", { name: "Criar o vídeo final" }));
  await screen.findByTestId("final-done", {}, { timeout: 8000 });
  expect(screen.queryByTestId("final-queue")).not.toBeInTheDocument();
});
