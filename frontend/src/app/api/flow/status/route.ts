import { NextResponse } from "next/server";

import { createTextProxyResponse, fetchBackend } from "@/server/backend-api";
import { getServerSession } from "@/server/session";

/** A extensão do Flow avisa, pelo site, se a conta Google do membro está conectada. */
export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body.connected !== "boolean") return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  const upstream = await fetchBackend("/flow/status", {
    method: "POST",
    userId: session.user.id,
    extraHeaders: { "Content-Type": "application/json" },
    body: JSON.stringify({
      connected: body.connected,
      plan: typeof body.plan === "string" ? body.plan.slice(0, 40) : null,
      credits: Number.isFinite(body.credits) ? Math.max(0, Math.round(body.credits)) : null,
    }),
    cache: "no-store",
  });
  return createTextProxyResponse(upstream);
}
