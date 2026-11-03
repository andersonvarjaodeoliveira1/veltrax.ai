import { createTextProxyResponse, fetchBackend } from "@/server/backend-api";
import { requireUnlockedAdmin } from "@/server/admin-guard";

export async function GET(request: Request) {
  const check = await requireUnlockedAdmin();
  if ("error" in check) return check.error;
  const days = new URL(request.url).searchParams.get("days") ?? "7";
  const upstream = await fetchBackend(`/admin/activity?days=${encodeURIComponent(days)}`, { method: "GET", userId: check.userId, cache: "no-store" });
  return createTextProxyResponse(upstream);
}
