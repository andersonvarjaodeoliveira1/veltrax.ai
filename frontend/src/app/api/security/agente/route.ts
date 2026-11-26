import { NextResponse } from "next/server";

import { guardToken } from "@/lib/ai-agents";
import { fetchBackend } from "@/server/backend-api";
import { getServerSession } from "@/server/session";

export const dynamic = "force-dynamic";

const KIND: Record<string, "ai_agent" | "ai_probe"> = { agente_assinado: "ai_agent", agente_ia: "ai_agent", isca: "ai_probe" };
const refused = () => new NextResponse("Forbidden", { status: 403, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, noai, noimageai" } });

/**
 * Destino interno dos pedidos de robôs e agentes de IA (o middleware reescreve para cá; ninguém chega direto).
 * Registra quem foi e sempre recusa. Se o robô estava usando a conta de um membro, a conta é bloqueada na hora
 * (agente de IA) ou leva um aviso (arquivo-isca), e o administrador recebe o alerta por e-mail.
 */
async function handle(request: Request) {
  if (request.headers.get("x-cg-guard") !== (await guardToken())) return new NextResponse("Not found", { status: 404 });
  const kind = KIND[request.headers.get("x-cg-motivo") ?? ""];
  if (!kind) return refused();
  const page = (request.headers.get("x-cg-caminho") ?? "").slice(0, 120);
  const agent = (request.headers.get("signature-agent") || request.headers.get("user-agent") || "").replace(/["\s]+/g, " ").trim().slice(0, 90);
  try {
    const session = await getServerSession().catch(() => null);
    if (session?.user?.id) {
      await fetchBackend("/security/report", {
        method: "POST", userId: session.user.id, extraHeaders: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, page, detail: agent }), cache: "no-store",
      });
    } else {
      const ip = (request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "desconhecido").split(",")[0].trim().slice(0, 60);
      await fetchBackend("/security/visit", {
        method: "POST", userId: "site", extraHeaders: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: kind === "ai_agent" ? "ai_visit" : "ai_probe_visit", ip, page, detail: agent }), cache: "no-store",
      });
    }
  } catch {
    // O registro é o de menos: o pedido é recusado de qualquer jeito.
  }
  return refused();
}

export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE, handle as HEAD, handle as OPTIONS };
