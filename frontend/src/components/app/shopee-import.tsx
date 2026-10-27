"use client";

import { useRef, useState } from "react";
import { Download, Loader2, PackageSearch, Paperclip } from "lucide-react";

type Found = { name: string; image: string };

async function toFile(item: Found, index: number): Promise<File> {
  const blob = await (await fetch(item.image)).blob();
  return new File([blob], `produto-${index + 1}.jpg`, { type: "image/jpeg" });
}

/** Importa as fotos de um produto da Shopee (link ou arquivos/.zip) para usar nos vídeos. */
export function ShopeeImport({ onUse, disabled }: { onUse: (files: File[], title: string) => void; disabled?: boolean }) {
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [found, setFound] = useState<Found[]>([]);
  const [title, setTitle] = useState("");
  const [picked, setPicked] = useState<number[]>([]);
  const [gallery, setGallery] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function run(form: FormData) {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/multiplier/clone/shopee-images", { method: "POST", body: form });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) { setError(typeof data?.detail === "string" ? data.detail : "Não consegui importar agora. Tente de novo."); return; }
      const images = (data.images ?? []) as Found[];
      setFound(images); setTitle(typeof data.title === "string" ? data.title : "");
      setPicked(images.slice(0, 3).map((_, i) => i));
      setGallery(data.seller_gallery === true); setConfirmed(false);
    } catch { setError("Não consegui importar agora. Tente de novo."); } finally { setBusy(false); }
  }

  const fromLink = () => { const form = new FormData(); form.append("url", link.trim()); void run(form); };
  const fromFiles = (files: FileList) => { const form = new FormData(); Array.from(files).slice(0, 20).forEach((file) => form.append("files", file)); void run(form); };
  const toggle = (index: number) => setPicked((current) => current.includes(index) ? current.filter((i) => i !== index) : current.length >= 3 ? current : [...current, index]);

  return (
    <div data-testid="shopee-import" className="space-y-3 rounded-[18px] border border-border bg-background/40 p-4">
      <p className="flex items-center gap-2 text-sm font-semibold"><PackageSearch className="size-4 text-[#A98BFF]" /> Importar da Shopee</p>
      <p className="rounded-[12px] border border-[#F5B454]/40 bg-[#F5B454]/10 p-3 text-xs text-foreground/90">
        Use só as <strong>fotos do anúncio do vendedor</strong> (a galeria do produto). Fotos de <strong>avaliações de clientes</strong> têm dono e podem gerar punição ou derrubar o vídeo. Pelo link, buscamos apenas a galeria do vendedor.
      </p>
      <form className="flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); if (link.trim()) fromLink(); }}>
        <input value={link} onChange={(event) => setLink(event.target.value)} placeholder="Cole o link do produto da Shopee" aria-label="Link do produto da Shopee" className="min-w-0 flex-1 rounded-full border border-border bg-background px-4 py-2 text-sm" />
        <button type="submit" disabled={busy || disabled || !link.trim()} className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[#8B5CF6] to-[#7B3FE4] px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {busy ? <Loader2 className="size-4 animate-spin" /> : null} Buscar imagens
        </button>
        <input ref={fileRef} type="file" multiple accept="image/png,image/jpeg,image/webp,.zip,application/zip" className="sr-only" aria-label="Anexar imagens ou ZIP do produto"
          onChange={(event) => { if (event.target.files?.length) fromFiles(event.target.files); event.target.value = ""; }} />
        <button type="button" disabled={busy || disabled} onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm disabled:opacity-50">
          <Paperclip className="size-4" /> Anexar imagens ou .zip
        </button>
      </form>
      {error && <p role="alert" className="text-xs text-[#F0466B]">{error}</p>}
      {found.length > 0 && (
        <div className="space-y-3">
          {gallery && <p className="text-xs font-medium text-[#5BD69A]">Imagens da galeria do vendedor (sem fotos de avaliações).</p>}
          {title && <p className="text-xs text-muted-foreground">Produto: <strong className="text-foreground">{title}</strong></p>}
          <p className="text-xs text-muted-foreground">Escolha até 3 fotos para a IA usar o produto nas cenas. As outras ficam disponíveis para baixar.</p>
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {found.map((item, index) => (
              <li key={index} className="relative">
                <button type="button" onClick={() => toggle(index)} aria-pressed={picked.includes(index)} aria-label={`Foto ${index + 1}${picked.includes(index) ? " (escolhida)" : ""}`}
                  className={`block aspect-square w-full overflow-hidden rounded-[12px] border-2 ${picked.includes(index) ? "border-[#7B3FE4]" : "border-transparent"}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.image} alt="" className="size-full object-cover" />
                </button>
                <a href={item.image} download={`produto-${index + 1}.jpg`} aria-label={`Baixar foto ${index + 1}`} className="absolute bottom-1 right-1 grid size-7 place-items-center rounded-full bg-black/60 text-white"><Download className="size-3.5" /></a>
              </li>
            ))}
          </ul>
          <label className="flex items-start gap-2 text-xs text-foreground/90">
            <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-0.5" />
            <span>Confirmo que estas fotos são do anúncio do vendedor (imagens do produto) e não de avaliações de clientes.</span>
          </label>
          <button type="button" disabled={!picked.length || !confirmed || busy || disabled} onClick={async () => { const files = await Promise.all(picked.sort((a, b) => a - b).map((i) => toFile(found[i], i))); onUse(files, title); }}
            className="rounded-full bg-gradient-to-br from-[#8B5CF6] to-[#7B3FE4] px-5 py-2 text-sm font-medium text-white disabled:opacity-50">
            Usar {picked.length} {picked.length === 1 ? "foto" : "fotos"} no produto
          </button>
        </div>
      )}
    </div>
  );
}
