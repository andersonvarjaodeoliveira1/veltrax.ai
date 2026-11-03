"use client";

import { useRef, useState } from "react";
import { ArrowDown, ArrowUp, Loader2, Upload, X } from "lucide-react";
import { FinalVideoMaker } from "@/components/app/final-video-maker";

type Picked = { key: string; file: File };

const MAX_BYTES = 150 * 1024 * 1024;
const byName = (a: Picked, b: Picked) => a.file.name.localeCompare(b.file.name, "pt-BR", { numeric: true });

/** A pessoa envia as cenas que já baixou, põe na ordem e o ClipGringa junta num vídeo só (com legenda, título e transição). */
export function UploadAndJoin({ label = "Vídeo completo" }: { label?: string }) {
  const [files, setFiles] = useState<Picked[]>([]);
  const [ids, setIds] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  const [error, setError] = useState("");
  const counter = useRef(0);

  function add(list: FileList | null) {
    if (!list) return;
    const picked = [...list].filter((f) => f.type.startsWith("video/") || /\.(mp4|mov|webm|m4v)$/i.test(f.name));
    if (picked.length < list.length) setError("Só vídeos (mp4, mov ou webm) entram aqui.");
    else setError("");
    const big = picked.find((f) => f.size > MAX_BYTES);
    if (big) { setError(`“${big.name}” passa de 150 MB. Use um arquivo menor.`); return; }
    setIds(null);
    setFiles((current) => [...current, ...picked.map((file) => ({ key: `${counter.current++}`, file }))].sort(byName));
  }
  function move(index: number, by: -1 | 1) {
    setIds(null);
    setFiles((current) => {
      const next = [...current];
      const target = index + by;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function send() {
    setBusy(true); setError(""); setDone(0);
    const out: string[] = [];
    try {
      for (const item of files) {
        let ok = false;
        for (let attempt = 0; attempt < 2 && !ok; attempt++) {
          const response = await fetch(`/api/multiplier/flow-videos/mine?package=${encodeURIComponent(label)}&file=${encodeURIComponent(item.file.name)}`, {
            method: "POST", headers: { "Content-Type": item.file.type || "video/mp4" }, body: item.file,
          }).catch(() => null);
          if (response?.ok) {
            const data = (await response.json().catch(() => ({}))) as { id?: string };
            if (data.id) { out.push(data.id); ok = true; }
          } else if (response && response.status === 413) {
            setError("Seu espaço de vídeos está cheio. Apague vídeos antigos na biblioteca e tente de novo.");
            setBusy(false);
            return;
          }
        }
        if (!ok) { setError(`Não consegui enviar “${item.file.name}”. Confira a conexão e tente de novo.`); setBusy(false); return; }
        setDone(out.length);
      }
      setIds(out);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3" data-testid="upload-join">
      <div>
        <h3 className="text-base font-semibold">Juntar vídeos que você já baixou</h3>
        <p className="text-xs text-muted-foreground">Envie as cenas (uma ou mais por vez), deixe na ordem e eu junto num vídeo completo, com legenda e título.</p>
      </div>
      <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-sm hover:border-[#7B3FE4]">
        <Upload className="size-4" /> Escolher vídeos
        <input type="file" accept="video/*,.mp4,.mov,.webm,.m4v" multiple className="sr-only" aria-label="Escolher vídeos" onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
      </label>
      {files.length > 0 && (
        <ol className="space-y-1">
          {files.map((item, i) => (
            <li key={item.key} className="flex items-center gap-2 rounded-xl bg-black/30 px-3 py-2 text-sm">
              <span className="w-6 font-semibold tabular-nums">{i + 1}º</span>
              <span className="min-w-0 flex-1 truncate">{item.file.name}</span>
              <button type="button" aria-label={`Subir ${item.file.name}`} disabled={i === 0 || busy} onClick={() => move(i, -1)} className="disabled:opacity-30"><ArrowUp className="size-4" /></button>
              <button type="button" aria-label={`Descer ${item.file.name}`} disabled={i === files.length - 1 || busy} onClick={() => move(i, 1)} className="disabled:opacity-30"><ArrowDown className="size-4" /></button>
              <button type="button" aria-label={`Tirar ${item.file.name}`} disabled={busy} onClick={() => { setIds(null); setFiles((c) => c.filter((f) => f.key !== item.key)); }}><X className="size-4" /></button>
            </li>
          ))}
        </ol>
      )}
      {error && <p role="alert" className="text-xs text-[#F5B454]">{error}</p>}
      {files.length > 0 && !ids && (
        <button type="button" onClick={() => void send()} disabled={busy}
          className="inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-[#8B5CF6] to-[#7B3FE4] px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
          {busy ? <><Loader2 className="size-4 animate-spin" /> Enviando {done + 1} de {files.length}…</> : `Enviar ${files.length} ${files.length === 1 ? "vídeo" : "vídeos"} e continuar`}
        </button>
      )}
      {ids && <FinalVideoMaker items={[{ label, videoIds: ids }]} defaultTitle="" />}
    </div>
  );
}
