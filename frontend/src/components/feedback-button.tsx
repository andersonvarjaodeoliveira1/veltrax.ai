"use client";

import { MessageSquare, Send } from "lucide-react";
import { useSession } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const TELEGRAM_URL = "https://t.me/gringatools";
const WHATSAPP_URL = "https://wa.me/5511913142143";

/** Floating support button: opens a small menu with the Telegram and WhatsApp contacts. */
export function FeedbackButton() {
  const { data: session } = useSession();
  if (!session?.user) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          size="icon"
          aria-label="Suporte"
          // Com os balões de ajuda na tela (dois botões de 44 px no mesmo canto), o suporte fica à esquerda deles, na mesma linha.
          className="fixed bottom-5 right-5 z-50 h-11 w-11 rounded-full shadow-lg max-md:[body:has([data-app-shell])_&]:bottom-[calc(4.5rem+env(safe-area-inset-bottom))] [body:has([data-help-bubbles])_&]:bottom-4 [body:has([data-help-bubbles])_&]:right-[7.5rem] max-md:[body:has([data-help-bubbles])_&]:bottom-[calc(4.5rem+env(safe-area-inset-bottom))] max-md:[body:has([data-help-bubbles])_&]:right-[7.25rem]"
        >
          <MessageSquare className="h-5 w-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent side="top" align="end" className="w-64" sideOffset={12}>
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Fale com a gente</h3>
          <Button asChild variant="outline" className="w-full justify-start">
            <a href={TELEGRAM_URL} target="_blank" rel="noopener noreferrer">
              <Send className="h-4 w-4" />Telegram
            </a>
          </Button>
          <Button asChild variant="outline" className="w-full justify-start">
            <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer">
              <MessageSquare className="h-4 w-4" />WhatsApp
            </a>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
