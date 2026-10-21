import { NextResponse } from "next/server";

import { createTextProxyResponse, fetchBackend } from "@/server/backend-api";
import { getServerSession } from "@/server/session";

type Ctx = { params: Promise<{ provider: string }> };

export async function PUT(request: Request, { params }: Ctx) {
  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { provider } = await params;
  const body = await request.text();
  const upstream = await fetchBackend(`/integrations/${encodeURIComponent(provider)}`, {
    method: "PUT",
    userId: session.user.id,
    extraHeaders: { "Content-Type": "application/json" },
    body: body || "{}",
    cache: "no-store",
  });
  return createTextProxyResponse(upstream);
}

export async function DELETE(_request: Request, { params }: Ctx) {
  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { provider } = await params;
  const upstream = await fetchBackend(`/integrations/${encodeURIComponent(provider)}`, {
    method: "DELETE",
    userId: session.user.id,
    cache: "no-store",
  });
  return createTextProxyResponse(upstream);
}
