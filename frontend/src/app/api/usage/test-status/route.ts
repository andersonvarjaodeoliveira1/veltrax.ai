import { NextResponse } from "next/server";

import { createTextProxyResponse, fetchBackend } from "@/server/backend-api";
import { getServerSession } from "@/server/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const upstream = await fetchBackend("/usage/test-status", { method: "GET", userId: session.user.id, cache: "no-store" });
  return createTextProxyResponse(upstream);
}
