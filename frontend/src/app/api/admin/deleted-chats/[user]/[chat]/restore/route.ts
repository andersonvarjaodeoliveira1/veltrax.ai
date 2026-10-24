import { createTextProxyResponse, fetchBackend } from "@/server/backend-api";
import { requireUnlockedAdmin } from "@/server/admin-guard";

export async function POST(_request: Request, { params }: { params: Promise<{ user: string; chat: string }> }) {
  const check = await requireUnlockedAdmin();
  if ("error" in check) return check.error;
  const { user, chat } = await params;
  const upstream = await fetchBackend(`/admin/deleted-chats/${encodeURIComponent(user)}/${encodeURIComponent(chat)}/restore`, {
    method: "POST",
    userId: check.userId,
    cache: "no-store",
  });
  return createTextProxyResponse(upstream);
}
