// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";

const { adapter, fetchBackend } = vi.hoisted(() => ({
  adapter: { findUserByEmail: vi.fn(), createUser: vi.fn(), linkAccount: vi.fn(), createVerificationValue: vi.fn() },
  fetchBackend: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({
  auth: { $context: Promise.resolve({ internalAdapter: adapter, password: { hash: async (p: string) => `hash:${p.length}` }, baseURL: "https://app.test/api/auth" }) },
}));
vi.mock("@/server/backend-api", () => ({ fetchBackend }));

import { inviteMember } from "./invite-member";

beforeEach(() => {
  vi.clearAllMocks();
  adapter.findUserByEmail.mockResolvedValue(null);
  adapter.createUser.mockResolvedValue({ id: "u-new" });
  fetchBackend.mockResolvedValue(new Response("{}", { status: 200 }));
});

it("creates the user with an unknown password and emails a set-password link that does not expire", async () => {
  const result = await inviteMember("  Alison.Guimaraes13@Gmail.com ");
  expect(result).toEqual({ ok: true, userId: "u-new", created: true, emailSent: true });
  expect(adapter.createUser).toHaveBeenCalledWith({ email: "alison.guimaraes13@gmail.com", name: "alison guimaraes13", emailVerified: true });
  expect(adapter.linkAccount).toHaveBeenCalledWith(expect.objectContaining({ userId: "u-new", providerId: "credential", password: expect.stringMatching(/^hash:/) }));
  const verification = adapter.createVerificationValue.mock.calls[0][0];
  expect(verification.value).toBe("u-new");
  expect(verification.identifier).toMatch(/^reset-password:.{24}$/);
  const days = (verification.expiresAt.getTime() - Date.now()) / 86_400_000;
  expect(days).toBeGreaterThan(3000);
  expect(days).toBeLessThanOrEqual(3650);
  const [path, init] = fetchBackend.mock.calls[0];
  expect(path).toBe("/account/password-reset-email");
  expect(init.userId).toBe("u-new");
  const sent = JSON.parse(init.body);
  expect(sent.invite).toBe(true);
  expect(sent.url).toMatch(/^https:\/\/app\.test\/api\/auth\/reset-password\/.{24}\?callbackURL=%2Freset-password$/);
});

it("reuses an existing user without creating another one (resend)", async () => {
  adapter.findUserByEmail.mockResolvedValue({ user: { id: "u-old" } });
  const result = await inviteMember("a@b.com");
  expect(result).toMatchObject({ ok: true, userId: "u-old", created: false });
  expect(adapter.createUser).not.toHaveBeenCalled();
  expect(adapter.linkAccount).not.toHaveBeenCalled();
});

it("rejects invalid e-mails before touching anything", async () => {
  expect(await inviteMember("not-an-email")).toEqual({ ok: false, error: "invalid_email" });
  expect(adapter.createUser).not.toHaveBeenCalled();
});

it("tells the admin when the e-mail could not be sent (user is still created)", async () => {
  fetchBackend.mockResolvedValue(new Response("SES not configured", { status: 503 }));
  const result = await inviteMember("x@y.com");
  expect(result).toMatchObject({ ok: false, error: "email_failed", userId: "u-new", created: true });
});
