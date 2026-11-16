// Leva a biblioteca do ClipSpy para fora do sistema: planilha (CSV) e resumo em texto.
// Tudo é montado no navegador com o que a biblioteca já mostra; nada é pedido de novo ao servidor.
import type { Creative } from "@/lib/clipspy";

const BEAT_LABEL: Record<string, string> = {
  hook: "gancho", callout: "chamada do público", problema: "problema", mecanismo: "mecanismo", vilao: "vilão", solucao: "solução", cta: "chamada final",
};

/** A estrutura do vencedor em uma linha: "gancho 10% > problema 40% > chamada final 20%". Vazio se ainda não foi modelado. */
export function structureLine(c: Creative): string {
  const beats = c.metrics?.recipe?.beats ?? [];
  return beats
    .map((b) => `${BEAT_LABEL[b.beat_role] ?? b.beat_role}${b.weight > 0 ? ` ${Math.round(b.weight * 100)}%` : ""}`)
    .join(" > ");
}

const sourceLabel = (c: Creative) => (c.source === "manual" ? "Referência manual" : "Ad Library");
const count = (value?: number) => (value ? String(value) : "");

// Planilha abre texto que começa com = + - @ como fórmula; o apóstrofo na frente mantém como texto.
function cell(value: string): string {
  const flat = value.replace(/\r?\n/g, " ").trim();
  const safe = /^[=+\-@]/.test(flat) ? `'${flat}` : flat;
  return /[";]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export const CSV_HEADER = ["Página ou anunciante", "Origem", "Campeão", "Texto", "Visualizações", "Reações", "Comentários", "Compartilhamentos",
  "Dias no ar", "Hook", "Sentimento", "CTA", "Estrutura", "Resumo da estrutura", "Anotação", "Termo", "Link"];

/** CSV com ponto e vírgula e marca de UTF-8, que é como o Excel em português abre certo. */
export function referencesCsv(items: Creative[]): string {
  const rows = items.map((c) => [
    c.advertiser, sourceLabel(c), c.is_champion ? "sim" : "não", c.title,
    count(c.metrics?.views), count(c.metrics?.reactions ?? c.metrics?.likes), count(c.metrics?.comments), count(c.metrics?.shares), count(c.metrics?.run_days),
    c.metrics?.hook ?? "", c.metrics?.feeling ?? "", c.metrics?.cta ?? "", structureLine(c), c.metrics?.recipe?.summary ?? "", c.metrics?.note ?? "", c.term ?? "", c.permalink,
  ]);
  return "﻿" + [CSV_HEADER, ...rows].map((row) => row.map((v) => cell(String(v ?? ""))).join(";")).join("\r\n") + "\r\n";
}

/** Resumo em texto, uma referência por bloco, para colar em qualquer lugar. */
export function referencesSummary(items: Creative[], today: Date = new Date()): string {
  const n = (value: number) => value.toLocaleString("pt-BR");
  const date = today.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const blocks = items.map((c, index) => {
    const m = c.metrics ?? {};
    const numbers = [
      m.views ? `${n(m.views)} visualizações` : "", (m.reactions ?? m.likes) ? `${n((m.reactions ?? m.likes) as number)} reações` : "",
      m.comments ? `${n(m.comments)} comentários` : "", m.shares ? `${n(m.shares)} compartilhamentos` : "", m.run_days ? `${n(m.run_days)} dias no ar` : "",
    ].filter(Boolean).join(", ");
    const structure = structureLine(c);
    return [
      `${index + 1}. ${c.advertiser || "Sem nome"} (${sourceLabel(c)}${c.is_champion ? ", campeão" : ""})`,
      c.title ? `   Texto: ${c.title.replace(/\s+/g, " ").trim()}` : "",
      numbers ? `   Números: ${numbers}` : "",
      m.hook ? `   Hook: ${m.hook}` : "", m.feeling ? `   Sentimento: ${m.feeling}` : "", m.cta ? `   CTA: ${m.cta}` : "",
      `   Estrutura: ${structure || "ainda não modelada"}`,
      m.recipe?.summary ? `   Como funciona: ${m.recipe.summary}` : "",
      m.note ? `   Anotação: ${m.note}` : "",
      c.permalink ? `   Link: ${c.permalink}` : "",
    ].filter(Boolean).join("\n");
  });
  return [`Referências do ClipSpy, ${date} (${items.length === 1 ? "1 referência" : `${items.length} referências`})`, ...blocks].join("\n\n");
}

export function exportFileName(today: Date = new Date()): string {
  const [day, month, year] = today.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }).split("/");
  return `clipspy-referencias-${year}-${month}-${day}.csv`;
}

/** Entrega o arquivo ao navegador. */
export function downloadCsv(text: string, name: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
