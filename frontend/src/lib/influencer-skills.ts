// Skills prontas do Criar influencer e as skills que o membro salva a partir dos próprios chats.
import type { Lang3, SkillId } from "@/lib/influencer-examples";

type T3 = Record<Lang3, string>;
const L = (pt: string, en: string, es: string): T3 => ({ pt, en, es });

export type SkillCategory = "ugc" | "review" | "course" | "fashion";
export type ReadySkill = { id: string; emoji: string; category: SkillCategory; skill: SkillId; name: T3; desc: T3; prompt: T3 };

export const CATEGORIES: { id: SkillCategory | "all"; name: T3 }[] = [
  { id: "all", name: L("Todas", "All", "Todas") },
  { id: "ugc", name: L("UGC de produto", "Product UGC", "UGC de producto") },
  { id: "review", name: L("Review e unboxing", "Review and unboxing", "Reseña y unboxing") },
  { id: "fashion", name: L("Moda e beleza", "Fashion and beauty", "Moda y belleza") },
  { id: "course", name: L("Curso e mentoria", "Course and mentoring", "Curso y mentoría") },
];

export const READY_SKILLS: ReadySkill[] = [
  { id: "ugc-produto", emoji: "📦", category: "ugc", skill: "dropshipping", name: L("UGC de produto", "Product UGC", "UGC de producto"),
    desc: L("A influencer mostra e usa o seu produto como um criador real.", "The influencer shows and uses your product like a real creator.", "La influencer muestra y usa tu producto como una creadora real."),
    prompt: L("Influencer de 28 anos mostrando e usando um produto em casa, estilo criador de conteúdo", "28-year-old influencer showing and using a product at home, creator style", "Influencer de 28 años mostrando y usando un producto en casa, estilo creadora de contenido") },
  { id: "problema-solucao", emoji: "🧩", category: "ugc", skill: "dropshipping", name: L("Problema e solução", "Problem and solution", "Problema y solución"),
    desc: L("Abre com o problema do cliente e termina mostrando a solução.", "Opens with the customer's problem and ends showing the solution.", "Abre con el problema del cliente y termina mostrando la solución."),
    prompt: L("Influencer de 30 anos contando um problema do dia a dia e mostrando o produto que resolveu", "30-year-old influencer telling an everyday problem and showing the product that solved it", "Influencer de 30 años contando un problema cotidiano y mostrando el producto que lo resolvió") },
  { id: "depoimento", emoji: "💬", category: "ugc", skill: "nutra", name: L("Depoimento", "Testimonial", "Testimonio"),
    desc: L("Fala sincera sobre a rotina, sem promessa de cura nem antes e depois.", "A sincere talk about her routine, no cure claims or before/after.", "Charla sincera sobre su rutina, sin promesas de cura ni antes y después."),
    prompt: L("Influencer de 52 anos na cozinha de casa contando a rotina dela com um suplemento natural", "52-year-old influencer in her home kitchen talking about her routine with a natural supplement", "Influencer de 52 años en la cocina de su casa contando su rutina con un suplemento natural") },
  { id: "review-honesto", emoji: "🛒", category: "review", skill: "mercado-livre", name: L("Review honesto", "Honest review", "Reseña honesta"),
    desc: L("Produto na mão, caixa, frete e opinião sincera.", "Product in hand, box, shipping and an honest opinion.", "Producto en la mano, caja, envío y opinión sincera."),
    prompt: L("Influencer de 40 anos fazendo um review sincero de um produto que acabou de receber, sentada na sala", "40-year-old influencer giving an honest review of a product she just received, sitting in her living room", "Influencer de 40 años haciendo una reseña sincera de un producto que acaba de recibir, sentada en el salón") },
  { id: "unboxing", emoji: "🎁", category: "review", skill: "shopee", name: L("Unboxing", "Unboxing", "Unboxing"),
    desc: L("Abre o pacote e testa na hora, com energia alta.", "Opens the parcel and tries it right away, high energy.", "Abre el paquete y lo prueba al momento, con mucha energía."),
    prompt: L("Influencer de 25 anos abrindo um pacote na penteadeira, animada", "25-year-old influencer opening a parcel at her vanity, excited", "Influencer de 25 años abriendo un paquete en su tocador, animada") },
  { id: "achadinhos", emoji: "🧡", category: "fashion", skill: "shopee", name: L("Achadinhos com cupom", "Finds with coupon", "Hallazgos con cupón"),
    desc: L("Prova as peças e fala do cupom e do frete grátis.", "Tries the pieces on and mentions the coupon and free shipping.", "Se prueba las prendas y habla del cupón y del envío gratis."),
    prompt: L("Influencer de 22 anos, loira, no quarto mostrando achadinhos de roupa que comprou", "22-year-old blonde influencer in her bedroom showing clothing finds she bought", "Influencer de 22 años, rubia, en su habitación mostrando prendas que compró") },
  { id: "provador", emoji: "👗", category: "fashion", skill: "shopee", name: L("Provador de roupas", "Fitting room", "Probador de ropa"),
    desc: L("Mostra a peça na arara e experimenta no provador.", "Shows the piece on the rack and tries it on.", "Muestra la prenda en el perchero y se la prueba."),
    prompt: L("Influencer de 22 anos, loira, em uma loja de roupas segurando uma peça e indo ao provador", "22-year-old blonde influencer in a clothing store holding a piece and heading to the fitting room", "Influencer de 22 años, rubia, en una tienda de ropa sosteniendo una prenda y yendo al probador") },
  { id: "mentora", emoji: "🎓", category: "course", skill: "infoproduto", name: L("Mentora de curso", "Course mentor", "Mentora de curso"),
    desc: L("Fala para a câmera sobre o problema que o curso resolve, sem promessa de ganho.", "Talks to camera about the problem the course solves, no income promises.", "Habla a cámara sobre el problema que resuelve el curso, sin promesas de ganancia."),
    prompt: L("Influencer de 32 anos em um escritório em casa falando sobre o curso online que criou", "32-year-old influencer in a home office talking about the online course she created", "Influencer de 32 años en una oficina en casa hablando del curso online que creó") },
];

export type MySkill = { id: string; title: string; prompt: string; skill: string; style?: Record<string, unknown>; model?: string; videoCount?: number };
/** Skill fixada: aparece direto no chat, já com o pedido e os ajustes preenchidos. */
export type PinnedSkill = { id: string; title: string; prompt: string; skill: string; emoji?: string; style?: Record<string, unknown>; model?: string; videoCount?: number };
const PIN_KEY = "gv-influencer-pinned";
export function loadPinned(): PinnedSkill[] {
  try { const saved = JSON.parse(window.localStorage.getItem(PIN_KEY) ?? "[]"); return Array.isArray(saved) ? saved : []; } catch { return []; }
}
export function savePinned(list: PinnedSkill[]): void {
  try { window.localStorage.setItem(PIN_KEY, JSON.stringify(list)); } catch { /* sem armazenamento */ }
}
const KEY = "gv-influencer-myskills";

export function loadMySkills(): MySkill[] {
  try { const saved = JSON.parse(window.localStorage.getItem(KEY) ?? "[]"); return Array.isArray(saved) ? saved : []; } catch { return []; }
}
export function saveMySkills(list: MySkill[]): void {
  try { window.localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* sem armazenamento */ }
}
