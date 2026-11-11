"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { listOffers, type Offer } from "@/lib/offers";

// Atalho no assistente: carrega uma oferta salva (produto, palavra-chave, idioma e copy aprovada).
export function OfferPicker({ onPick }: { onPick: (offer: Offer) => void }) {
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const [picked, setPicked] = useState("");

  useEffect(() => {
    let alive = true;
    listOffers().then((list) => { if (alive) setOffers(list); }).catch(() => { if (alive) setOffers([]); });
    return () => { alive = false; };
  }, []);

  if (offers === null) return null;
  if (offers.length === 0) {
    return <p className="text-xs text-muted-foreground">Vende sempre o mesmo produto? <Link href="/ofertas" className="underline">Salve uma oferta</Link> e o assistente preenche o resto.</p>;
  }
  return (
    <div className="space-y-1.5" data-testid="offer-picker">
      <p className="text-xs font-medium">Usar uma oferta salva</p>
      <div className="flex flex-wrap gap-2">
        {offers.slice(0, 8).map((offer) => (
          <button key={offer.id} type="button" onClick={() => { setPicked(offer.id); onPick(offer); }} aria-pressed={picked === offer.id}
            className={`rounded-full border px-3 py-1.5 text-xs ${picked === offer.id ? "border-violet-400 bg-violet-500/20 text-white" : "border-border hover:text-foreground"}`}>{offer.name}</button>
        ))}
        <Link href="/ofertas" className="rounded-full px-3 py-1.5 text-xs text-muted-foreground underline">Gerenciar</Link>
      </div>
    </div>
  );
}
