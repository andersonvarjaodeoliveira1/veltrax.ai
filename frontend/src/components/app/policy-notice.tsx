"use client";

import { ShieldAlert } from "lucide-react";
import type { PolicyHit } from "@/lib/shopee-policy";

/** Aviso antes de gerar: o conteúdo pode conter algo que a Shopee Vídeo proíbe ou restringe. */
export function PolicyNotice({ hits, confirmed, onConfirm }: { hits: PolicyHit[]; confirmed: boolean; onConfirm: (value: boolean) => void }) {
  if (!hits.length) return null;
  return (
    <div role="alert" data-testid="policy-notice" className="space-y-2 rounded-[14px] border border-[#F5B454]/50 bg-[#F5B454]/10 p-3 text-xs">
      <p className="flex items-center gap-2 text-sm font-semibold text-[#F5B454]"><ShieldAlert className="size-4" /> Atenção: este vídeo pode violar a política da Shopee</p>
      <p className="text-foreground/90">Se o vídeo tiver isso, a Shopee pode <strong>excluir o vídeo, restringir ou suspender a sua conta de Shopee Vídeo</strong>. Quem responde pelo anúncio é você.</p>
      <ul className="list-disc space-y-1 pl-5">
        {hits.map((hit) => <li key={hit.label}><strong>{hit.label}</strong> ({hit.level}): {hit.tip}</li>)}
      </ul>
      <label className="flex items-start gap-2">
        <input type="checkbox" checked={confirmed} onChange={(event) => onConfirm(event.target.checked)} className="mt-0.5" />
        <span>Li o aviso, conferi o produto e a copy e quero seguir mesmo assim.</span>
      </label>
    </div>
  );
}
