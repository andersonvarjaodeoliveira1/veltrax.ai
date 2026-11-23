import { NextResponse } from "next/server";

import { createProxyResponse, fetchBackend } from "@/server/backend-api";
import { getServerSession } from "@/server/session";

// BETA — Multiplicador de Vídeos. Isolated proxy; supports multipart uploads.
async function proxy(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { path } = await params;
  const isBody = request.method !== "GET" && request.method !== "HEAD" && request.method !== "DELETE";
  const contentType = request.headers.get("content-type") || "";
  let body: BodyInit | undefined;
  if (isBody) {
    try {
      body = contentType.includes("multipart/form-data") ? await request.formData() : await request.text();
    } catch {
      // Envio interrompido ou incompleto (conexão caiu no meio): avisa em vez de quebrar com erro 500.
      return NextResponse.json({ detail: "O envio chegou incompleto. Confira a internet e tente de novo." }, { status: 400 });
    }
  }
  const upstream = await fetchBackend(`/multiplier/${path.map(encodeURIComponent).join("/")}${new URL(request.url).search}`, {
    method: request.method,
    signal: request.signal,
    userId: session.user.id,
    extraHeaders: {
      ...(typeof body === "string" && contentType ? { "Content-Type": contentType } : {}),
      ...(request.headers.get("range") ? { Range: request.headers.get("range") as string } : {}),
    },
    body,
    cache: "no-store",
  });
  return createProxyResponse(upstream);
}

export const GET = proxy;
export const POST = proxy;
export const DELETE = proxy;
export const PUT = proxy;
export const PATCH = proxy;
