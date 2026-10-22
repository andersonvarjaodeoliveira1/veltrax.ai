import { NextResponse } from "next/server";
import { requireUnlockedAdmin } from "@/server/admin-guard";
import { inviteMember } from "@/server/invite-member";
import { fetchBackend } from "@/server/backend-api";

export const dynamic = "force-dynamic";

// Convida um membro novo: cria o usuário, manda o e-mail para ele criar a senha e (opcional) libera os tokens iniciais.
export async function POST(request: Request) {
  const check = await requireUnlockedAdmin();
  if ("error" in check) return check.error;

  const body = (await request.json().catch(() => ({}))) as { email?: unknown; tokens?: unknown };
  if (typeof body.email !== "string") return NextResponse.json({ error: "invalid_email" }, { status: 400 });

  const result = await inviteMember(body.email);
  if (!result.ok && result.error === "invalid_email") return NextResponse.json({ error: "invalid_email" }, { status: 400 });

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
  return NextResponse.json({ ok: true, created: result.created, tokensGranted });
}
