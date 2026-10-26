import { NextResponse } from "next/server";
import { requireUnlockedAdmin } from "@/server/admin-guard";
import { inviteMember } from "@/server/invite-member";
import { fetchBackend } from "@/server/backend-api";

export const dynamic = "force-dynamic";

// Convida um membro novo: cria o usuário, manda o e-mail para ele criar a senha e (opcional) libera os tokens iniciais.
export async function POST(request: Request) {
  const check = await requireUnlockedAdmin();
  if ("error" in check) return check.error;

  const body = (await request.json().catch(() => ({}))) as { email?: unknown; tokens?: unknown; testDays?: unknown; skipEmail?: unknown };
  if (typeof body.email !== "string") return NextResponse.json({ error: "invalid_email" }, { status: 400 });

  const rawDays = Number(body.testDays);
  const testDays = Number.isInteger(rawDays) && rawDays >= 1 && rawDays <= 30 ? rawDays : undefined;
  if (body.testDays !== undefined && body.testDays !== "" && body.testDays !== null && !testDays) return NextResponse.json({ error: "invalid_days" }, { status: 400 });

  let testUntil: string | null = null;
  const markTest = async (userId: string) => {
    if (!testDays) return true;
    const mark = await fetchBackend(`/admin/users/${encodeURIComponent(userId)}/test-access`, {
      method: "PUT",
      userId: check.userId,
      extraHeaders: { "Content-Type": "application/json" },
      body: JSON.stringify({ days: testDays }),
      cache: "no-store",
    });
    if (!mark.ok) return false;
    testUntil = ((await mark.json().catch(() => ({}))) as { test_expires_at?: string }).test_expires_at ?? null;
    return true;
  };

  const result = await inviteMember(body.email, { testDays, beforeEmail: markTest, skipEmail: body.skipEmail === true && Boolean(testDays) });
  if (!result.ok && result.error === "invalid_email") return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  if (!result.ok && result.error === "test_access_failed") return NextResponse.json({ error: "test_access_failed", created: result.created }, { status: 502 });

  let tokensGranted: number | null = null;
  const tokens = Number(body.tokens);
  if (result.userId && Number.isFinite(tokens) && tokens > 0) {
    const grant = await fetchBackend(`/admin/users/${encodeURIComponent(result.userId)}/tokens`, {
      method: "PUT",
      userId: check.userId,
      extraHeaders: { "Content-Type": "application/json" },
      body: JSON.stringify({ set: Math.floor(tokens) }),
      cache: "no-store",
    });
    if (grant.ok) tokensGranted = Math.floor(tokens);
  }

  if (!result.ok) {
    return NextResponse.json({ error: result.error, created: result.created, tokensGranted, detail: result.detail }, { status: 502 });
  }
  return NextResponse.json({ ok: true, created: result.created, emailSent: result.emailSent, tokensGranted, testUntil });
}
