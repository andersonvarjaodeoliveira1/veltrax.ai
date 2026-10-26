import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { FlowLibrary } from "./flow-library";

afterEach(() => vi.unstubAllGlobals());

it("shows the empty state when no video arrived yet", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ videos: [] }), { status: 200 })));
  render(<FlowLibrary kind="video" />);
  expect(await screen.findByTestId("flow-videos-empty")).toBeInTheDocument();
});

it("lists videos by package with a download link and deletes after confirmation", async () => {
  const calls: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? "GET"} ${url}`);
    return new Response(JSON.stringify({ videos: [{ id: "v1", package: "Wipink", file: "Video01_Cena01.mp4", size: 5_242_880, created_at: null }] }), { status: 200 });
  }));
  const user = userEvent.setup();
  render(<FlowLibrary kind="video" />);
  expect(await screen.findByText(/Wipink/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Baixar/ })).toHaveAttribute("href", "/api/multiplier/flow-videos/v1/file?download=1");
  await user.click(screen.getByRole("button", { name: /Apagar Video01_Cena01.mp4/ }));
  await user.click(screen.getByRole("button", { name: "Apagar mesmo" }));
  await waitFor(() => expect(calls).toContain("DELETE /api/multiplier/flow-videos/v1"));
  expect(screen.queryByText("Video01_Cena01.mp4")).not.toBeInTheDocument();
});

it("image bank shows only images, with thumbnail and download", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ videos: [
    { id: "i1", package: "Wipink", file: "Video01_Cena01.jpg", kind: "image", size: 1000, created_at: "2026-10-26T12:00:00Z" },
    { id: "v1", package: "Wipink", file: "Video01_Cena01.mp4", kind: "video", size: 1000, created_at: null },
  ] }), { status: 200 })));
  render(<FlowLibrary kind="image" />);
  expect(await screen.findByTestId("flow-images")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Baixar Video01_Cena01.jpg/ })).toHaveAttribute("href", "/api/multiplier/flow-videos/i1/file?download=1");
  expect(screen.queryByText("Video01_Cena01.mp4")).not.toBeInTheDocument();
  expect(screen.getByText(/Criada em/)).toBeInTheDocument();
});

it("compact mode shows only the latest videos under a friendly title, and nothing when there are none", async () => {
  const many = Array.from({ length: 10 }, (_, n) => ({ id: `v${n}`, package: "P", file: `Video${n}.mp4`, kind: "video", size: 1000, created_at: `2026-10-${String(10 + n).padStart(2, "0")}T12:00:00Z` }));
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ videos: many }), { status: 200 })));
  const { unmount } = render(<FlowLibrary kind="video" compact />);
  expect(await screen.findByText(/Seus vídeos criados/)).toBeInTheDocument();
  expect(screen.getAllByRole("link", { name: /Baixar/ })).toHaveLength(8);
  expect(screen.getByRole("link", { name: "Baixar Video9.mp4" })).toBeInTheDocument();
  unmount();
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ videos: [] }), { status: 200 })));
  const empty = render(<FlowLibrary kind="video" compact />);
  await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled());
  expect(empty.container).toBeEmptyDOMElement();
});
