"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, Loader2, Trash2 } from "lucide-react";

type FlowVideo = { id: string; package: string; file: string; kind?: "video" | "image"; size: number; created_at: string | null };

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export function FlowLibrary({ kind }: { kind: "video" | "image" }) {
  const [videos, setVideos] = useState<FlowVideo[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/multiplier/flow-videos", { cache: "no-store" });
      if (!response.ok) throw new Error();
      setVideos(((await response.json()).videos ?? []) as FlowVideo[]);
      setFailed(false);
    } catch {
      setFailed(true);
      setVideos((current) => current ?? []);
    }
  }, []);

  // Atualiza sozinho: os vídeos chegam enquanto o Flow ainda está gerando.
  useEffect(() => {
    void load();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 10000);
    return () => window.clearInterval(timer);
  }, [load]);

  async function remove(id: string) {
    setConfirm(null);
    setVideos((current) => (current ?? []).filter((video) => video.id !== id));
    await fetch(`/api/multiplier/flow-videos/${id}`, { method: "DELETE" }).catch(() => undefined);
  }

  const images = kind === "image" ? (videos ?? []).filter((item) => item.kind === "image") : [];
  const groups = new Map<string, FlowVideo[]>();
  for (const video of kind === "video" ? (videos ?? []).filter((item) => item.kind !== "image") : []) {
    const key = video.package || "Sem pacote";
    groups.set(key, [...(groups.get(key) ?? []), video]);
  }

  return (
    <div className="space-y-6">
      {videos === null && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Carregando seus vídeos…</p>}
      {failed && <p className="text-sm text-[#F5B454]">Não consegui atualizar agora. Tento de novo em instantes.</p>}
      {videos && !failed && (kind === "video" ? groups.size === 0 : images.length === 0) && (
        <div className="rounded-[18px] border border-border bg-card p-6 text-sm" data-testid="flow-videos-empty">
          <p className="font-medium">{kind === "video" ? "Ainda não chegou nenhum vídeo." : "Ainda não chegou nenhuma imagem."}</p>
          <p className="mt-1 text-muted-foreground">Clone um vídeo com a extensão ligada e {kind === "video" ? "os vídeos" : "as imagens"} aparecem aqui sozinhos, só na sua conta.</p>
        </div>
      )}
      {[...groups.entries()].map(([name, items]) => (
        <section key={name} className="space-y-3" data-testid="flow-videos-group">
          <h2 className="text-sm font-semibold">{name} <span className="font-normal text-muted-foreground">· {items.length} {items.length === 1 ? "vídeo" : "vídeos"}</span></h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {items.map((video) => (
              <article key={video.id} className="overflow-hidden rounded-[18px] border border-border bg-card">
                <video controls preload="metadata" playsInline src={`/api/multiplier/flow-videos/${video.id}/file`} className="aspect-[9/16] w-full bg-black object-contain" aria-label={video.file} />
                <div className="space-y-2 p-3">
                  <p className="truncate text-sm font-medium" title={video.file}>{video.file}</p>
                  <p className="text-[11px] text-muted-foreground">{mb(video.size)}{video.created_at ? ` · ${new Date(video.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}` : ""}</p>
                  <div className="flex items-center gap-2">
                    <a href={`/api/multiplier/flow-videos/${video.id}/file?download=1`} download={video.file}
                      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full bg-gradient-to-br from-[#8B5CF6] to-[#7B3FE4] px-3 py-1.5 text-xs font-medium text-white">
                      <Download className="size-3.5" /> Baixar
                    </a>
                    {confirm === video.id ? (
                      <button type="button" onClick={() => void remove(video.id)} className="rounded-full border border-[#F0466B]/60 px-3 py-1.5 text-xs text-[#F0466B]">Apagar mesmo</button>
                    ) : (
                      <button type="button" onClick={() => setConfirm(video.id)} aria-label={`Apagar ${video.file}`} className="rounded-full border border-border p-2 text-muted-foreground hover:text-foreground"><Trash2 className="size-3.5" /></button>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}
      {kind === "image" && images.length > 0 && (
        <section className="space-y-3" data-testid="flow-images">
          <h2 className="text-sm font-semibold">Banco de imagens <span className="font-normal text-muted-foreground">· {images.length} {images.length === 1 ? "imagem" : "imagens"} · só você vê</span></h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {images.map((image) => (
              <article key={image.id} className="overflow-hidden rounded-[14px] border border-border bg-card">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/multiplier/flow-videos/${image.id}/file`} alt={image.file} loading="lazy" className="aspect-[9/16] w-full bg-black object-cover" />
                <div className="flex items-center justify-between gap-2 p-2">
                  <p className="truncate text-[11px] text-muted-foreground" title={image.package}>{image.file}</p>
                  <a href={`/api/multiplier/flow-videos/${image.id}/file?download=1`} download={image.file} aria-label={`Baixar ${image.file}`} className="grid size-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#8B5CF6] to-[#7B3FE4] text-white"><Download className="size-3.5" /></a>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
