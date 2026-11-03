"use client";

import { useState } from "react";
import { Check, Copy, Download } from "lucide-react";
import { UploadAndJoin } from "@/components/app/upload-and-join";

export type JoinVideo = { label: string; scenes: { n: string; files: string[] }[] };

/** Depois que o Flow gera: mostra em que ordem juntar as cenas (e qual take escolher em cada uma) e deixa guardar a copy. */
export function JoinGuide({ videos, copy }: { videos: JoinVideo[]; copy: string }) {
  const [done, setDone] = useState<"" | "copy" | "order">("");
  const text = copy.trim();
  const order = videos.map((v) => `${v.label}\n${v.scenes.map((s, i) => `${i + 1}. Cena ${s.n}: ${s.files.join("  ou  ")}`).join("\n")}`).join("\n\n");

  function mark(kind: "copy" | "order") {
    setDone(kind);
    window.setTimeout(() => setDone(""), 2000);
  }
  async function copyOf(kind: "copy" | "order", value: string) {
    try { await navigator.clipboard.writeText(value); mark(kind); } catch { /* o botão Baixar continua disponível */ }
  }
  function download() {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "copy-clipgringa.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section aria-label="Ordem para juntar e copy" className="space-y-4 rounded-[22px] border border-white/10 bg-[#1a191d] p-5" data-testid="join-guide">
      {videos.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-base font-semibold">Ordem para juntar</h3>
            <button type="button" onClick={() => void copyOf("order", order)} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground underline">
              {done === "order" ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} Copiar a ordem
            </button>
          </div>
          <p className="text-xs text-muted-foreground">Monte cada vídeo na sequência abaixo. Se uma cena tem mais de um take, escolha o melhor e use só um deles naquela posição.</p>
          {videos.map((v) => (
            <div key={v.label} className="space-y-1.5">
              <p className="text-sm font-medium">{v.label}</p>
              <ol className="space-y-1">
                {v.scenes.map((s, i) => (
                  <li key={s.n} className="flex flex-wrap items-baseline gap-x-2 rounded-xl bg-black/30 px-3 py-2 text-sm">
                    <span className="font-semibold tabular-nums">{i + 1}º</span>
                    <span>Cena {s.n}</span>
                    <span className="text-xs text-muted-foreground">{s.files.length > 1 ? `escolha um: ${s.files.join(" · ")}` : s.files[0]}</span>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      )}
      {text && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-base font-semibold">Copy do vídeo</h3>
            <div className="flex gap-3 text-xs text-muted-foreground">
              <button type="button" onClick={() => void copyOf("copy", text)} className="inline-flex items-center gap-1.5 underline">{done === "copy" ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} Copiar</button>
              <button type="button" onClick={download} className="inline-flex items-center gap-1.5 underline"><Download className="size-3.5" /> Baixar .txt</button>
            </div>
          </div>
          <p className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-xl bg-black/30 px-3 py-2 text-sm">{text}</p>
        </div>
      )}
      <UploadAndJoin />
    </section>
  );
}
