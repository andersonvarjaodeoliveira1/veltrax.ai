"use client";

import { cn } from "@/lib/utils";

export type VariationMode = "roulette" | "gesture" | "text" | "combined";
export type EntryMode = "auto" | "manual";
export type ManualValues = { copyMode: "same" | "mix"; variationMode: VariationMode; keepPerson: boolean; presenter: "" | "woman" | "man"; count: number; scenes: number; language: string };

export const VARIATION_LABEL: Record<VariationMode, { name: string; hint: string; prompt: string }> = {
  roulette: { name: "Roleta", hint: "Cada vídeo muda de cenário e de objeto.", prompt: "Em cada vídeo, mude o cenário e o objeto em cena; a fala e a estrutura ficam iguais." },
  gesture: { name: "Gesto", hint: "Micro-variações de gesto e expressão.", prompt: "Em cada vídeo, varie só os gestos e as expressões da pessoa; cenário e fala ficam iguais." },
  text: { name: "Texto", hint: "Muda só a escrita (gancho e fala).", prompt: "Em cada vídeo, varie só o gancho e as palavras da fala; imagem e estrutura ficam iguais." },
  combined: { name: "Combinada", hint: "Mistura as três para ter mais versões.", prompt: "Em cada vídeo, combine variações de cenário, gesto e texto, mantendo a mesma mensagem." },
};

/** Texto que a IA recebe junto das mudanças pedidas, para respeitar o tipo de variação escolhido no modo manual. */
export const variationHint = (mode?: VariationMode) => (mode ? VARIATION_LABEL[mode].prompt : "");

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" aria-pressed={active} onClick={onClick} className={cn("rounded-full border px-3 py-1.5 text-xs", active ? "border-[#7B3FE4] bg-[#7B3FE4]/25 text-white" : "border-border text-muted-foreground hover:text-foreground")}>{children}</button>;
}

/** Escolha entre o modo automático (a IA decide tudo) e o manual (a pessoa define as características do criativo). */
export function ManualOptions({ mode, onMode, values, onChange, languages }: {
  mode: EntryMode; onMode: (mode: EntryMode) => void; values: ManualValues; onChange: (patch: Partial<ManualValues>) => void; languages: { value: string; text: string }[];
}) {
  return (
    <section data-testid="entry-mode" className="space-y-3 rounded-[18px] border border-border bg-card p-4">
      <div role="group" aria-label="Como modelar" className="grid grid-cols-2 gap-2">
        {([["auto", "Automático", "A IA decide tudo. Você só responde as perguntas."], ["manual", "Manual", "Você escolhe as características do criativo."]] as const).map(([id, name, hint]) => (
          <button key={id} type="button" aria-pressed={mode === id} onClick={() => onMode(id)}
            className={cn("rounded-[14px] border p-3 text-left text-sm", mode === id ? "border-[#7B3FE4] bg-[#7B3FE4]/20" : "border-border text-muted-foreground")}>
            <span className="block font-medium text-foreground">{name}</span><span className="block text-xs">{hint}</span>
          </button>
        ))}
      </div>
      {mode === "manual" && (
        <div data-testid="manual-panel" className="space-y-3 text-sm">
          <div className="space-y-1.5"><p className="text-xs font-medium">Copy</p>
            <div className="flex flex-wrap gap-2">
              <Chip active={values.copyMode === "same"} onClick={() => onChange({ copyMode: "same" })}>Igual ao viral</Chip>
              <Chip active={values.copyMode === "mix"} onClick={() => onChange({ copyMode: "mix" })}>Adaptada ao meu produto</Chip>
            </div></div>
          <div className="space-y-1.5"><p className="text-xs font-medium">Tipo de variação</p>
            <div className="flex flex-wrap gap-2">{(Object.keys(VARIATION_LABEL) as VariationMode[]).map((key) => <Chip key={key} active={values.variationMode === key} onClick={() => onChange({ variationMode: key })}>{VARIATION_LABEL[key].name}</Chip>)}</div>
            <p className="text-xs text-muted-foreground">{VARIATION_LABEL[values.variationMode].hint}</p></div>
          <div className="space-y-1.5"><p className="text-xs font-medium">Quem aparece</p>
            <div className="flex flex-wrap gap-2">
              <Chip active={values.keepPerson} onClick={() => onChange({ keepPerson: true })}>Manter a pessoa do vídeo</Chip>
              <Chip active={!values.keepPerson} onClick={() => onChange({ keepPerson: false })}>Trocar a pessoa</Chip>
              {!values.keepPerson && <>
                <Chip active={values.presenter === "woman"} onClick={() => onChange({ presenter: "woman" })}>Mulher</Chip>
                <Chip active={values.presenter === "man"} onClick={() => onChange({ presenter: "man" })}>Homem</Chip>
              </>}
            </div></div>
          <div className="space-y-1.5"><p className="text-xs font-medium">Quantos vídeos</p>
            <div className="flex flex-wrap gap-2">{[1, 2, 3, 5, 10].map((n) => <Chip key={n} active={values.count === n} onClick={() => onChange({ count: n })}>{n}</Chip>)}</div></div>
          <div className="space-y-1.5"><p className="text-xs font-medium">Quantas cenas por vídeo</p>
            <div className="flex flex-wrap gap-2">{[1, 2, 3, 4, 5, 6].map((n) => <Chip key={n} active={values.scenes === n} onClick={() => onChange({ scenes: n })}>{`${n} ${n === 1 ? "cena" : "cenas"}`}</Chip>)}</div></div>
          <label className="block space-y-1.5"><span className="text-xs font-medium">Idioma</span>
            <select value={values.language} onChange={(event) => onChange({ language: event.target.value })} className="block w-full rounded-[12px] border border-border bg-background px-3 py-2 text-sm">
              {languages.map((l) => <option key={l.value} value={l.value}>{l.text}</option>)}
            </select></label>
        </div>
      )}
    </section>
  );
}
