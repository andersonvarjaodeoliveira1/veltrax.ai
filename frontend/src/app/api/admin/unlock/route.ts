import { NextResponse } from "next/server";
import { verifyPassword } from "better-auth/crypto";

import prisma from "@/lib/prisma";
import { ADMIN_COOKIE, ADMIN_UNLOCK_SECONDS, isAdminUnlocked, signUnlock } from "@/server/admin-lock";
import { requireAnnouncementAdmin } from "@/server/announcements";
import { getServerSession } from "@/server/session";

const attempts = new Map<string, number[]>();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function tooMany(userId: string, now = Date.now()): boolean {
  const recent = (attempts.get(userId) ?? []).filter((stamp) => now - stamp < WINDOW_MS);
  attempts.set(userId, recent);
  return recent.length >= MAX_ATTEMPTS;
}

export async function GET() {
  const session = await getServerSession();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(session.user as { is_admin?: boolean }).is_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ unlocked: await isAdminUnlocked(session.user.id) });
}

export async function POST(request: Request) {
  const denied = await requireAnnouncementAdmin(request, { allowLocked: true });
  if (denied) return denied;
  const session = await getServerSession();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (tooMany(userId)) return NextResponse.json({ error: "Too many attempts" }, { status: 429 });

  const body = (await request.json().catch(() => null)) as { password?: unknown } | null;
  const password = typeof body?.password === "string" ? body.password : "";
  if (!password || password.length > 256) return NextResponse.json({ error: "Wrong password" }, { status: 400 });

  const account = await prisma.account.findFirst({ where: { userId, providerId: "credential" }, select: { password: true } });
  const valid = account?.password ? await verifyPassword({ hash: account.password, password }).catch(() => false) : false;
  if (!valid) {
    attempts.set(userId, [...(attempts.get(userId) ?? []), Date.now()]);
    return NextResponse.json({ error: "Wrong password" }, { status: 401 });
  }
  attempts.delete(userId);
  const response = NextResponse.json({ unlocked: true });
  response.cookies.set(ADMIN_COOKIE, signUnlock(userId), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ADMIN_UNLOCK_SECONDS,
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ unlocked: false });
  response.cookies.set(ADMIN_COOKIE, "", { httpOnly: true, sameSite: "strict", path: "/", maxAge: 0 });
  return response;
}
