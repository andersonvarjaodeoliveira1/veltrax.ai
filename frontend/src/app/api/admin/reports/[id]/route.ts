import { createTextProxyResponse, fetchBackend } from "@/server/backend-api";
import { requireUnlockedAdmin } from "@/server/admin-guard";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const check = await requireUnlockedAdmin();
  if ("error" in check) return check.error;
  const { id } = await params;
  const upstream = await fetchBackend(`/admin/reports/${encodeURIComponent(id)}`, {
    method: "PATCH",
    userId: check.userId,
    extraHeaders: { "Content-Type": "application/json" },
    body: await request.text(),
    cache: "no-store",
  });
  return createTextProxyResponse(upstream);
}
