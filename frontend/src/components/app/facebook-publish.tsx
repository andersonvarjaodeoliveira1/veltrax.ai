"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { getClipUrl } from "@/lib/clip-actions";
import { useI18n } from "@/lib/i18n";

type Page = { name: string; url: string };
type Status = { loggedIn: boolean; pages: Page[]; version: string } | "none" | null;
type Lang3 = "pt" | "en" | "es";
const T = {
  btn: ["Publicar no Facebook", "Post to Facebook", "Publicar en Facebook"],
  title: ["Publicar na sua página", "Post to your Page", "Publicar en tu página"],
  desc: ["A extensão posta o vídeo na página escolhida, usando o seu login do Facebook no Chrome.", "The extension posts the video to the chosen Page using your Facebook login in Chrome.", "La extensión publica el video en la página elegida con tu sesión de Facebook en Chrome."],
  noExt: ["Não encontrei a extensão ClipGringa · Flow. Instale a versão 1.1.0 ou mais nova e recarregue esta página.", "ClipGringa · Flow extension not found. Install version 1.1.0 or newer and reload this page.", "No encontré la extensión ClipGringa · Flow. Instala la versión 1.1.0 o más nueva y recarga la página."],
  loggedOut: ["Abra o Facebook no Chrome e entre na sua conta. Depois volte aqui.", "Open Facebook in Chrome and sign in, then come back here.", "Abre Facebook en Chrome e inicia sesión, luego vuelve aquí."],
  noPages: ["Nenhuma página salva ainda. Abra a sua página no Facebook e clique em “Salvar esta página no ClipGringa”.", "No saved Page yet. Open your Page on Facebook and click “Salvar esta página no ClipGringa”.", "Aún no hay páginas guardadas. Abre tu página en Facebook y haz clic en “Salvar esta página no ClipGringa”."],
  page: ["Página", "Page", "Página"],
  caption: ["Legenda do post", "Post caption", "Texto del post"],
  gen: ["Escrever com IA", "Write with AI", "Escribir con IA"],
  publish: ["Publicar agora", "Post now", "Publicar ahora"],
  opening: ["Abrindo a sua página… acompanhe pelo painel no Facebook.", "Opening your Page… follow it in the panel on Facebook.", "Abriendo tu página… sigue el panel en Facebook."],
  fail: ["Não consegui enviar para a extensão. Tente de novo.", "Could not send to the extension. Try again.", "No pude enviarlo a la extensión. Inténtalo de nuevo."],
  beta: ["BETA", "BETA", "BETA"],
} satisfies Record<string, [string, string, string]>;
const LANG_CODE: Record<Lang3, string> = { pt: "pt-BR", en: "en", es: "es" };

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let out = "";
  for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return window.btoa(out);
}

export function FacebookPublish({ clip, className }: { clip: { filename: string; video_url: string; text?: string; hook_title?: string | null }; className?: string }) {
  const { lang } = useI18n();
  const l = (lang === "en" || lang === "es" ? lang : "pt") as Lang3;
  const t = (key: keyof typeof T) => T[key][l === "pt" ? 0 : l === "en" ? 1 : 2];
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [pageUrl, setPageUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState<"" | "gen" | "send">("");
  const answered = useRef(false);

  useEffect(() => {
    if (!open) return;
    answered.current = false;
    const onMessage = (event: MessageEvent) => {
      const d = event.data;
      if ((event.origin && event.origin !== window.location.origin) || !d || d.source !== "clipgringa-flow") return;
      if (d.type === "fb-status") {
        answered.current = true;
        const pages: Page[] = Array.isArray(d.pages) ? d.pages : [];
        setStatus({ loggedIn: d.loggedIn === true, pages, version: String(d.version || "") });
        setPageUrl((current) => current || pages[0]?.url || "");
      } else if (d.type === "fb-publish-ack") {
        setBusy("");
        if (d.ok) { toast.success(t("opening")); setOpen(false); } else toast.error(t("fail"));
      }
    };
    window.addEventListener("message", onMessage);
    window.postMessage({ source: "clipgringa-page", type: "fb-status?" }, window.location.origin);
    const timer = window.setTimeout(() => { if (!answered.current) setStatus("none"); }, 2500);
    return () => { window.removeEventListener("message", onMessage); window.clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function generate() {
    setBusy("gen");
    try {
      const response = await fetch("/api/multiplier/clone/influencer-caption", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: clip.text ?? "", title: clip.hook_title ?? "", language: LANG_CODE[l] }),
      });
      if (!response.ok) throw new Error("caption");
      const data = (await response.json()) as { caption?: string };
      setCaption(data.caption ?? "");
    } catch { toast.error(t("fail")); } finally { setBusy(""); }
  }

  async function publish() {
    setBusy("send");
    try {
      const video = await fetch(getClipUrl(clip.video_url, clip.filename));
      if (!video.ok) throw new Error("video");
      const buffer = await video.arrayBuffer();
      window.postMessage({ source: "clipgringa-page", type: "fb-publish", job: { pageUrl, caption, filename: clip.filename, mime: "video/mp4", b64: toBase64(buffer) } }, window.location.origin);
      window.setTimeout(() => setBusy((current) => { if (current === "send") { toast.error(t("fail")); return ""; } return current; }), 20000);
    } catch { setBusy(""); toast.error(t("fail")); }
  }

  const ready = status && status !== "none" && status.loggedIn && status.pages.length > 0;
  return (
    <>
      <Button size="sm" variant="outline" className={className ?? "h-7 px-2 text-xs"} onClick={() => setOpen(true)} aria-label={t("btn")}>
        <Send className="size-3.5" /> f <span className="rounded-full bg-[#7B3FE4] px-1.5 text-[9px] font-semibold text-white">{t("beta")}</span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("desc")}</DialogDescription>
          {status === null && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /></p>}
          {status === "none" && <p className="text-sm">{t("noExt")}</p>}
          {status && status !== "none" && !status.loggedIn && <p className="text-sm">{t("loggedOut")}</p>}
          {status && status !== "none" && status.loggedIn && status.pages.length === 0 && <p className="text-sm">{t("noPages")}</p>}
          {ready && (
            <div className="space-y-3">
              <label className="block space-y-1 text-sm">
                <span className="text-xs text-muted-foreground">{t("page")}</span>
                <select value={pageUrl} onChange={(event) => setPageUrl(event.target.value)} className="w-full rounded-full border border-border bg-background px-4 py-2 text-sm">
                  {status.pages.map((p) => <option key={p.url} value={p.url}>{p.name}</option>)}
                </select>
              </label>
              <div className="space-y-1 text-sm">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{t("caption")}</span>
                  <button type="button" onClick={() => void generate()} disabled={busy !== ""} className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs text-foreground hover:bg-muted disabled:opacity-50">
                    {busy === "gen" ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />} {t("gen")}
                  </button>
                </div>
                <textarea value={caption} onChange={(event) => setCaption(event.target.value)} rows={8} maxLength={2000} aria-label={t("caption")} className="w-full resize-none rounded-[16px] border border-border bg-background px-4 py-3 text-sm" />
              </div>
              <Button type="button" className="w-full rounded-full" disabled={busy !== "" || !pageUrl} onClick={() => void publish()}>
                {busy === "send" ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} {t("publish")}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
