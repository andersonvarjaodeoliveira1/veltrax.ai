"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Clapperboard, Download, Loader2, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";

type FlowVideo = { id: string; package: string; file: string; size: number; created_at: string | null };

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export default function FlowVideosPage() {
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

  const groups = new Map<string, FlowVideo[]>();
  for (const video of videos ?? []) {
    const key = video.package || "Sem pacote";
    groups.set(key, [...(groups.get(key) ?? []), video]);
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-8">
      <PageHeader icon={Clapperboard} title="Vídeos do Flow"
        description="Os vídeos que a extensão gera no Google Flow chegam aqui sozinhos. Assista e baixe sem sair do ClipGringa." />
      {videos === null && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Carregando seus vídeos…</p>}
      {failed && <p className="text-sm text-[#F5B454]">Não consegui atualizar agora. Tento de novo em instantes.</p>}
      {videos && videos.length === 0 && !failed && (
        <div className="rounded-[18px] border border-border bg-card p-6 text-sm" data-testid="flow-videos-empty">
          <p className="font-medium">Ainda não chegou nenhum vídeo.</p>
          <p className="mt-1 text-muted-foreground">Monte um pacote no <Link href="/influencer" className="underline">Avatar influencer</Link>, abra o Flow com a extensão ligada e os vídeos aparecem aqui conforme ficam prontos.</p>
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
    </div>
  );
}
