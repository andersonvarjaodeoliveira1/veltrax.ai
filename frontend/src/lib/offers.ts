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

/** Resultado da conferência entre o anúncio (produto e copy) e a página do link da mensagem. */
export type Coherence = {
  level: "alinhado" | "parcial" | "diferente" | "sem_titulo" | "sem_link" | "nao_abriu";
  url?: string;
  title?: string;
  shared?: string[];
  only_page?: string[];
  reason?: string;
};

export async function checkCoherence(draft: Pick<OfferDraft, "product" | "approved_copy" | "dm_message">): Promise<Coherence> {
  return parse<Coherence>(await fetch("/api/multiplier/offers/coherence", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ product: draft.product, approved_copy: draft.approved_copy, dm_message: draft.dm_message ?? "" }),
  }));
}

export type CoherenceNotice = { tone: "good" | "warn" | "bad" | "neutral"; label: string; text: string; details: string[] };

/** O que o membro lê: uma palavra de situação, uma frase e, quando há, o título lido e as palavras. */
export function coherenceNotice(result: Coherence): CoherenceNotice {
  const details: string[] = [];
  if (result.title) details.push(`Título da página: ${result.title}`);
  if (result.shared?.length) details.push(`Em comum com o anúncio: ${result.shared.join(", ")}`);
  if (result.only_page?.length && result.level !== "alinhado") details.push(`Só na página: ${result.only_page.join(", ")}`);
  switch (result.level) {
    case "alinhado":
      return { tone: "good", label: "Alinhado", text: "A página fala do mesmo assunto do anúncio.", details };
    case "parcial":
      return { tone: "warn", label: "Em parte", text: "A página fala só em parte do que o anúncio diz. Confira se quem clicar vai reconhecer a oferta.", details };
    case "diferente":
      return { tone: "bad", label: "Diferente", text: "O título da página não tem nenhuma palavra em comum com o anúncio. Quem clicar pode achar que caiu no lugar errado.", details };
    case "sem_titulo":
      return { tone: "neutral", label: "Sem título", text: "A página abriu, mas não tem título para comparar. Abra o link e confira você mesmo.", details };
    case "sem_link":
      return { tone: "neutral", label: "Sem link", text: "A mensagem não tem link. Escreva o endereço da página na mensagem para conferir.", details };
    default:
      return result.reason === "http"
        ? { tone: "bad", label: "Não abriu", text: "O link começa com http. Use um endereço que comece com https.", details }
        : { tone: "bad", label: "Não abriu", text: "Não consegui abrir a página do link. Confira se o endereço está certo e se a página está no ar. Alguns sites recusam leitura automática: nesse caso, abra o link você mesmo.", details };
  }
}
