import { afterEach, expect, it, vi } from "vitest";

const success = vi.fn();
const error = vi.fn();
vi.mock("sonner", () => ({ toast: { success: (...a: unknown[]) => success(...a), error: (...a: unknown[]) => error(...a) } }));

import { announceTokens } from "./token-alert";

afterEach(() => { vi.unstubAllGlobals(); success.mockReset(); error.mockReset(); });

const bal = (used: number, remaining: number | null, extra = {}) => ({ unlimited: false, granted: 1000, used, remaining, exhausted: remaining === 0, ...extra });

it("tells how many tokens the process used and how many are left", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(bal(450, 550)), { status: 200 })));
  await announceTokens("Variações", bal(200, 800));
  expect(success).toHaveBeenCalledWith(expect.stringMatching(/Variações concluída · usou 250 tokens · restam 550 tokens/));
});

it("warns and offers the administrator when the tokens run out", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(bal(1000, 0)), { status: 200 })));
  await announceTokens("Copys", bal(900, 100));
  expect(error).toHaveBeenCalledWith(expect.stringContaining("Seus tokens acabaram"), expect.objectContaining({ action: expect.objectContaining({ label: "Chamar o administrador" }) }));
});
