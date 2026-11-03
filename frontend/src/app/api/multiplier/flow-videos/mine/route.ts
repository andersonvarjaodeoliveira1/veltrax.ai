import { NextResponse } from "next/server";

import { createProxyResponse, fetchBackend } from "@/server/backend-api";
import { getServerSession } from "@/server/session";

// Envio de um vídeo da própria pessoa: repassa o arquivo em fluxo, sem carregar tudo na memória.
export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const search = new URL(request.url).search;
  const upstream = await fetchBackend(`/multiplier/flow-videos/mine${search}`, {
    method: "POST",
    userId: session.user.id,
    signal: request.signal,
    extraHeaders: { "Content-Type": request.headers.get("content-type") || "application/octet-stream" },
    body: request.body,
    // @ts-expect-error duplex é exigido pelo Node para enviar um corpo em fluxo
    duplex: "half",
    cache: "no-store",
  });
  return createProxyResponse(upstream);
}
