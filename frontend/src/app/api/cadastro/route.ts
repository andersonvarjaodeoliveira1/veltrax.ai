import { NextResponse } from "next/server";

import { createSignupRequest } from "@/server/signup-requests";

export const dynamic = "force-dynamic";

// Limite simples por endereço: a captura é pública e cria conta, então não pode virar fábrica de cadastros.
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 8;
const attempts = new Map<string, number[]>();

function tooMany(ip: string, now = Date.now()) {
  const recent = (attempts.get(ip) ?? []).filter((at) => now - at < WINDOW_MS);
  recent.push(now);
  attempts.set(ip, recent);
  if (attempts.size > 5000) for (const [key, list] of attempts) if (list.every((at) => now - at >= WINDOW_MS)) attempts.delete(key);
  return recent.length > MAX_PER_WINDOW;
}

// Captura do cadastro: nome, e-mail, CPF, telefone e senha. A conta nasce aguardando a liberação do administrador.
export async function POST(request: Request) {
  const ip = (request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "desconhecido").split(",")[0].trim();
  if (tooMany(ip)) return NextResponse.json({ error: "too_many", message: "Muitas tentativas. Tente de novo mais tarde." }, { status: 429 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") return NextResponse.json({ error: "invalid", fields: {} }, { status: 400 });

  try {
    const result = await createSignupRequest({ name: body.name, email: body.email, cpf: body.cpf, phone: body.phone, password: body.password });
    if (result.ok) return NextResponse.json({ ok: true });
    if (result.error === "invalid") return NextResponse.json(result, { status: 400 });
    return NextResponse.json(result, { status: 409 });
  } catch (error) {
    console.error("Falha ao criar o cadastro", error);
    return NextResponse.json({ error: "failed", message: "Não foi possível criar a conta agora. Tente de novo em instantes." }, { status: 500 });
  }
}
