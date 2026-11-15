"use client";

// Manda cenas (o roteiro ou as variações) direto para a extensão do Flow, que gera a imagem
// e o vídeo de cada cena. O modelo escolhido vale para o próximo envio e fica salvo.
import { Loader2, Send } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { FLOW_CHOICES, saveFlowCategory } from "@/lib/flow-models";
import { pushFlowPackage } from "@/lib/flow-push";
import { buildScenePackage, packageCost, type FlowVideo } from "@/lib/scene-flow";

export function FlowModelSelect({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  return (
    <label className="flex items-center gap-2 text-xs text-white/60">
      Modelo do Flow
      <select value={value} onChange={(e) => { onChange(e.target.value); saveFlowCategory(e.target.value); }}
        className="rounded-full border border-white/15 bg-black/30 px-3 py-1.5 text-xs text-white outline-none [&>option]:text-black">
        {FLOW_CHOICES.map((m) => <option key={m.id} value={m.id}>{m.name}, {m.credits ? `${m.credits} créditos por cena` : "sem custo"}</option>)}
      </select>
    </label>
  );
}

/** Resumo do envio: quantos vídeos, quantas cenas e quanto gasta na conta do Flow. */
export function costText(videos: FlowVideo[], modelId: string): string {
  const cost = packageCost(videos, modelId);
  const parts = [cost.videos > 1 ? `${cost.videos} vídeos` : "", `${cost.scenes} ${cost.scenes === 1 ? "cena" : "cenas"}`, cost.credits ? `${cost.credits} créditos do Flow` : "sem custo"];
  return parts.filter(Boolean).join(", ");
}

export function FlowSendButton({ videos, label, modelId, children, className }: { videos: FlowVideo[]; label: string; modelId: string; children: React.ReactNode; className?: string }) {
  const [sending, setSending] = useState(false);
  const cost = packageCost(videos, modelId);
  async function send(e: React.MouseEvent) {
    e.preventDefault();
    setSending(true);
    const ok = await pushFlowPackage(buildScenePackage(videos, modelId), label.slice(0, 60) || "Roteiro de cenas");
    setSending(false);
    if (ok) toast.success(`Enviado para o Flow: ${costText(videos, modelId)}. A extensão abre o Flow e gera as cenas.`);
    else toast.error("A extensão do Flow não respondeu. Confira a conexão e tente de novo.", { action: { label: "Conectar ao Flow", onClick: () => { window.location.href = "/conectar-flow"; } } });
  }
  return (
    <button type="button" onClick={(e) => void send(e)} disabled={sending || cost.scenes === 0}
      className={className ?? "inline-flex items-center gap-1 rounded-full border border-white/15 px-2 py-1 text-[11px] text-white/70 disabled:opacity-60"}>
      {sending ? <Loader2 className="size-3 animate-spin" /> : <Send className="size-3" />} {children}
    </button>
  );
}
