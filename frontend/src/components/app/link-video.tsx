"use client";

import { useState } from "react";
import { Link2, Loader2 } from "lucide-react";

/** Cola o link de um vídeo (TikTok, Instagram, YouTube...): o servidor baixa e o vídeo segue como se tivesse sido enviado. */
export function LinkVideo({ onFile, disabled }: { onFile: (file: File) => void; disabled?: boolean }) {
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/multiplier/clone/video-from-link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: link.trim() }) });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(typeof data?.detail === "string" ? data.detail : "Não consegui baixar esse link. Baixe o vídeo e suba o arquivo.");
        return;
      }
      const blob = await response.blob();
      const ext = blob.type.includes("webm") ? "webm" : blob.type.includes("quicktime") ? "mov" : "mp4";
      setLink("");
      onFile(new File([blob], `video-do-link.${ext}`, { type: blob.type || "video/mp4" }));
    } catch {
      setError("Não consegui baixar esse link agora. Tente de novo ou suba o arquivo.");
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-1.5">
      <form className="flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); if (link.trim() && !busy) void load(); }}>
        <div className="relative min-w-0 flex-1">
          <Link2 aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input value={link} onChange={(event) => setLink(event.target.value)} disabled={busy || disabled} aria-label="Link do vídeo para clonar" placeholder="Ou cole o link do vídeo (TikTok, Instagram, YouTube)"
            className="w-full rounded-full border border-border bg-background py-2.5 pl-10 pr-4 text-sm" />
        </div>
        <button type="submit" disabled={busy || disabled || !link.trim()} className="inline-flex items-center gap-2 rounded-full border border-[#7B3FE4]/60 px-5 py-2.5 text-sm font-medium text-[#A98BFF] disabled:opacity-50">
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}{busy ? "Baixando o vídeo…" : "Usar o link"}
        </button>
      </form>
      {error && <p role="alert" className="px-2 text-xs text-[#F0466B]">{error}</p>}
    </div>
  );
}
