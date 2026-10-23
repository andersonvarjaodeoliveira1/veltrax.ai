// Exemplos de influencer por nicho, mostrados no início do "Criar influencer". Textos nos 3 idiomas da interface.
export type Lang3 = "pt" | "en" | "es";
type T3 = Record<Lang3, string>;
const L = (pt: string, en: string, es: string): T3 => ({ pt, en, es });

export type SkillId = "nutra" | "dropshipping" | "mercado-livre" | "shopee" | "infoproduto";
export const SKILLS: { id: SkillId; name: T3; hint: T3; emoji: string }[] = [
  { id: "nutra", name: L("Nutra", "Nutra", "Nutra"), hint: L("Suplementos e bem-estar, sem promessa de cura", "Supplements and wellness, no cure claims", "Suplementos y bienestar, sin promesas de cura"), emoji: "🌿" },
  { id: "dropshipping", name: L("Dropshipping", "Dropshipping", "Dropshipping"), hint: L("Produto que resolve um problema, mostrado em uso", "A product that solves a problem, shown in use", "Un producto que resuelve un problema, mostrado en uso"), emoji: "📦" },
  { id: "mercado-livre", name: L("Mercado Livre", "Mercado Livre", "Mercado Libre"), hint: L("Review honesto com o produto na mão", "Honest review with the product in hand", "Reseña honesta con el producto en la mano"), emoji: "🛒" },
  { id: "infoproduto", name: L("Infoproduto", "Info product", "Infoproducto"), hint: L("Curso, ebook ou mentoria, sem promessa de ganho", "Course, ebook or mentorship, no income promises", "Curso, ebook o mentoría, sin promesas de ganancia"), emoji: "🎓" },
  { id: "shopee", name: L("Shopee", "Shopee", "Shopee"), hint: L("Achadinhos, cupom e frete grátis", "Finds, coupons and free shipping", "Hallazgos, cupones y envío gratis"), emoji: "🧡" },
];

