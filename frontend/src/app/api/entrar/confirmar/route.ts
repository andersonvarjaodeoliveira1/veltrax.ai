import { NextResponse } from "next/server";

import { BLOCKED_ACCOUNT_CODE, BLOCKED_ACCOUNT_MESSAGE, INACTIVE_MEMBER_CODE, LOGIN_TOKEN_RE } from "@/lib/acesso";
import { auth } from "@/lib/auth";
import { PENDING_ACCESS_CODE } from "@/lib/cadastro";

export const dynamic = "force-dynamic";

// Limite por endereço: o código do link tem 32 letras e não dá para adivinhar, mas a rota não precisa aceitar rajadas.
// Folgado de propósito: várias pessoas podem sair pelo mesmo endereço (operadora de celular, escritório).
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 60;
const attempts = new Map<string, number[]>();

function tooMany(ip: string, now = Date.now()) {
  const recent = (attempts.get(ip) ?? []).filter((at) => now - at < WINDOW_MS);
  recent.push(now);
  attempts.set(ip, recent);
  if (attempts.size > 5000) for (const [key, list] of attempts) if (list.every((at) => now - at >= WINDOW_MS)) attempts.delete(key);
  return recent.length > MAX_PER_WINDOW;
}

type Outcome = { status: number; message: string; location: string | null; cookies: string[] };

async function readOutcome(result: unknown): Promise<Outcome> {
  if (result instanceof Response) {
    const body = (await result.clone().json().catch(() => null)) as { message?: string } | null;
    return { status: result.status, message: body?.message ?? "", location: result.headers.get("location"), cookies: result.headers.getSetCookie?.() ?? [] };
  }
  // Recusa lançada pelo servidor de autenticação (por exemplo, conta sem liberação).
  const error = result as { statusCode?: number; status?: number | string; message?: string; body?: { message?: string }; headers?: Headers };
  const status = typeof error?.statusCode === "number" ? error.statusCode : typeof error?.status === "number" ? error.status : 500;
  return { status, message: error?.body?.message ?? error?.message ?? "", location: error?.headers?.get?.("location") ?? null, cookies: [] };
}

/** Troca o código do link de entrada por uma sessão. Só acontece quando a pessoa aperta o botão da tela. */
export async function POST(request: Request) {
  const ip = (request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "desconhecido").split(",")[0].trim();
  if (tooMany(ip)) return NextResponse.json({ ok: false, error: "too_many" }, { status: 429 });

  const body = (await request.json().catch(() => null)) as { token?: unknown } | null;
  const token = typeof body?.token === "string" ? body.token : "";
  if (!LOGIN_TOKEN_RE.test(token)) return NextResponse.json({ ok: false, error: "expired" }, { status: 400 });

  let outcome: Outcome;
  try {
    outcome = await readOutcome(await auth.api.magicLinkVerify({ query: { token }, headers: request.headers, asResponse: true }));
  } catch (error) {
    outcome = await readOutcome(error);
  }

  if (outcome.status === 200) {
    const response = NextResponse.json({ ok: true });
    for (const cookie of outcome.cookies) response.headers.append("set-cookie", cookie);
    return response;
  }
  if (outcome.message.includes(PENDING_ACCESS_CODE)) return NextResponse.json({ ok: false, error: "pending" }, { status: 403 });
  if (outcome.message.includes(INACTIVE_MEMBER_CODE)) return NextResponse.json({ ok: false, error: "inactive" }, { status: 403 });
  if (outcome.message.includes(BLOCKED_ACCOUNT_CODE)) return NextResponse.json({ ok: false, error: "blocked", message: BLOCKED_ACCOUNT_MESSAGE, support: true }, { status: 403 });
  if (outcome.status === 403) return NextResponse.json({ ok: false, error: "blocked", message: outcome.message }, { status: 403 });
  // Link já usado, vencido ou que nunca existiu: o servidor de autenticação responde com um redirecionamento de erro.
  if ((outcome.status >= 300 && outcome.status < 400) || /INVALID_TOKEN/i.test(outcome.location ?? outcome.message)) return NextResponse.json({ ok: false, error: "expired" }, { status: 400 });
  console.error("Falha ao confirmar o link de entrada", outcome.status, outcome.message.slice(0, 200));
  return NextResponse.json({ ok: false, error: "failed" }, { status: 500 });
}
