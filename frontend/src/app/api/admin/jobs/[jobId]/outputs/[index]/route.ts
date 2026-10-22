import { createProxyResponse, fetchBackend } from "@/server/backend-api";
import { requireUnlockedAdmin } from "@/server/admin-guard";

export async function GET(request: Request, { params }: { params: Promise<{ jobId: string; index: string }> }) {
  const check = await requireUnlockedAdmin();
  if ("error" in check) return check.error;
  const { jobId, index } = await params;
  const search = new URL(request.url).search;
  const upstream = await fetchBackend(`/admin/jobs/${encodeURIComponent(jobId)}/outputs/${encodeURIComponent(index)}${search}`, {
    method: "GET",
    signal: request.signal,
    userId: check.userId,
    extraHeaders: request.headers.get("range") ? { Range: request.headers.get("range") as string } : {},
    cache: "no-store",
  });
  return createProxyResponse(upstream);
}
