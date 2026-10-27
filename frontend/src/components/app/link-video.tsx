"use client";

import { useState } from "react";
import { Link2, Loader2 } from "lucide-react";
import { normalizeShopeeUrl, readShopeeViaExtension } from "@/lib/shopee-bridge";

/** Cola o link de um vídeo (TikTok, Instagram, YouTube...): o servidor baixa e o vídeo segue como se tivesse sido enviado. */
export function LinkVideo({ onFile, disabled }: { onFile: (file: File) => void; disabled?: boolean }) {
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [videos, setVideos] = useState<{ url: string; poster: string }[]>([]);
  const [title, setTitle] = useState("");

  async function toFile(response: Response) {
    const blob = await response.blob();
    const ext = blob.type.includes("webm") ? "webm" : blob.type.includes("quicktime") ? "mov" : "mp4";
    return new File([blob], `video-do-link.${ext}`, { type: blob.type || "video/mp4" });
  }

  async function pickShopeeVideo(cdnUrl: string) {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/multiplier/clone/video-from-link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cdn_url: cdnUrl }) });
      if (!response.ok) { const data = await response.json().catch(() => ({})); setError(typeof data?.detail === "string" ? data.detail : "Não consegui baixar esse vídeo. Baixe e suba o arquivo."); return; }
      setVideos([]); setLink("");
      onFile(await toFile(response));
    } catch { setError("Não consegui baixar esse vídeo agora. Tente de novo."); } finally { setBusy(false); }
  }

  async function load() {
    setBusy(true); setError(""); setVideos([]);
    const shopee = normalizeShopeeUrl(link);
    if (shopee) {
      // A Shopee bloqueia o servidor, mas não o navegador da pessoa: a extensão abre o anúncio e lê os vídeos.
      const read = await readShopeeViaExtension(shopee);
      if (read.ok) {
        setBusy(false);
        if (!read.videos.length) { setError("Esse anúncio não tem vídeo do vendedor. Use “Importar da Shopee” no bloco do produto para pegar as fotos."); return; }
        setTitle(read.title); setVideos(read.videos);
        return;
      }
      if (read.error === "login") { setBusy(false); setError("A Shopee pediu login no seu navegador. Entre na Shopee e tente de novo."); return; }
      // sem extensão (ou ela não conseguiu): tenta pelo servidor
    }
    try {
      const response = await fetch("/api/multiplier/clone/video-from-link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: link.trim() }) });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(typeof data?.detail === "string" ? data.detail : "Não consegui baixar esse link. Baixe o vídeo e suba o arquivo.");
        return;
      }
      setLink("");
      onFile(await toFile(response));
    } catch {
      setError("Não consegui baixar esse link agora. Tente de novo ou suba o arquivo.");
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-1.5">
      <div className="cg-linkglow">
      <form className="flex flex-wrap gap-2 rounded-[26px] bg-card p-3" onSubmit={(event) => { event.preventDefault(); if (link.trim() && !busy) void load(); }}>
        <div className="relative min-w-0 flex-1">
          <Link2 aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input value={link} onChange={(event) => setLink(event.target.value)} disabled={busy || disabled} aria-label="Link do vídeo para clonar" placeholder="Ou cole o link do vídeo (TikTok, Instagram, YouTube, Shopee)"
            className="w-full rounded-full border border-border bg-background py-2.5 pl-10 pr-4 text-sm" />
        </div>
        <button type="submit" disabled={busy || disabled || !link.trim()} className="inline-flex items-center gap-2 rounded-full border border-[#7B3FE4]/60 px-5 py-2.5 text-sm font-medium text-[#A98BFF] disabled:opacity-50">
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}{busy ? "Buscando o vídeo…" : "Usar o link"}
        </button>
      </form>
      </div>
      {videos.length > 0 && (
        <div data-testid="shopee-videos" className="space-y-2 rounded-[18px] border border-border bg-background/40 p-3">
          <p className="text-xs text-muted-foreground">{title ? <>Vídeos do anúncio <strong className="text-foreground">{title}</strong>. </> : "Vídeos do anúncio. "}Escolha qual clonar (só vídeos do vendedor, não de avaliações).</p>
          <ul className="grid gap-3 sm:grid-cols-3">
            {videos.map((video, index) => (
              <li key={video.url} className="space-y-1.5">
                <video controls muted playsInline preload="metadata" poster={video.poster || undefined} src={video.url} className="aspect-[9/16] w-full rounded-[12px] bg-black object-cover" aria-label={`Vídeo ${index + 1} do anúncio`} />
                <button type="button" disabled={busy || disabled} onClick={() => void pickShopeeVideo(video.url)} className="w-full rounded-full bg-gradient-to-br from-[#8B5CF6] to-[#7B3FE4] px-3 py-2 text-xs font-medium text-white disabled:opacity-50">
                  {busy ? "Baixando…" : `Usar o vídeo ${index + 1}`}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {error && <p role="alert" className="px-2 text-xs text-[#F0466B]">{error}</p>}
    </div>
  );
}
