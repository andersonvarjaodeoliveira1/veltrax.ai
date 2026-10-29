import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FlowResumePrompt, stalledRun } from "./flow-resume-prompt";
import type { FlowProgress } from "./flow-run-panel";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const base: FlowProgress = {
  at: Date.now() - 10 * 60_000, running: false, total: 4, done: 2, errors: 1, phase: "", now: "Flow não respondeu",
  limit: null, current: null, startedAt: 111, jobStartedAt: 0, dur: {},
  jobs: [
    { key: "a", vi: 0, si: 0, vname: "Video01", file: "a.mp4", done: true, error: "" },
    { key: "b", vi: 0, si: 1, vname: "Video01", file: "b.mp4", done: false, error: "x" },
  ],
};

afterEach(() => { cleanup(); vi.useRealTimers(); push.mockReset(); window.sessionStorage.clear(); });

it("só considera parado o que tem cenas faltando e não está gerando agora", () => {
  expect(stalledRun(base)).toBe(base);
  expect(stalledRun({ ...base, running: true, at: Date.now() })).toBeNull();
  expect(stalledRun({ ...base, running: true, at: Date.now() - 5 * 60_000 })).not.toBeNull();
  expect(stalledRun({ ...base, done: 4 })).toBeNull();
  expect(stalledRun({ ...base, at: Date.now() - 30 * 3600_000 })).toBeNull();
});

const reply = (data: unknown) => window.dispatchEvent(new MessageEvent("message", { data, source: window, origin: window.location.origin }));

function bridge(replyAck: boolean) {
  const sent: string[] = [];
  const onPost = (event: MessageEvent) => {
    if (event.data?.source !== "clipgringa-page") return;
    sent.push(event.data.type);
    if (event.data.type === "progress?") reply({ source: "clipgringa-flow", type: "progress", data: base });
    if (event.data.type === "images?") reply({ source: "clipgringa-flow", type: "images", data: { a: { file: "a.png", data: "data:image/png;base64,AAAA" } } });
    if (replyAck && event.data.type === "flow-resume") reply({ source: "clipgringa-flow", type: "resume-ack", ok: true });
    if (replyAck && event.data.type === "flow-discard") reply({ source: "clipgringa-flow", type: "discard-ack", ok: true });
  };
  window.addEventListener("message", onPost);
  return { sent, stop: () => window.removeEventListener("message", onPost) };
}

it("pergunta com a imagem e continua no Flow", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const b = bridge(true);
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  render(<FlowResumePrompt enabled />);
  await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
  expect(await screen.findByText(/Quer continuar o projeto que parou/)).toBeInTheDocument();
  expect(screen.getByAltText(/Imagem do projeto Video01/)).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /Continuar no Flow/ }));
  await vi.waitFor(() => expect(screen.queryByTestId("flow-resume")).toBeNull());
  expect(b.sent).toContain("flow-resume");
  b.stop();
});

it("projeto novo descarta o antigo e abre o multiplicador", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const b = bridge(true);
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  render(<FlowResumePrompt enabled />);
  await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
  await user.click(await screen.findByRole("button", { name: /Começar um projeto novo/ }));
  await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/multiplicador"));
  expect(b.sent).toContain("flow-discard");
  b.stop();
});

it("não pergunta quando nada ficou parado", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  render(<FlowResumePrompt enabled />);
  await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
  expect(screen.queryByTestId("flow-resume")).toBeNull();
});
