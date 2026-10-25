// Destino de envio dos vídeos gerados no Flow: a extensão manda cada vídeo direto para a API do ClipGringa
// usando um token curto (a sessão do site não existe dentro da aba do Flow).
const HOSTED_API = "https://api.clipgringa.gringatools.com";

export type FlowUpload = { url: string; token: string; package: string };

export async function flowUploadInfo(label: string): Promise<FlowUpload | null> {
  try {
    const response = await fetch("/api/multiplier/flow-videos/token", { method: "POST" });
    if (!response.ok) return null;
    const { token } = (await response.json()) as { token?: string };
    if (!token) return null;
    const configured = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");
    const base = configured.startsWith("https://") ? configured : HOSTED_API;
    return { url: `${base}/multiplier/flow-videos/upload`, token, package: label.slice(0, 120) };
  } catch {
    return null;
  }
}
