import { createTextProxyResponse, fetchBackend } from "@/server/backend-api";
import { requireUnlockedAdmin } from "@/server/admin-guard";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const check = await requireUnlockedAdmin();
  if ("error" in check) return check.error;
  const { id } = await params;
  const body = await request.text();
  const upstream = await fetchBackend(`/admin/users/${encodeURIComponent(id)}/tokens`, {
    method: "PUT",
    userId: check.userId,
    extraHeaders: { "Content-Type": "application/json" },
    body: body || "{}",
    cache: "no-store",
  });
  return createTextProxyResponse(upstream);
}
