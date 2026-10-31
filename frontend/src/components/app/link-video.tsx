"use client";

import { useEffect, useState } from "react";
import { Download, Link2, Loader2 } from "lucide-react";
import { expandShopeeLink, normalizeShopeeUrl, readShopeeViaExtension } from "@/lib/shopee-bridge";

const STEPS_SHOPEE = ["Abrindo o anúncio da Shopee…", "Procurando os vídeos do vendedor…", "Separando as fotos do produto…", "Quase pronto…"];
const STEPS_LINK = ["Abrindo o link…", "Localizando o vídeo…", "Baixando o vídeo…", "Quase pronto…"];

/** Animação enquanto o link é lido: barra de varredura + etapas que vão mudando. */
function LinkLoading({ shopee }: { shopee: boolean }) {
  const steps = shopee ? STEPS_SHOPEE : STEPS_LINK;
  const [step, setStep] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setStep((current) => Math.min(current + 1, steps.length - 1)), 2200);
    return () => window.clearInterval(timer);
  }, [steps.length]);
  return (
    <div role="status" aria-live="polite" data-testid="link-loading" className="cg-scan space-y-2 rounded-[18px] border border-[#7B3FE4]/40 bg-[#7B3FE4]/10 p-4">
      <p className="flex items-center gap-2 text-sm font-medium text-foreground"><span aria-hidden className="cg-dots"><i /><i /><i /></span><span key={step} className="qc-in">{steps[step]}</span></p>
      <div aria-hidden className="cg-scanbar"><span /></div>
      <p className="text-xs text-muted-foreground">Pode levar alguns segundos. Não feche esta tela.</p>
    </div>
  );
}

