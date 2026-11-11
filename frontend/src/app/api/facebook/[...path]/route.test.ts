import { GET, POST } from "./route";
import { fetchBackend } from "@/server/backend-api";
import { getServerSession } from "@/server/session";

vi.mock("@/server/session", () => ({ getServerSession: vi.fn() }));
vi.mock("@/server/backend-api", () => ({
  fetchBackend: vi.fn(),
  createProxyResponse: vi.fn(async (r: Response) => r),
}));

const ctx = (...path: string[]) => ({ params: Promise.resolve({ path }) });

describe("/api/facebook proxy (em construção)", () => {
  beforeEach(() => vi.resetAllMocks());

  it("blocks people who are not signed in or not admins", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null as never);
    expect((await GET(new Request("http://x/api/facebook/overview"), ctx("overview"))).status).toBe(401);
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: "u1", is_admin: false } } as never);
    expect((await GET(new Request("http://x/api/facebook/overview"), ctx("overview"))).status).toBe(403);
    expect(fetchBackend).not.toHaveBeenCalled();
  });

  it("forwards admins to the backend with their user id and JSON body", async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: "admin-1", is_admin: true } } as never);
    vi.mocked(fetchBackend).mockResolvedValue(new Response("{}", { status: 200 }));
    await POST(new Request("http://x/api/facebook/pages", { method: "POST", body: '{"name":"P"}' }), ctx("pages"));
    expect(fetchBackend).toHaveBeenCalledWith("/facebook/pages", expect.objectContaining({ method: "POST", userId: "admin-1", body: '{"name":"P"}' }));
  });
});
