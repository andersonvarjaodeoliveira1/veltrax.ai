import { createTextProxyResponse, fetchBackend } from "@/server/backend-api";
import { requireUnlockedAdmin } from "@/server/admin-guard";

export async function GET() {
  const check = await requireUnlockedAdmin();
  if ("error" in check) return check.error;
  const upstream = await fetchBackend("/admin/usage", { method: "GET", userId: check.userId, cache: "no-store" });
  return createTextProxyResponse(upstream);
}
