export type Offer = {
  id: string;
  name: string;
  product: string;
  keyword: string;
  language: string;
  approved_copy: string;
  notes: string;
  reference_url: string;
  /** Mensagem privada que a Página manda para quem comenta a palavra-chave. Vazio = não manda. */
  dm_message?: string;
  updated_at: string | null;
};

export type OfferDraft = Omit<Offer, "id" | "updated_at">;

export const EMPTY_OFFER: OfferDraft = { name: "", product: "", keyword: "", language: "pt-BR", approved_copy: "", notes: "", reference_url: "", dm_message: "" };

async function parse<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => ({}))) as T & { detail?: string };
  if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Não foi possível concluir. Tente de novo.");
  return data;
}

export async function listOffers(): Promise<Offer[]> {
  const data = await parse<{ offers: Offer[] }>(await fetch("/api/multiplier/offers", { cache: "no-store" }));
  return data.offers ?? [];
}

export async function saveOffer(draft: OfferDraft, id?: string): Promise<void> {
  await parse(await fetch(id ? `/api/multiplier/offers/${id}` : "/api/multiplier/offers", {
    method: id ? "PUT" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(draft),
  }));
}

export async function removeOffer(id: string): Promise<void> {
  await parse(await fetch(`/api/multiplier/offers/${id}`, { method: "DELETE" }));
}
