import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/session", () => ({ getServerSession: vi.fn() }));
vi.mock("@/server/backend-api", () => ({
  fetchBackend: vi.fn(async () => new Response("{}", { status: 200 })),
  createProxyResponse: vi.fn((r: Response) => r),
}));

import { fetchBackend } from "@/server/backend-api";
import { getServerSession } from "@/server/session";
import { GET, POST } from "./route";

const ctx = (...path: string[]) => ({ params: Promise.resolve({ path }) });

describe("ClipSpy proxy", () => {
  beforeEach(() => vi.clearAllMocks());

  it("blocks people who are not signed in", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null as never);
    expect((await GET(new Request("http://x/api/clipspy/bank"), ctx("bank"))).status).toBe(401);
  });

  it("blocks members from everything but the status check", async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: "u1", is_admin: false } } as never);
    expect((await GET(new Request("http://x/api/clipspy/bank"), ctx("bank"))).status).toBe(403);
    expect((await POST(new Request("http://x/api/clipspy/search", { method: "POST", body: "{}" }), ctx("search"))).status).toBe(403);
    expect((await POST(new Request("http://x/api/clipspy/status", { method: "POST", body: "{}" }), ctx("status"))).status).toBe(403);
    expect(fetchBackend).not.toHaveBeenCalled();
    expect((await GET(new Request("http://x/api/clipspy/status"), ctx("status"))).status).toBe(200);
    expect(fetchBackend).toHaveBeenCalledTimes(1);
  });

  it("forwards admins to the backend", async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: "admin-1", is_admin: true } } as never);
    expect((await GET(new Request("http://x/api/clipspy/bank?champion=1"), ctx("bank"))).status).toBe(200);
    expect(fetchBackend).toHaveBeenCalledWith("/clipspy/bank?champion=1", expect.objectContaining({ method: "GET", userId: "admin-1" }));
  });
});
