import { beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ value: null as { user: { id: string } } | null }));
const backend = vi.hoisted(() => vi.fn(async () => new Response("{}")));
vi.mock("@/server/session", () => ({ getServerSession: async () => session.value }));
vi.mock("@/server/backend-api", () => ({ fetchBackend: backend }));

import { guardToken } from "@/lib/ai-agents";
import { GET, POST } from "./route";

const call = async (headers: Record<string, string>, handler = GET) =>
  handler(new Request("https://clipgringa.gringatools.com/api/security/agente", { headers: { "x-cg-guard": await guardToken(), ...headers } }));
const sent = () => { const [path, init] = backend.mock.calls[0] as unknown as [string, { userId: string; body: string }]; return { path, userId: init.userId, body: JSON.parse(init.body) }; };

describe("registro de robôs e agentes de IA", () => {
  beforeEach(() => { backend.mockClear(); session.value = null; });

  it("não existe para quem chama de fora (sem a marca do middleware)", async () => {
    const response = await GET(new Request("https://clipgringa.gringatools.com/api/security/agente", { headers: { "x-cg-guard": "errada", "x-cg-motivo": "agente_ia" } }));
    expect(response.status).toBe(404);
    expect(backend).not.toHaveBeenCalled();
  });

  it("agente de IA usando a conta de um membro: recusa e manda bloquear a conta", async () => {
    session.value = { user: { id: "membro-1" } };
    const response = await call({ "x-cg-motivo": "agente_assinado", "x-cg-caminho": "/automacao", "signature-agent": '"https://chatgpt.com"', "user-agent": "Mozilla/5.0 Chrome/138" });
    expect(response.status).toBe(403);
    expect(sent()).toEqual({ path: "/security/report", userId: "membro-1", body: { kind: "ai_agent", page: "/automacao", detail: "https://chatgpt.com" } });
  });

  it("arquivo-isca com conta: conta como tentativa, não bloqueia na hora", async () => {
    session.value = { user: { id: "membro-2" } };
    await call({ "x-cg-motivo": "isca", "x-cg-caminho": "/api/interno/mapa-do-sistema.json", "user-agent": "Mozilla/5.0 Chrome/138" }, POST);
    expect(sent().body.kind).toBe("ai_probe");
  });

  it("robô sem conta: recusa e só avisa o administrador, com o endereço de onde veio", async () => {
    const response = await call({ "x-cg-motivo": "agente_ia", "x-cg-caminho": "/sign-in", "user-agent": "Mozilla/5.0 (compatible; ChatGPT-User/1.0)", "x-forwarded-for": "203.0.113.9, 10.0.0.1" });
    expect(response.status).toBe(403);
    expect(sent()).toEqual({ path: "/security/visit", userId: "site", body: { kind: "ai_visit", ip: "203.0.113.9", page: "/sign-in", detail: "Mozilla/5.0 (compatible; ChatGPT-User/1.0)" } });
  });

  it("recusa mesmo se o registro falhar", async () => {
    backend.mockRejectedValueOnce(new Error("fora do ar"));
    expect((await call({ "x-cg-motivo": "agente_ia", "user-agent": "GPTBot" })).status).toBe(403);
  });
});
