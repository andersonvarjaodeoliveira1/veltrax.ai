import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

// O Admin fica trancado mesmo para o administrador: é preciso confirmar a senha da conta.
// O destrave dura 30 minutos e é um cookie assinado (httpOnly), preso ao usuário.
export const ADMIN_COOKIE = "cg_admin_unlock";
export const ADMIN_UNLOCK_SECONDS = 30 * 60;

function sign(body: string): string {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) return "";
  return createHmac("sha256", secret).update(`admin-unlock:${body}`).digest("hex");
}

export function signUnlock(userId: string, now = Date.now()): string {
  const body = `${userId}.${now + ADMIN_UNLOCK_SECONDS * 1000}`;
  return `${body}.${sign(body)}`;
}

export function verifyUnlock(value: string | undefined, userId: string, now = Date.now()): boolean {
  if (!value) return false;
  const cut = value.lastIndexOf(".");
  if (cut < 0) return false;
  const body = value.slice(0, cut);
  const signature = value.slice(cut + 1);
  const expected = sign(body);
  if (!expected || signature.length !== expected.length) return false;
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return false;
  const [owner, expires] = [body.slice(0, body.lastIndexOf(".")), Number(body.slice(body.lastIndexOf(".") + 1))];
  return owner === userId && Number.isFinite(expires) && expires > now;
}

export async function isAdminUnlocked(userId: string): Promise<boolean> {
  try {
    return verifyUnlock((await cookies()).get(ADMIN_COOKIE)?.value, userId);
  } catch {
    return false;
  }
}

/** Devolve a resposta 403 quando o Admin está trancado, ou null quando pode seguir. */
export async function requireAdminUnlocked(userId: string): Promise<NextResponse | null> {
  if (await isAdminUnlocked(userId)) return null;
  return NextResponse.json({ error: "Admin locked", code: "admin_locked" }, { status: 403 });
}
