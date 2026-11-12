"use client";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export const field = "block w-full rounded-[12px] border border-white/15 bg-black/30 px-3 py-2.5 text-sm text-white placeholder:text-white/40 focus:border-violet-400 focus:outline-none";
export const primary = "rounded-full bg-gradient-to-br from-[#8B5CF6] to-[#7B3FE4] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60";
export const secondary = "rounded-full border border-white/20 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-white/5 disabled:opacity-50";
export const card = "rounded-[18px] border border-white/10 bg-[#1a191d] p-4";

const TONES = { ok: "border-emerald-400/30 text-emerald-300", warn: "border-amber-400/40 text-amber-300", bad: "border-[#F0466B]/40 text-[#F0466B]", off: "border-white/15 text-white/60" } as const;

export function Pill({ tone, children }: { tone: keyof typeof TONES; children: React.ReactNode }) {
  return <span className={cn("shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-medium", TONES[tone])}>{children}</span>;
}

export function Modal({ open, onClose, title, description, children }: { open: boolean; onClose: () => void; title: string; description?: string; children: React.ReactNode }) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto border-white/10 bg-[#141316] text-white sm:max-w-lg">
        <DialogTitle className="text-base font-bold">{title}</DialogTitle>
        {description ? <DialogDescription className="text-sm text-white/60">{description}</DialogDescription> : null}
        <div className="space-y-3">{children}</div>
      </DialogContent>
    </Dialog>
  );
}

export const ACTOR: Record<string, string> = { app: "Aplicativo", voce: "Você", claude: "Claude" };
