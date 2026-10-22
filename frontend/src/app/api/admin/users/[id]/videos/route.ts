import { createTextProxyResponse, fetchBackend } from "@/server/backend-api";
import { requireUnlockedAdmin } from "@/server/admin-guard";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const check = await requireUnlockedAdmin();
  if ("error" in check) return check.error;
  const { id } = await params;
  const upstream = await fetchBackend(`/admin/users/${encodeURIComponent(id)}/videos`, { method: "GET", userId: check.userId, cache: "no-store" });
  return createTextProxyResponse(upstream);
}
