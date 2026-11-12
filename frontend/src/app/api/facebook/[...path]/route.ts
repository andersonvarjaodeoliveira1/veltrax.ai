import { NextResponse } from "next/server";

import { createProxyResponse, fetchBackend } from "@/server/backend-api";
import { getServerSession } from "@/server/session";

// EM CONSTRUÇÃO: módulo Facebook (contas, páginas e posts). Só administradores; o backend confere de novo.
async function proxy(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const session = await getServerSession();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(session.user as { is_admin?: boolean }).is_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { path } = await params;
  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const body = hasBody ? await request.text() : undefined;
  const upstream = await fetchBackend(`/facebook/${path.map(encodeURIComponent).join("/")}${new URL(request.url).search}`, {
    method: request.method,
    signal: request.signal,
    userId: session.user.id,
    extraHeaders: body ? { "Content-Type": "application/json" } : {},
    body: body || undefined,
    cache: "no-store",
  });
  return createProxyResponse(upstream);
}

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
