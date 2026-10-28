import { NextResponse } from "next/server";

import { fetchBackend } from "@/server/backend-api";
import { getServerSession } from "@/server/session";

export const dynamic = "force-dynamic";

// Diz ao navegador se a conta está avisada ou bloqueada por atividade incomum.
export async function GET() {
  const session = await getServerSession();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const upstream = await fetchBackend("/security/status", { method: "GET", userId: session.user.id, cache: "no-store" });
  if (!upstream.ok) return NextResponse.json({ strikes: 0, blocked: false, limit: 2 });
  const data = (await upstream.json().catch(() => ({}))) as { strikes?: number; blocked?: boolean; limit?: number };
  return NextResponse.json({ strikes: data.strikes ?? 0, blocked: Boolean(data.blocked), limit: data.limit ?? 2 });
}
