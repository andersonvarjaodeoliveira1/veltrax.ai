import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, render, waitFor } from "@testing-library/react";

const toast = vi.hoisted(() => ({ info: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import { ExtensionUpdateNotice, isNewerVersion } from "./extension-update-notice";

beforeEach(() => { toast.info.mockClear(); window.sessionStorage.clear(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const status = (version?: string) => act(async () => { window.postMessage({ source: "clipgringa-flow", type: "status", loggedIn: true, plan: "Pro", credits: 1, seenAt: Date.now(), version }, window.location.origin); });
const published = (version: string) => vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ version }), { status: 200 })));

it("compara versões número a número", () => {
  expect(isNewerVersion("1.16.1", "1.15.0")).toBe(true);
  expect(isNewerVersion("1.16.0", "1.16.0")).toBe(false);
  expect(isNewerVersion("1.9.0", "1.10.0")).toBe(false);
  expect(isNewerVersion("1.16.1", "0")).toBe(true);
});

it("avisa o membro quando a extensão instalada é mais antiga que a publicada", async () => {
  published("1.16.1");
  render(<ExtensionUpdateNotice />);
  await status("1.15.0");
  await waitFor(() => expect(toast.info).toHaveBeenCalledWith(expect.stringContaining("1.15.0 → 1.16.1"), expect.objectContaining({ id: "extension-update" })));
});

it("avisa também quando a extensão é tão antiga que nem informa a versão", async () => {
  published("1.16.1");
  render(<ExtensionUpdateNotice />);
  await status(undefined);
  await waitFor(() => expect(toast.info).toHaveBeenCalledWith(expect.stringContaining("1.16.1"), expect.anything()));
});

it("não avisa quando a extensão está em dia", async () => {
  published("1.16.1");
  render(<ExtensionUpdateNotice />);
  await status("1.16.1");
  await new Promise((r) => setTimeout(r, 200));
  expect(toast.info).not.toHaveBeenCalled();
});