/** Cola o link de um vídeo (TikTok, Instagram, YouTube...): o servidor baixa e o vídeo segue como se tivesse sido enviado. */
export function LinkVideo({ onFile, disabled }: { onFile: (file: File) => void; onPhotos?: (files: File[], title: string) => void; photoLabel?: string; disabled?: boolean }) {
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [videos, setVideos] = useState<{ url: string; poster: string }[]>([]);
  const [title, setTitle] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const isShopee = !!normalizeShopeeUrl(link);

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

  async function load(raw = link) {
    setBusy(true); setError(""); setVideos([]); setPhotos([]);
    const shopee = normalizeShopeeUrl(raw);
    if (shopee) {
      // A Shopee bloqueia o servidor, mas não o navegador da pessoa: a extensão abre o anúncio e lê os vídeos.
      const read = await readShopeeViaExtension(await expandShopeeLink(shopee));
      if (read.ok) {
        setBusy(false);
        setTitle(read.title);
        if (read.videos.length) setVideos(read.videos);
        if (read.images.length) {
          // As fotos só aparecem para a pessoa escolher, baixar e subir. Nada é usado sozinho: a IA precisa da foto certa do produto.
          setPhotos(read.images.slice(0, 9));
        }
        if (!read.videos.length && !read.images.length) setError("Abri o anúncio, mas não achei vídeo nem fotos do vendedor. Confira se o link é de um produto e tente de novo.");
        return;
      }
      // A Shopee bloqueia o servidor, então cair no download pelo servidor só esconde o motivo real. Diz o que houve de verdade.
      setBusy(false);
      if (read.error === "login") setError("A Shopee pediu login ou uma verificação no seu navegador. Entre na Shopee (shopee.com.br) nesse mesmo Chrome e tente de novo.");
      else if (read.error === "no-extension") setError("Não encontrei a extensão ClipGringa · Flow neste Chrome. Aperte Ctrl+F5 nesta página; se continuar, confira em chrome://extensions se ela está ligada (versão 1.21.2) e recarregue-a.");
      else if (read.error === "notfound") setError("Esse anúncio da Shopee não existe mais ou saiu do ar. Confira o link e tente com outro produto.");
      else if (read.error === "empty") setError("Abri o anúncio, mas não achei vídeo nem fotos do vendedor. Confira se o link é de um produto e tente de novo.");
      else if (read.error === "timeout") setError("A Shopee demorou demais para abrir o anúncio (mais de 1 minuto). Abra o produto na Shopee neste mesmo Chrome, espere carregar e cole o link de novo: eu leio a aba que você já abriu.");
      else setError("Não consegui ler o anúncio da Shopee. Abra o produto na Shopee neste mesmo Chrome, espere carregar e cole o link de novo. Se repetir, baixe a foto ou o vídeo e suba o arquivo.");
      return;
    }
    try {
      const response = await fetch("/api/multiplier/clone/video-from-link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: raw.trim() }) });
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
          <input value={link} onChange={(event) => setLink(event.target.value)} onPaste={(event) => { const text = event.clipboardData.getData("text").trim(); if (/^https?:\/\/\S+$/i.test(text) && !busy && !disabled) { event.preventDefault(); setLink(text); void load(text); } }} disabled={busy || disabled} aria-label="Link do vídeo para clonar" placeholder="Ou cole o link do vídeo (qualquer site: TikTok, Instagram, YouTube, Shopee…)"
            className="w-full rounded-full border border-border bg-background py-2.5 pl-10 pr-4 text-sm" />
        </div>
        <button type="submit" disabled={busy || disabled || !link.trim()} className="inline-flex items-center gap-2 rounded-full border border-[#7B3FE4]/60 px-5 py-2.5 text-sm font-medium text-[#A98BFF] disabled:opacity-50">
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}{busy ? "Buscando o vídeo…" : "Usar o link"}
        </button>
      </form>
      </div>
      {busy && videos.length === 0 && <LinkLoading shopee={isShopee} />}
      {photos.length > 0 && (
        <div data-testid="shopee-photos" className="space-y-2 rounded-[18px] border border-border bg-background/40 p-3">
          <p className="text-xs text-muted-foreground">
            {videos.length ? "Fotos do anúncio" : <>Este anúncio não tem vídeo do vendedor, mas tem <strong className="text-foreground">{photos.length} {photos.length === 1 ? "foto" : "fotos"}</strong></>}
            {title ? <> de <strong className="text-foreground">{title}</strong></> : null}. São da galeria do vendedor.
          </p>
          <p className="text-xs text-muted-foreground">Baixe <strong className="text-foreground">só a foto do produto</strong> que você quer usar (toque no botão de baixar) e depois suba o arquivo em <strong className="text-foreground">Escolher o vídeo ou imagem</strong>. Assim a IA identifica exatamente o produto.</p>
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {photos.map((src, index) => (
              <li key={src} className="relative overflow-hidden rounded-[12px]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt={`Foto ${index + 1} do anúncio`} referrerPolicy="no-referrer" className="aspect-square w-full object-cover" />
                <a href={src} download={`produto-${index + 1}.jpg`} target="_blank" rel="noreferrer" aria-label={`Baixar foto ${index + 1}`} className="absolute bottom-1 right-1 grid size-7 place-items-center rounded-full bg-black/60 text-white"><Download className="size-3.5" /></a>
              </li>
            ))}
          </ul>
        </div>
      )}
      {videos.length > 0 && (
        <div data-testid="shopee-videos" className="space-y-2 rounded-[18px] border border-border bg-background/40 p-3">
          <p className="text-xs text-muted-foreground">{title ? <>Vídeos do anúncio <strong className="text-foreground">{title}</strong>. </> : "Vídeos do anúncio. "}Escolha qual clonar ou baixe para o seu computador e suba o arquivo (só vídeos do vendedor, não de avaliações).</p>
          <ul className="grid gap-3 sm:grid-cols-3">
            {videos.map((video, index) => (
              <li key={video.url} className="space-y-1.5">
                <video controls muted playsInline preload="metadata" poster={video.poster || undefined} src={video.url} className="aspect-[9/16] w-full rounded-[12px] bg-black object-cover" aria-label={`Vídeo ${index + 1} do anúncio`} />
                <button type="button" disabled={busy || disabled} onClick={() => void pickShopeeVideo(video.url)} className="w-full rounded-full bg-gradient-to-br from-[#8B5CF6] to-[#7B3FE4] px-3 py-2 text-xs font-medium text-white disabled:opacity-50">
                  {busy ? "Baixando…" : `Usar o vídeo ${index + 1}`}
                </button>
                <a href={video.url} download={`video-${index + 1}.mp4`} target="_blank" rel="noreferrer" aria-label={`Baixar vídeo ${index + 1}`} className="flex w-full items-center justify-center gap-1.5 rounded-full border border-border px-3 py-2 text-xs font-medium text-foreground"><Download className="size-3.5" />Baixar o vídeo {index + 1}</a>
              </li>
            ))}
          </ul>
        </div>
      )}
      {error && <p role="alert" className="px-2 text-xs text-[#F0466B]">{error}</p>}
    </div>
  );
}
