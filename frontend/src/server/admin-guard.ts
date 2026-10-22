import { NextResponse } from "next/server";

import { requireAdminUnlocked } from "@/server/admin-lock";
import { getServerSession } from "@/server/session";

/** Administrador logado E com o Admin destravado (senha confirmada). Qualquer outro caso é recusado. */
export async function requireUnlockedAdmin() {
  const session = await getServerSession();
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) } as const;
  }
  if (!(session.user as { is_admin?: boolean }).is_admin) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) } as const;
  }
  const locked = await requireAdminUnlocked(session.user.id);
  if (locked) return { error: locked } as const;
  return { userId: session.user.id } as const;
}
