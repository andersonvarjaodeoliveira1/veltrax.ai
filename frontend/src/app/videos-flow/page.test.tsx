import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import FlowVideosPage from "./page";

afterEach(() => vi.unstubAllGlobals());

it("shows the empty state when no video arrived yet", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ videos: [] }), { status: 200 })));
  render(<FlowVideosPage />);
  expect(await screen.findByTestId("flow-videos-empty")).toBeInTheDocument();
});

it("lists videos by package with a download link and deletes after confirmation", async () => {
  const calls: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? "GET"} ${url}`);
    return new Response(JSON.stringify({ videos: [{ id: "v1", package: "Wipink", file: "Video01_Cena01.mp4", size: 5_242_880, created_at: null }] }), { status: 200 });
  }));
  const user = userEvent.setup();
  render(<FlowVideosPage />);
  expect(await screen.findByText(/Wipink/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Baixar/ })).toHaveAttribute("href", "/api/multiplier/flow-videos/v1/file?download=1");
  await user.click(screen.getByRole("button", { name: /Apagar Video01_Cena01.mp4/ }));
  await user.click(screen.getByRole("button", { name: "Apagar mesmo" }));
  await waitFor(() => expect(calls).toContain("DELETE /api/multiplier/flow-videos/v1"));
  expect(screen.queryByText("Video01_Cena01.mp4")).not.toBeInTheDocument();
});
