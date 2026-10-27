// Modelos prontos de influencer realista (estilo UGC brasileiro). Todas as personas são originais e fictícias:
// a descrição fixa de identidade (idade, cabelo, pele, traços) segue a dica de consistência de personagem
// (ideia geral de metrosir/consistent-ai-character-prompts, MIT) com texto próprio.
import type { MyModel } from "./influencer-models";

export type PresetModel = { id: string; photo?: string; /* caminho em /public, ex.: /influencers/presets/camila.jpg */  name: string; scene: string; model: Omit<MyModel, "id" | "faces">; facePrompt: string };

const SKIN = "visible pores, micro-texture, natural skin imperfections, subtle peach fuzz, natural skin sheen, no airbushing, no smoothing filters";
function face(look: string, scene: string, camera: string) {
  return `Candid vertical smartphone photo of ${look}, ${scene}. ${camera}. Natural available light, slight phone-camera grain, casual unposed expression, asymmetric face, individual hair strands, fabric texture visible, Kodak Portra 400 color science. ${SKIN}`;
}
const PHONE = "Shot on iPhone 15 Pro main camera, 24mm equivalent, f/1.8, ISO 200, 1/120s, 9:16";

export const PRESET_MODELS: PresetModel[] = [
  { id: "p-camila", photo: "/influencers/presets/p-camila.jpg", name: "Camila", scene: "Selfie no espelho",
    model: { name: "Camila", persona: { name: "Camila", age: "24", look: "Brazilian woman, 24, long dark wavy hair, warm tan skin, brown eyes, small gold hoop earrings, relaxed smile", setting: "bright bedroom with a full-length mirror, taking a mirror selfie holding the phone at chest height" }, voice: "Voz feminina jovem, animada e próxima, português do Brasil, ritmo de conversa com amiga" },
    facePrompt: face("a Brazilian woman, 24, long dark wavy hair, warm tan skin, brown eyes, small gold hoop earrings, red cropped top and white shorts", "taking a mirror selfie in a bright bedroom with a full-length mirror, phone covering part of her face", PHONE) },
  { id: "p-bruna", photo: "/influencers/presets/p-bruna.jpg", name: "Bruna", scene: "Provador de loja",
    model: { name: "Bruna", persona: { name: "Bruna", age: "29", look: "Brazilian woman, 29, shoulder-length straight black hair with side part, light brown skin, hazel eyes, minimal makeup, small beauty mark on left cheek", setting: "clothing store fitting room, warm overhead light, mirror behind her" }, voice: "Voz feminina madura e confiante, simpática, português do Brasil, ritmo tranquilo" },
    facePrompt: face("a Brazilian woman, 29, shoulder-length straight black hair with side part, light brown skin, hazel eyes, minimal makeup, small beauty mark on left cheek, casual blouse", "inside a clothing store fitting room, warm overhead light, mirror behind her", PHONE) },
  { id: "p-thais", photo: "/influencers/presets/p-thais.jpg", name: "Thaís", scene: "Cozinha / unboxing",
    model: { name: "Thaís", persona: { name: "Thaís", age: "33", look: "Brazilian woman, 33, curly dark brown hair in a loose bun, deep brown skin, brown eyes, gold nose stud, friendly wide smile", setting: "home kitchen with natural window light, countertop with products" }, voice: "Voz feminina calorosa e expressiva, português do Brasil, fala rápida de quem está empolgada" },
    facePrompt: face("a Brazilian woman, 33, curly dark brown hair in a loose bun, deep brown skin, brown eyes, gold nose stud, friendly wide smile, plain cotton tee", "standing in a home kitchen with soft window light, holding a product box toward the camera", PHONE) },
  { id: "p-larissa", photo: "/influencers/presets/p-larissa.jpg", name: "Larissa", scene: "Rotina / skincare",
    model: { name: "Larissa", persona: { name: "Larissa", age: "21", look: "Brazilian woman, 21, light brown wavy hair with highlights, fair skin with light freckles, green eyes, hair clip, bare face", setting: "bathroom sink with ring-light reflection, getting-ready routine" }, voice: "Voz feminina jovem e suave, português do Brasil, tom de bastidores, quase sussurrado" },
    facePrompt: face("a Brazilian woman, 21, light brown wavy hair with highlights held by a clip, fair skin with light freckles, green eyes, no makeup, white robe", "bathroom getting-ready routine, soft ring-light reflection on the mirror", PHONE) },
  { id: "p-rafael", photo: "/influencers/presets/p-rafael.jpg", name: "Rafael", scene: "Review de produto",
    model: { name: "Rafael", persona: { name: "Rafael", age: "28", look: "Brazilian man, 28, short black fade haircut, light stubble, medium brown skin, brown eyes, casual gray t-shirt", setting: "living room sofa, daylight from a side window, holding the product" }, voice: "Voz masculina jovem e descontraída, português do Brasil, jeito de quem conta uma dica" },
    facePrompt: face("a Brazilian man, 28, short black fade haircut, light stubble, medium brown skin, brown eyes, casual gray t-shirt", "sitting on a living room sofa with daylight from a side window, holding a product toward the camera", PHONE) },
  { id: "p-marcos", photo: "/influencers/presets/p-marcos.jpg", name: "Marcos", scene: "Carro / dica rápida",
    model: { name: "Marcos", persona: { name: "Marcos", age: "38", look: "Brazilian man, 38, short salt-and-pepper beard, shaved head, tan skin, dark eyes, navy polo shirt", setting: "inside a parked car, selfie angle, daylight through windshield" }, voice: "Voz masculina grave e segura, português do Brasil, estilo direto de quem dá um conselho" },
    facePrompt: face("a Brazilian man, 38, short salt-and-pepper beard, shaved head, tan skin, dark eyes, navy polo shirt", "inside a parked car, selfie angle with the phone held at arm's length, daylight through the windshield", PHONE) },
  { id: "p-dona-neide", photo: "/influencers/presets/p-dona-neide.jpg", name: "Dona Neide", scene: "Depoimento 50+",
    model: { name: "Dona Neide", persona: { name: "Dona Neide", age: "56", look: "Brazilian woman, 56, short gray-streaked brown hair, olive skin with natural wrinkles, warm brown eyes, reading glasses on a cord, floral blouse", setting: "living room with sofa and family photos, daylight, speaking directly to the camera" }, voice: "Voz feminina madura e carinhosa, português do Brasil, fala pausada, tom de depoimento sincero" },
    facePrompt: face("a Brazilian woman, 56, short gray-streaked brown hair, olive skin with natural wrinkles, warm brown eyes, reading glasses on a cord, floral blouse", "sitting in a living room with family photos behind her, speaking directly to the camera", PHONE) },
  { id: "p-gabi-fit", photo: "/influencers/presets/p-gabi-fit.jpg", name: "Gabi", scene: "Academia / fitness",
    model: { name: "Gabi", persona: { name: "Gabi", age: "26", look: "Brazilian woman, 26, brown hair in a high ponytail, athletic build, tan skin, brown eyes, black sports top, light sweat on forehead", setting: "gym with mirrors and equipment behind her, post-workout, bright artificial light" }, voice: "Voz feminina enérgica e motivadora, português do Brasil, respiração leve de quem treinou" },
    facePrompt: face("a Brazilian woman, 26, brown hair in a high ponytail, athletic build, tan skin, brown eyes, black sports top, light sweat on forehead", "post-workout mirror selfie in a gym, equipment and mirrors behind her, bright artificial light", PHONE) },
];
