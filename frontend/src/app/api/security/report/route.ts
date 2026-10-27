import { NextResponse } from "next/server";

import { fetchBackend } from "@/server/backend-api";
import { getServerSession } from "@/server/session";

export const dynamic = "force-dynamic";

// O navegador avisa tentativas de copiar o aplicativo; só quem está logado conta.
export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { kind?: unknown; page?: unknown; detail?: unknown };
  const upstream = await fetchBackend("/security/report", {
    method: "POST",
    userId: session.user.id,
    extraHeaders: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind: String(body.kind ?? "").slice(0, 40), page: String(body.page ?? "").slice(0, 120), detail: String(body.detail ?? "").slice(0, 120) }),
    cache: "no-store",
  });
  return NextResponse.json({ ok: upstream.ok }, { status: upstream.ok ? 200 : 202 });
}
