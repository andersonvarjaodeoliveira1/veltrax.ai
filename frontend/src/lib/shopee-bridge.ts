/** Pede à extensão do ClipGringa para abrir o anúncio da Shopee no navegador da pessoa e devolver os vídeos e fotos do anúncio. */

export type ShopeeRead = { ok: true; title: string; videos: { url: string; poster: string }[]; images: string[] } | { ok: false; error: "no-extension" | "login" | "empty" | "invalid" | "failed" };

const SHOPEE_HOST = /^(?:[\w-]+\.)*(?:shopee\.com\.br|shopee\.com|shp\.ee)$/i;

export function normalizeShopeeUrl(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    return url.protocol === "https:" && SHOPEE_HOST.test(url.hostname) ? url.href : null;
  } catch { return null; }
}

export function readShopeeViaExtension(url: string, timeoutMs = 45_000): Promise<ShopeeRead> {
  return new Promise((resolve) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    let acked = false;
    const finish = (value: ShopeeRead) => { window.removeEventListener("message", onMsg); window.clearTimeout(ackTimer); window.clearTimeout(endTimer); resolve(value); };
    const onMsg = (event: MessageEvent) => {
      if (event.source !== window || event.data?.source !== "clipgringa-flow" || event.data?.id !== id) return;
      if (event.data.type === "shopee-ack") { acked = true; return; }
      if (event.data.type === "shopee-result") {
        const data = event.data.data ?? {};
        if (data.ok) finish({ ok: true, title: String(data.title ?? ""), videos: Array.isArray(data.videos) ? data.videos : [], images: Array.isArray(data.images) ? data.images : [] });
        else finish({ ok: false, error: ["login", "empty", "invalid"].includes(data.error) ? data.error : "failed" });
      }
    };
    window.addEventListener("message", onMsg);
    const ackTimer = window.setTimeout(() => { if (!acked) finish({ ok: false, error: "no-extension" }); }, 1500);
    const endTimer = window.setTimeout(() => finish({ ok: false, error: "failed" }), timeoutMs);
    window.postMessage({ source: "clipgringa-page", type: "shopee-read", id, url }, window.location.origin);
  });
}
