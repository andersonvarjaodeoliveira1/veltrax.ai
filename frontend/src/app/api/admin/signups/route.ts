import { NextResponse } from "next/server";

import { requireUnlockedAdmin } from "@/server/admin-guard";
import { setMemberExempt } from "@/server/member-access";
import { decideSignupRequest, listRegisteredUsers, listSignupRequests } from "@/server/signup-requests";

export const dynamic = "force-dynamic";

// Cadastros da captura (nome, e-mail, CPF e telefone): só o administrador com o Admin destravado vê e decide.
// ?all=1 traz todas as contas (aba Cadastros); sem isso, só os pedidos da captura.
export async function GET(request: Request) {
  const check = await requireUnlockedAdmin();
  if ("error" in check) return check.error;
  if (new URL(request.url).searchParams.get("all") === "1") return NextResponse.json({ users: await listRegisteredUsers() });
  return NextResponse.json({ items: await listSignupRequests() });
}

export async function POST(request: Request) {
  const check = await requireUnlockedAdmin();
  if ("error" in check) return check.error;
  const body = (await request.json().catch(() => ({}))) as { userId?: unknown; action?: unknown };
  if (typeof body.userId !== "string") return NextResponse.json({ error: "invalid" }, { status: 400 });
  // Conta de assinante: manter o acesso mesmo sem assinatura ativa, ou voltar a exigir a assinatura.
  if (body.action === "keep" || body.action === "unkeep") {
    if (!(await setMemberExempt(body.userId, body.action === "keep"))) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  }
  if (body.action !== "approve" && body.action !== "decline") {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const result = await decideSignupRequest(body.userId, body.action);
  if (!result.ok) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(result);
}
