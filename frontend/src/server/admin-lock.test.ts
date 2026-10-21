import { signUnlock, verifyUnlock } from "./admin-lock";

beforeEach(() => { process.env.BETTER_AUTH_SECRET = "test-secret"; });

describe("admin unlock cookie", () => {
  it("accepts a fresh cookie of the same user", () => {
    expect(verifyUnlock(signUnlock("u1"), "u1")).toBe(true);
  });
  it("rejects another user, a changed value and an expired cookie", () => {
    const cookie = signUnlock("u1", 1_000_000);
    expect(verifyUnlock(cookie, "u2", 1_000_001)).toBe(false);
    expect(verifyUnlock(cookie.replace("u1", "u2"), "u2", 1_000_001)).toBe(false);
    expect(verifyUnlock(cookie, "u1", 1_000_000 + 31 * 60 * 1000)).toBe(false);
    expect(verifyUnlock(undefined, "u1")).toBe(false);
    expect(verifyUnlock("lixo", "u1")).toBe(false);
  });
  it("never unlocks without a server secret", () => {
    delete process.env.BETTER_AUTH_SECRET;
    expect(verifyUnlock(signUnlock("u1"), "u1")).toBe(false);
  });
});
