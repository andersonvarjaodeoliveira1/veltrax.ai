import { NextResponse } from "next/server";

import { createProxyResponse, fetchBackend } from "@/server/backend-api";
import { getServerSession } from "@/server/session";

// BETA — ClipSpy (radar de criativos). Isolated proxy.
async function proxy(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { path } = await params;
  const isBody = request.method !== "GET" && request.method !== "HEAD" && request.method !== "DELETE";
  const contentType = request.headers.get("content-type") || "";
  const body: BodyInit | undefined = isBody ? await request.text() : undefined;
  const upstream = await fetchBackend(`/clipspy/${path.map(encodeURIComponent).join("/")}${new URL(request.url).search}`, {
    method: request.method,
    signal: request.signal,
    userId: session.user.id,
    extraHeaders: typeof body === "string" && contentType ? { "Content-Type": contentType } : {},
    body,
    cache: "no-store",
  });
  return createProxyResponse(upstream);
}

export const GET = proxy;
export const POST = proxy;
