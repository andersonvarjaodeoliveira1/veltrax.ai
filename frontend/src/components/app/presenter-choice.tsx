"use client";

import { useEffect, useState } from "react";
import { Loader2, User } from "lucide-react";
import { dataUrlToFile, videoFrames } from "@/lib/influencer-models";

export type Presenter = "" | "woman" | "man";
export type GenderRead = { gender: Presenter; reading: boolean };

const NAME: Record<"woman" | "man", string> = { woman: "uma mulher", man: "um homem" };
const WORD: Record<"woman" | "man", string> = { woman: "mulher", man: "homem" };

/** Olha alguns quadros do vídeo de referência e descobre se quem apresenta é uma mulher ou um homem. */
export function useReferenceGender(file: File | null): GenderRead {
  const [read, setRead] = useState<GenderRead>({ gender: "", reading: false });
  useEffect(() => {
    setRead({ gender: "", reading: false });
    if (!file || !file.type.startsWith("video/")) return;
    let cancelled = false;
    setRead({ gender: "", reading: true });
    void (async () => {
      let gender: Presenter = "";
      try {
        const frames = await videoFrames(file, 3, 512);
        if (frames.length && !cancelled) {
          const form = new FormData();
          await Promise.all(frames.map(async (src, n) => form.append("images", await dataUrlToFile(src), `quadro-${n + 1}.jpg`)));
          const response = await fetch("/api/multiplier/clone/person-look", { method: "POST", body: form });
          const data = await response.json().catch(() => null);
          if (response.ok && (data?.gender === "woman" || data?.gender === "man")) gender = data.gender;
        }
      } catch { /* sem leitura: a pessoa escolhe à mão */ }
      if (!cancelled) setRead({ gender, reading: false });
    })();
    return () => { cancelled = true; };
  }, [file]);
  return read;
}

/** Pergunta se mantém quem aparece no vídeo (mulher ou homem) ou troca para o outro. */
export function PresenterChoice({ detected, reading, value, onChange }: { detected: Presenter; reading: boolean; value: Presenter; onChange: (value: Presenter) => void }) {
  if (reading) {
    return <p role="status" data-testid="presenter-reading" className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="size-3.5 animate-spin" />Vendo quem aparece no vídeo…</p>;
  }
  const other: "woman" | "man" | null = detected ? (detected === "woman" ? "man" : "woman") : null;
  const options: { value: Presenter; label: string }[] = detected && other
    ? [{ value: detected, label: `Manter ${WORD[detected]}` }, { value: other, label: `Trocar para ${WORD[other]}` }]
    : [{ value: "", label: "Tanto faz" }, { value: "woman", label: "Mulher" }, { value: "man", label: "Homem" }];
  const current = value || detected;
  return (
    <div data-testid="presenter-choice" className="space-y-2 rounded-[14px] border border-border p-3">
      <p className="flex items-center gap-2 text-sm font-medium"><User className="size-4 text-[#A98BFF]" />
        {detected ? `No vídeo original aparece ${NAME[detected]}.` : "Não consegui ver quem aparece no vídeo."} Quem vai apresentar o seu?
      </p>
      <div role="radiogroup" aria-label="Quem apresenta" className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button key={option.label} type="button" role="radio" aria-checked={current === option.value} onClick={() => onChange(option.value)}
            className={`rounded-full border px-4 py-1.5 text-sm ${current === option.value ? "border-transparent bg-primary text-primary-foreground" : "border-border text-muted-foreground"}`}>
            {option.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Vale para os avatares criados por mim. Se você usar “Meus avatares”, vale o que você escrever neles.</p>
    </div>
  );
}
