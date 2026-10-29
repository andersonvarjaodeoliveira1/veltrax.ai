import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FlowRunPanel, type FlowProgress } from "./flow-run-panel";

function progress(limit: FlowProgress["limit"]): FlowProgress {
  return {
    at: Date.now(), running: true, total: 2, done: 0, errors: 0, phase: "vídeo", now: "Cena 1", current: { vi: 0, si: 0 }, startedAt: Date.now() - 5000, jobStartedAt: Date.now() - 2000, dur: {},
    jobs: [{ key: "0-0", vi: 0, si: 0, file: "a.mp4", done: false, error: "" }, { key: "0-1", vi: 0, si: 1, file: "b.mp4", done: false, error: "" }], limit,
  };
}
function send(data: FlowProgress) {
  act(() => { window.dispatchEvent(new MessageEvent("message", { data: { source: "clipgringa-flow", type: "progress", data }, source: window, origin: window.location.origin })); });
}

afterEach(() => vi.unstubAllGlobals());

describe("FlowRunPanel · limite do Flow", () => {
  it("mostra o cronômetro quando o Flow informou o tempo", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ videos: [] }))));
    render(<FlowRunPanel onRetake={() => {}} />);
    send(progress({ since: Date.now(), resumeAt: Date.now() + 125_000, known: true, kind: "limit", message: "Tente novamente em 2 minutos" }));
    const box = await screen.findByTestId("flow-limit");
    expect(box).toHaveTextContent("atingiu o limite");
    expect(box).toHaveTextContent(/2:0\d|2:05|2:04/);
    expect(box).toHaveTextContent("Trocar de conta");
    expect(box).toHaveTextContent("Tente novamente em 2 minutos");
  });
  it("avisa que não sabe o tempo e que créditos acabaram", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ videos: [] }))));
    render(<FlowRunPanel onRetake={() => {}} />);
    send(progress({ since: Date.now(), resumeAt: Date.now() + 120_000, known: false, kind: "credits", message: "" }));
    const box = await screen.findByTestId("flow-limit");
    expect(box).toHaveTextContent("créditos desta conta do Flow acabaram");
    expect(box).toHaveTextContent("não disse quanto tempo");
  });
  it("não mostra nada sem limite", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ videos: [] }))));
    render(<FlowRunPanel onRetake={() => {}} />);
    send(progress(null));
    await screen.findByTestId("flow-progress");
    expect(screen.queryByTestId("flow-limit")).toBeNull();
  });
});

describe("FlowRunPanel · variações ao terminar", () => {
  const finished = (): FlowProgress => ({ ...progress(null), running: false, done: 2, jobs: progress(null).jobs.map((job) => ({ ...job, done: true })) });
  it("pergunta se quer variações só quando termina e entrega a quantidade escolhida", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ videos: [] }))));
    const onVariations = vi.fn();
    render(<FlowRunPanel onRetake={() => {}} onVariations={onVariations} />);
    send(progress(null));
    await screen.findByTestId("flow-progress");
    expect(screen.queryByTestId("ask-variations")).toBeNull();
    send(finished());
    expect(await screen.findByTestId("ask-variations")).toHaveTextContent("Quer criar variações deste vídeo?");
    await userEvent.click(screen.getByRole("button", { name: "3 variações" }));
    await userEvent.click(screen.getByRole("button", { name: "Sim, criar variações" }));
    expect(onVariations).toHaveBeenCalledWith(3);
    expect(screen.queryByTestId("ask-variations")).toBeNull();
  });
});

describe("FlowRunPanel · só a geração atual", () => {
  it("não mostra o vídeo de um criativo antigo que tem o mesmo nome de arquivo", async () => {
    const old = new Date(Date.now() - 3 * 3600_000).toISOString();
    const fresh = new Date().toISOString();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ videos: [
      { id: "novo", file: "b.mp4", created_at: fresh },
      { id: "antigo-a", file: "a.mp4", created_at: old },
      { id: "antigo-b", file: "b.mp4", created_at: old },
    ] }))));
    render(<FlowRunPanel onRetake={() => {}} />);
    send(progress(null));
    // a cena 2 (b.mp4) tem vídeo novo; a cena 1 (a.mp4) só tem o antigo e não pode aparecer
    expect(await screen.findByLabelText("Assistir a cena 2 do vídeo 1")).toBeInTheDocument();
    expect(screen.queryByLabelText("Assistir a cena 1 do vídeo 1")).not.toBeInTheDocument();
    expect(document.querySelector('video[src*="antigo"]')).toBeNull();
    expect(document.querySelector('video[src*="/novo/"]')).not.toBeNull();
  });
});