export type Example = { id: string; skill: SkillId; emoji: string; from: string; to: string; title: T3; format: T3; prompt: T3 };
export const EXAMPLES: Example[] = [
  { id: "nutra-1", skill: "nutra", emoji: "👩‍🍳", from: "#2f6f4e", to: "#7B3FE4",
    title: L("Mulher de 55 anos, rotina de bem-estar", "55-year-old woman, wellness routine", "Mujer de 55 años, rutina de bienestar"),
    format: L("Selfie na cozinha falando da rotina · 8 a 16 s · produto na bancada", "Kitchen selfie about her routine · 8 to 16 s · product on the counter", "Selfi en la cocina hablando de su rutina · 8 a 16 s · producto en la encimera"),
    prompt: L("Influencer de 55 anos, morena, na cozinha de casa, contando a rotina dela com um suplemento natural", "55-year-old brunette influencer in her home kitchen, talking about her routine with a natural supplement", "Influencer de 55 años, morena, en la cocina de su casa, contando su rutina con un suplemento natural") },
  { id: "nutra-2", skill: "nutra", emoji: "🧔", from: "#1f5f7a", to: "#7B3FE4",
    title: L("Homem de 48 anos, energia no dia a dia", "48-year-old man, everyday energy", "Hombre de 48 años, energía en el día a día"),
    format: L("Gravando no carro, tom calmo · 8 a 16 s · sem antes e depois", "Filming in the car, calm tone · 8 to 16 s · no before/after", "Grabando en el coche, tono calmado · 8 a 16 s · sin antes y después"),
    prompt: L("Influencer homem de 48 anos, barba curta, dentro do carro, falando da rotina dele com um suplemento", "48-year-old male influencer, short beard, inside his car, talking about his routine with a supplement", "Influencer hombre de 48 años, barba corta, dentro del coche, hablando de su rutina con un suplemento") },
  { id: "drop-1", skill: "dropshipping", emoji: "🏠", from: "#a8462f", to: "#7B3FE4",
    title: L("Mulher de 28 anos, achadinho para a casa", "28-year-old woman, home gadget find", "Mujer de 28 años, hallazgo para la casa"),
    format: L("Mostra o produto funcionando · problema e solução · 8 a 16 s", "Shows the product working · problem and solution · 8 to 16 s", "Muestra el producto funcionando · problema y solución · 8 a 16 s"),
    prompt: L("Influencer de 28 anos, cabelo castanho, em casa mostrando um gadget que resolve um problema da cozinha", "28-year-old brunette influencer at home showing a gadget that solves a kitchen problem", "Influencer de 28 años, pelo castaño, en casa mostrando un gadget que resuelve un problema de la cocina") },
  { id: "drop-2", skill: "dropshipping", emoji: "🚗", from: "#5b3a8a", to: "#7B3FE4",
    title: L("Homem de 35 anos, gadget para o carro", "35-year-old man, car gadget", "Hombre de 35 años, gadget para el coche"),
    format: L("Instala e testa no carro · curiosidade no começo · 8 a 16 s", "Installs and tests it in the car · curiosity hook · 8 to 16 s", "Lo instala y prueba en el coche · gancho de curiosidad · 8 a 16 s"),
    prompt: L("Influencer homem de 35 anos mostrando um acessório útil para o carro, dentro do carro", "35-year-old male influencer showing a useful car accessory inside the car", "Influencer hombre de 35 años mostrando un accesorio útil para el coche, dentro del coche") },
  { id: "ml-1", skill: "mercado-livre", emoji: "📱", from: "#a88a1f", to: "#7B3FE4",
    title: L("Mulher de 40 anos, review honesto", "40-year-old woman, honest review", "Mujer de 40 años, reseña honesta"),
    format: L("Produto na mão, mostra a caixa e o frete · tom calmo · 8 a 16 s", "Product in hand, shows the box and shipping · calm tone · 8 to 16 s", "Producto en la mano, muestra la caja y el envío · tono calmado · 8 a 16 s"),
    prompt: L("Influencer de 40 anos fazendo um review sincero de um produto que acabou de receber, sentada na sala", "40-year-old influencer giving an honest review of a product she just received, sitting in her living room", "Influencer de 40 años haciendo una reseña sincera de un producto que acaba de recibir, sentada en el salón") },
  { id: "ml-2", skill: "mercado-livre", emoji: "🔧", from: "#7a5a2f", to: "#7B3FE4",
    title: L("Homem de 30 anos, unboxing de ferramenta", "30-year-old man, tool unboxing", "Hombre de 30 años, unboxing de herramienta"),
    format: L("Abre a caixa e mostra o que vem dentro · 8 a 16 s", "Opens the box and shows what is inside · 8 to 16 s", "Abre la caja y muestra lo que trae · 8 a 16 s"),
    prompt: L("Influencer homem de 30 anos abrindo a caixa de uma ferramenta na garagem de casa", "30-year-old male influencer unboxing a tool in his home garage", "Influencer hombre de 30 años abriendo la caja de una herramienta en el garaje de su casa") },
  { id: "shopee-1", skill: "shopee", emoji: "👗", from: "#c2562f", to: "#7B3FE4",
    title: L("Mulher de 22 anos, achadinhos de moda", "22-year-old woman, fashion haul", "Mujer de 22 años, compras de moda"),
    format: L("Prova as peças, fala do cupom · cortes rápidos · 8 a 16 s", "Tries the pieces on, mentions the coupon · quick cuts · 8 to 16 s", "Se prueba las prendas, habla del cupón · cortes rápidos · 8 a 16 s"),
    prompt: L("Influencer de 22 anos, loira, no quarto mostrando achadinhos de roupa que comprou", "22-year-old blonde influencer in her bedroom showing clothing finds she bought", "Influencer de 22 años, rubia, en su habitación mostrando prendas que compró") },
  { id: "shopee-2", skill: "shopee", emoji: "💄", from: "#b03a6a", to: "#7B3FE4",
    title: L("Mulher de 25 anos, unboxing de beleza", "25-year-old woman, beauty unboxing", "Mujer de 25 años, unboxing de belleza"),
    format: L("Abre o pacote e testa na hora · energia alta · 8 a 16 s", "Opens the parcel and tries it right away · high energy · 8 to 16 s", "Abre el paquete y lo prueba al momento · mucha energía · 8 a 16 s"),
    prompt: L("Influencer de 25 anos abrindo um pacote de maquiagem na penteadeira, animada", "25-year-old influencer opening a makeup parcel at her vanity, excited", "Influencer de 25 años abriendo un paquete de maquillaje en su tocador, animada") },
  { id: "info-1", skill: "infoproduto", emoji: "🎓", from: "#3a5fa8", to: "#7B3FE4",
    title: L("Mulher de 32 anos, mentora de um curso", "32-year-old woman, course mentor", "Mujer de 32 años, mentora de un curso"),
    format: L("Fala para a câmera no escritório · gancho de curiosidade · 8 a 16 s", "Talks to camera in her office · curiosity hook · 8 to 16 s", "Habla a cámara en su oficina · gancho de curiosidad · 8 a 16 s"),
    prompt: L("Influencer de 32 anos, morena, em um escritório em casa, falando sobre o curso online que criou", "32-year-old brunette influencer in a home office talking about the online course she created", "Influencer de 32 años, morena, en una oficina en casa, hablando del curso online que creó") },
  { id: "info-2", skill: "infoproduto", emoji: "💻", from: "#2a4f7a", to: "#7B3FE4",
    title: L("Homem de 29 anos, ebook para iniciantes", "29-year-old man, beginner ebook", "Hombre de 29 años, ebook para principiantes"),
    format: L("Mostra a tela e o passo a passo · comente a palavra-chave · 8 a 16 s", "Shows the screen and the steps · comment the keyword · 8 to 16 s", "Muestra la pantalla y los pasos · comenta la palabra clave · 8 a 16 s"),
    prompt: L("Influencer homem de 29 anos em casa, em frente ao notebook, apresentando um ebook para iniciantes", "29-year-old male influencer at home in front of his laptop presenting a beginner ebook", "Influencer hombre de 29 años en casa, frente a su portátil, presentando un ebook para principiantes") },
];
