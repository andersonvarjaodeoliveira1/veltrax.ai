// Aviso de política da Shopee Vídeo (produtos proibidos e restritos, promessas de saúde).
// É uma checagem por palavras: ajuda a pessoa a perceber o risco antes de gerar, não substitui a leitura da política.
export type PolicyHit = { level: "proibido" | "restrito" | "promessa"; label: string; tip: string };

const RULES: { level: PolicyHit["level"]; label: string; tip: string; re: RegExp }[] = [
  { level: "proibido", label: "Bebida alcoólica, cigarro ou vape", tip: "Produto proibido na Shopee Vídeo.", re: /\b(cerveja|vinho|vodka|whisk(?:e)?y|cacha[cç]a|bebida alco[oó]lica|cigarro|tabaco|narguil[eé]|vape|pod descart[aá]vel|beer|cigarette)\b/i },
  { level: "proibido", label: "Arma ou munição", tip: "Produto proibido na Shopee Vídeo.", re: /\b(arma de fogo|muni[cç][aã]o|rev[oó]lver|pistola|espingarda|explosivo|firearm|ammunition)\b/i },
  { level: "proibido", label: "Droga ou remédio", tip: "Remédios e drogas são proibidos. Suplemento não pode prometer tratar doença.", re: /\b(maconha|cannabis|cocaína|cocaina|rem[eé]dio|medicamento|rivotril|ozempic|tirzepatida|anabolizante|esteroide|prescription drug)\b/i },
  { level: "proibido", label: "Animal silvestre", tip: "Animais silvestres ou ameaçados e partes deles são proibidos.", re: /\b(animal silvestre|marfim|pele de on[cç]a|tartaruga marinha|ivory)\b/i },
  { level: "proibido", label: "Ebook, ingresso ou voucher", tip: "Livros digitais, ingressos e vouchers são proibidos.", re: /\b(e-?book|livro digital|ingresso|voucher|vale-presente digital|gift card)\b/i },
  { level: "proibido", label: "Jogo de azar", tip: "Jogos de azar e caixas misteriosas são proibidos.", re: /\b(jogo do tigrinho|tigrinho|cassino|apostas?|bet|roleta|caixa misteriosa|mystery box)\b/i },
  { level: "proibido", label: "Serviço financeiro, jurídico ou dropshipping", tip: "Esses serviços não podem ser anunciados.", re: /\b(empr[eé]stimo|cr[eé]dito f[aá]cil|investimento|renda extra garantida|criptomoeda|bitcoin|advogado|consultoria jur[ií]dica|dropshipping|curso de dropshipping)\b/i },
  { level: "promessa", label: "Promessa milagrosa de saúde", tip: "A Anvisa não permite prometer cura ou resultado garantido. Troque por benefícios reais e sem garantia.", re: /\b(cura|curar|cura definitiva|emagre[cç]a? \d+ ?kg|perca \d+ ?kg|queima gordura sem|resultado garantido|100% garantido|milagr\w+|sem dieta e sem exerc[ií]cio|elimina (?:a )?diabetes|trata (?:o )?c[aâ]ncer|rejuvenesce \d+ anos)\b/i },
  { level: "proibido", label: "Conteúdo de ódio ou violência", tip: "Conteúdo de ódio, violência, discriminação e símbolos nazistas é proibido.", re: /\b(nazista|svastica|suástica|ódio racial|incitar viol[eê]ncia)\b/i },
  { level: "restrito", label: "Celular ou tablet", tip: "Exigem número de homologação (Anatel) cadastrado.", re: /\b(celular|smartphone|iphone|tablet|ipad)\b/i },
  { level: "restrito", label: "Bateria ou óleo lubrificante", tip: "Pilhas, baterias automotivas e óleos lubrificantes têm exigências específicas.", re: /\b(bateria automotiva|pilhas?|bateria de carro|[oó]leo lubrificante|[oó]leo de motor)\b/i },
  { level: "restrito", label: "Clareador dental forte", tip: "Clareador com mais de 3% de peróxido é restrito.", re: /\b(clareador dental|clareamento dental|per[oó]xido de hidrog[eê]nio|per[oó]xido de carbamida)\b/i },
];

export function checkPolicy(...texts: (string | undefined | null)[]): PolicyHit[] {
  const text = texts.filter(Boolean).join("\n").slice(0, 60_000);
  if (!text.trim()) return [];
  const hits: PolicyHit[] = [];
  for (const rule of RULES) if (rule.re.test(text)) hits.push({ level: rule.level, label: rule.label, tip: rule.tip });
  return hits;
}
export const policySignature = (hits: PolicyHit[]) => hits.map((hit) => hit.label).sort().join("|");
