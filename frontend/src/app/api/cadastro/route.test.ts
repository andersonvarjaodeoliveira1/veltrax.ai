import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/signup-requests", () => ({ createSignupRequest: vi.fn() }));

import { createSignupRequest } from "@/server/signup-requests";
import { POST } from "./route";

const person = { name: "Maria Souza", email: "maria@example.com", cpf: "529.982.247-25", phone: "(11) 91314-2143", password: "umasenhaboa1" };
const post = (body: unknown, ip = "10.0.0.1") => POST(new Request("http://x/api/cadastro", {
  method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": ip }, body: typeof body === "string" ? body : JSON.stringify(body),
}));

describe("POST /api/cadastro", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates the pending account when the four fields and the password arrive", async () => {
    vi.mocked(createSignupRequest).mockResolvedValue({ ok: true });
    const response = await post({ ...person, is_admin: true });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    // Só os cinco campos passam adiante: nada que a pessoa mande a mais entra no cadastro.
    expect(createSignupRequest).toHaveBeenCalledWith(person);
  });

  it("refuses when something is missing and says which field", async () => {
    vi.mocked(createSignupRequest).mockResolvedValue({ ok: false, error: "invalid", fields: { cpf: "CPF inválido. Confira os números." } });
    const response = await post({ ...person, cpf: "" }, "10.0.0.2");
    expect(response.status).toBe(400);
    expect((await response.json()).fields.cpf).toMatch(/CPF/);
  });

  it("answers 409 for an e-mail or CPF that already has an account", async () => {
    vi.mocked(createSignupRequest).mockResolvedValue({ ok: false, error: "email_exists" });
    expect((await post(person, "10.0.0.3")).status).toBe(409);
  });

  it("rejects a body that is not JSON without touching the database", async () => {
    expect((await post("isto não é json", "10.0.0.4")).status).toBe(400);
    expect(createSignupRequest).not.toHaveBeenCalled();
  });

  it("stops one address from sending sign-ups without end", async () => {
    vi.mocked(createSignupRequest).mockResolvedValue({ ok: true });
    const statuses: number[] = [];
    for (let i = 0; i < 10; i += 1) statuses.push((await post(person, "10.9.9.9")).status);
    expect(statuses.slice(0, 8).every((s) => s === 200)).toBe(true);
    expect(statuses[9]).toBe(429);
  });

  it("does not leak the failure when the database breaks", async () => {
    vi.mocked(createSignupRequest).mockRejectedValue(new Error("relation signup_requests does not exist"));
    const response = await post(person, "10.0.0.5");
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toMatch(/relation|signup_requests/);
  });
});
