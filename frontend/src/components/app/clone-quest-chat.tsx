"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp } from "lucide-react";

type Opt = { value: string; label: string };
export type QuestValues = { cta: string; product: string; count: number; sceneCount: number; language: string; copySource: "video" | "own"; ownCopy: string; keyword: string; flowModel: string };
type Props = {
  values: QuestValues;
  languages: { value: string; text: string }[];
  models: { id: string; name: string; credits: number }[];
  onCount: (n: number) => void;
  onScenes: (n: number) => void;
  onLanguage: (value: string) => void;
  onCopy: (source: "video" | "own", text: string) => void;
  onKeyword: (value: string) => void;
  onModel: (id: string) => void;
  onCta: (value: string) => void;
  onProduct: (value: string) => void;
  onExtra: (value: string) => void;
  onFinish?: () => void;
  hasVideo?: boolean;
};

type Step = { id: string; question: string; hint: string; options: Opt[]; answer: string; apply: (text: string, picked?: string) => boolean };

/** Conversa guiada: cada pergunta tem opções para tocar e também aceita digitar + Enter. As escolhas ficam sempre visíveis. */
export function QuestChat({ values, languages, models, onCount, onScenes, onLanguage, onCopy, onKeyword, onModel, onCta, onProduct, onExtra, onFinish, hasVideo }: Props) {
  const [at, setAt] = useState(0);
  const [text, setText] = useState("");
  const [answered, setAnswered] = useState<string[]>([]);
  const [oops, setOops] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const num = (t: string, min: number, max: number) => { const n = parseInt((t.match(/\d+/) ?? [""])[0], 10); return Number.isFinite(n) && n >= min && n <= max ? n : null; };

  const steps: Step[] = [
    { id: "count", question: "Quantos vídeos você quer?", hint: "Digite um número (1 a 10) ou toque numa opção.",
      options: [1, 2, 3, 5].map((n) => ({ value: String(n), label: n === 1 ? "1 vídeo" : `${n} vídeos` })),
      answer: values.count === 1 ? "1 vídeo" : `${values.count} vídeos`,
      apply: (t, picked) => { const n = num(picked ?? t, 1, 10); if (n === null) return false; onCount(n); return true; } },
    { id: "scenes", question: "Quantas cenas em cada vídeo?", hint: "Cada cena tem cerca de 8 segundos. Digite de 1 a 6.",
      options: [1, 2, 3, 4, 5, 6].map((n) => ({ value: String(n), label: n === 1 ? "1 cena" : `${n} cenas` })),
      answer: values.sceneCount === 1 ? "1 cena" : `${values.sceneCount} cenas`,
      apply: (t, picked) => { const n = num(picked ?? t, 1, 6); if (n === null) return false; onScenes(n); return true; } },
    { id: "language", question: "Em que idioma a pessoa fala?", hint: "Toque numa opção ou digite o idioma.",
      options: languages.map((l) => ({ value: l.value, label: l.text })),
      answer: languages.find((l) => l.value === values.language)?.text ?? values.language,
      apply: (t, picked) => {
        const key = (picked ?? t).trim().toLowerCase();
        const found = languages.find((l) => l.value === picked || l.value.toLowerCase() === key || l.text.toLowerCase().startsWith(key) || (key.length > 2 && l.text.toLowerCase().includes(key)));
        if (!found) return false; onLanguage(found.value); return true;
      } },
    { id: "copy", question: "Qual copy usar nos takes?", hint: "Toque numa opção ou escreva a sua copy aqui e aperte Enter.",
      options: [{ value: "video", label: "Usar a copy do vídeo" }],
      answer: values.copySource === "own" && values.ownCopy.trim().length >= 20 ? `Minha copy: ${values.ownCopy.trim().slice(0, 40)}${values.ownCopy.trim().length > 40 ? "…" : ""}` : "Copy do vídeo",
      apply: (t, picked) => {
        if (picked === "video" || /^(v[ií]deo|usar|pular|igual|a do v[ií]deo)/i.test(t.trim())) { onCopy("video", ""); return true; }
        if (t.trim().length >= 20) { onCopy("own", t.trim()); return true; }
        return false;
      } },
    { id: "cta", question: "Qual ação você quer que a pessoa faça no final do vídeo? (CTA)", hint: "Toque numa opção ou escreva a sua chamada e aperte Enter.",
      options: [
        { value: "full", label: "Assistir o vídeo completo" },
        { value: "link", label: "Receber o link no direct" },
        { value: "material", label: "Baixar um material grátis" },
        { value: "whats", label: "Falar comigo no WhatsApp" },
      ],
      answer: values.cta.trim() ? values.cta.trim().replace("{KEYWORD}", "…").slice(0, 44) : "Assistir o vídeo completo",
      apply: (t, picked) => {
        const map: Record<string, string> = { full: "", link: "Comente {KEYWORD} que eu te envio o link no direct", material: "Comente {KEYWORD} e receba o material grátis", whats: "Comente {KEYWORD} e eu te chamo no WhatsApp" };
        if (picked) { onCta(map[picked] ?? ""); return true; }
        const typed = t.trim().slice(0, 190);
        if (typed.length < 8) return false;
        onCta(typed.includes("{KEYWORD}") ? typed : `${typed.replace(/[.!\s]+$/, "")}. Comente {KEYWORD} para receber`);
        return true;
      } },
    { id: "keyword", question: "Qual palavra a pessoa vai comentar?", hint: "É a palavra que dispara a sua automação de comentários (ex.: QUERO). Escreva e aperte Enter.",
      options: [{ value: "QUERO", label: "QUERO" }, { value: "LINK", label: "LINK" }, { value: "EU QUERO", label: "EU QUERO" }, { value: "INFO", label: "INFO" }],
      answer: values.keyword.trim() ? values.keyword.trim().toUpperCase() : "QUERO",
      apply: (t, picked) => { const k = (picked ?? t).trim().slice(0, 30); if (!k) return false; onKeyword(k); return true; } },
    { id: "product", question: "Vai falar de algum produto?", hint: "Escreva o nome do produto e aperte Enter, ou pule.",
      options: [{ value: "skip", label: "Não, só o vídeo" }],
      answer: values.product.trim() ? values.product.trim().slice(0, 40) : "Sem produto",
      apply: (t, picked) => { if (picked === "skip" || !t.trim()) { onProduct(""); return true; } onProduct(t.trim().slice(0, 120)); return true; } },
    { id: "camera", question: "Qual estilo de câmera?", hint: "Toque numa opção ou descreva (ex.: celular na mão, de perto).",
      options: [{ value: "selfie", label: "Selfie, celular na mão" }, { value: "tripod", label: "Tripé fixo" }, { value: "close", label: "De perto, rosto" }, { value: "skip", label: "Deixar automático" }],
      answer: "Câmera definida",
      apply: (t, picked) => {
        const map: Record<string, string> = { selfie: "selfie vertical com o celular na mão", tripod: "câmera fixa em tripé, plano médio", close: "close no rosto, bem de perto" };
        if (picked === "skip") return true;
        const desc = picked ? map[picked] : t.trim();
        if (!desc) return false;
        onExtra(`Câmera: ${desc}`); return true;
      } },
    { id: "extra", question: "Quer mudar mais alguma coisa?", hint: "Ex.: cenário numa cozinha, pessoa mais jovem. Escreva e aperte Enter, ou siga.",
      options: [{ value: "skip", label: "Não, pode seguir" }],
      answer: "Ajustes anotados",
      apply: (t, picked) => { if (picked === "skip" || !t.trim()) return true; onExtra(t.trim().slice(0, 300)); return true; } },
    ...(models.length > 1 ? [{ id: "model", question: "Qual modelo do Flow gera as cenas?", hint: "Toque numa opção. O custo aparece em cada uma.",
      options: models.map((m) => ({ value: m.id, label: `${m.name} · ${m.credits === 0 ? "0 créditos" : `${m.credits} créd./cena`}` })),
      answer: models.find((m) => m.id === values.flowModel)?.name ?? "Lower Priority",
      apply: (t: string, picked?: string) => {
        const key = (picked ?? t).trim().toLowerCase();
        const found = models.find((m) => m.id === picked || m.name.toLowerCase().includes(key));
        if (!found || !key) return false; onModel(found.id); return true;
      } } satisfies Step] : []),
  ];

  const finished = at >= steps.length;
  useEffect(() => { if (finished) onFinish?.(); }, [finished]); // eslint-disable-line react-hooks/exhaustive-deps
  const current = steps[at];
  useEffect(() => { endRef.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" }); }, [at, finished]);

  const idx = (id: string) => steps.findIndex((x) => x.id === id);
  const advance = (done: string[], from: number) => {
    const all = Array.from(new Set([...answered, ...done]));
    setAnswered(all);
    let n = from + 1;
    while (n < steps.length && all.includes(steps[n].id)) n += 1;
    setAt(n);
  };
  // Frase solta: "3 vídeos de 4 cenas em inglês" já responde várias perguntas de uma vez.
  const smart = (t: string): string[] => {
    const done: string[] = [];
    const v = t.match(/(\d+)\s*v[ií]deos?/i); if (v) { const n = num(v[1], 1, 10); if (n) { onCount(n); done.push("count"); } }
    const c = t.match(/(\d+)\s*cenas?/i); if (c) { const n = num(c[1], 1, 6); if (n) { onScenes(n); done.push("scenes"); } }
    const l = languages.find((x) => new RegExp(`\\b${x.text.toLowerCase()}\\b`).test(t.toLowerCase())); if (l) { onLanguage(l.value); done.push("language"); }
    return done;
  };
  const submit = (picked?: string) => {
    if (!current) return;
    setOops(false);
    if (picked === undefined && /v[ií]deos?|cenas?|ingl[eê]s|espanhol|franc[eê]s|portugu[eê]s/i.test(text) && text.trim().split(/\s+/).length <= 14 && current.id !== "copy") {
      const done = smart(text);
      if (done.length) { setText(""); advance(done, at); return; }
    }
    const ok = current.apply(text, picked);
    if (!ok) { setOops(true); return; }
    setText("");
    advance([current.id], at);
  };

  return (
    <div className="space-y-3" data-testid="quest-chat">
      <ol className="space-y-2" aria-label="Suas escolhas">
        {steps.map((step, i) => ({ step, i })).filter(({ step, i }) => (answered.includes(step.id) && i !== at) || (i < at && !answered.includes(step.id))).map(({ step, i }) => (
          <li key={step.id} className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">{step.question}</span>
            <button type="button" onClick={() => { setText(""); setOops(false); setAt(i); }} title="Mudar esta escolha"
              className="rounded-full border border-[#7B3FE4]/50 bg-[#7B3FE4]/20 px-3 py-1 text-xs font-medium text-white hover:bg-[#7B3FE4]/35">{step.answer} ✎</button>
          </li>
        ))}
      </ol>
      {current && (
        <div className="cg-orbit relative" style={{ "--cg-r": "26px" } as React.CSSProperties}>
          <div className="relative space-y-3 rounded-[26px] bg-[#1a191d] p-5 ring-1 ring-white/10 shadow-[0_20px_60px_-30px_#000]">
            <p className="text-xs text-muted-foreground">Pergunta {at + 1} de {steps.length}</p>
            <p className="text-base font-semibold">{current.question}</p>
            <div className="flex flex-wrap gap-2" role="group" aria-label={`Opções · ${current.question}`}>
              {current.options.map((o) => (
                <button key={o.value} type="button" onClick={() => submit(o.value)}
                  className="rounded-full border border-white/15 px-4 py-2 text-sm transition hover:border-[#7B3FE4] hover:bg-[#7B3FE4]/20">{o.label}</button>
              ))}
            </div>
            <div className="flex items-end gap-2">
              <textarea value={text} onChange={(e) => setText(e.target.value)} rows={current.id === "copy" ? 3 : 1} maxLength={current.id === "copy" ? 4000 : 80} aria-label={current.question}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); } }}
                placeholder={current.hint}
                className="min-h-[44px] w-full resize-none rounded-[14px] bg-black/30 px-3 py-2 text-base outline-none placeholder:text-muted-foreground/70" />
              <button type="button" aria-label="Avançar" title="Avançar (Enter)" onClick={() => submit()} disabled={!text.trim()}
                className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#A98BFF] to-[#7B3FE4] text-white disabled:opacity-40"><ArrowUp className="size-5" /></button>
            </div>
            {oops && <p role="alert" className="text-xs text-[#F5B454]">Não entendi. Toque numa opção ou escreva de outro jeito.</p>}
            <button type="button" onClick={() => { setText(""); setAt(steps.length); }} className="text-xs text-muted-foreground underline">Usar o padrão no resto e escolher o vídeo</button>
          </div>
        </div>
      )}
      {finished && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-[#C9BBFA]">{hasVideo ? "Perfeito. Preparando tudo e abrindo o Flow sozinho…" : "Perfeito. Falta só escolher o vídeo, no botão roxo acima."}</p>
        </div>
      )}
      <div ref={endRef} />
    </div>
  );
}
