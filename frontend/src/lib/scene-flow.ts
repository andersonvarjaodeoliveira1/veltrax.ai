// Monta o pacote do Flow a partir das cenas do Gerador de cenas (roteiro ou variações),
// para a extensão gerar a imagem e o vídeo de cada cena sem copiar e colar.
import { FLOW_CHOICES, FLOW_MODELS, LOWER_PRIORITY, readFlowCategory } from "@/lib/flow-models";

export type FlowScene = { text: string; scene_prompt: string; est_seconds?: number };
export type FlowVideo = { title: string; scenes: FlowScene[] };

// O Flow gera clipes de cerca de 8 segundos: fala mais longa que isso costuma sair cortada.
export const FLOW_CLIP_SECONDS = 8;

const pad = (n: number) => String(n).padStart(2, "0");
const clean = (text: string) => text.replace(/\s+/g, " ").trim();
const ending = (text: string) => (/[.!?]$/.test(text) ? text : `${text}.`);

export function sceneImagePrompt(scene: FlowScene): string {
  return `Vertical 9:16 frame, shot on a phone, natural light, realistic. ${ending(clean(scene.scene_prompt))} No on-screen text, no logos, no watermarks.`;
}

export function sceneVideoPrompt(scene: FlowScene): string {
  const speech = clean(scene.text).replace(/"/g, "'");
  const says = speech ? ` The person says to camera, word for word and in the language it is written: "${speech}"` : "";
  return `Vertical 9:16 video of about ${FLOW_CLIP_SECONDS} seconds, shot on a phone, natural light, realistic, one continuous take. ${ending(clean(scene.scene_prompt))}${says} No on-screen text, no subtitles, no logos.`;
}

export function flowChoice(modelId?: string | null) {
  const id = modelId ?? readFlowCategory() ?? FLOW_MODELS[0].id;
  return FLOW_CHOICES.find((m) => m.id === id) ?? FLOW_MODELS[0];
}

/** Só entram vídeos e cenas que têm prompt de cena. */
export function usableVideos(videos: FlowVideo[]): FlowVideo[] {
  return videos.map((v) => ({ ...v, scenes: v.scenes.filter((s) => clean(s.scene_prompt)) })).filter((v) => v.scenes.length);
}

export function packageCost(videos: FlowVideo[], modelId?: string | null): { videos: number; scenes: number; credits: number } {
  const list = usableVideos(videos);
  const scenes = list.reduce((n, v) => n + v.scenes.length, 0);
  return { videos: list.length, scenes, credits: scenes * flowChoice(modelId).credits };
}

export function buildScenePackage(videos: FlowVideo[], modelId?: string | null): string {
  const list = usableVideos(videos);
  const model = flowChoice(modelId);
  const lower = model.id === LOWER_PRIORITY.id;
  return JSON.stringify({
    app: "clipgringa-flow", version: 1, sceneCount: Math.max(0, ...list.map((v) => v.scenes.length)),
    model: model.name, flowModel: model.needle, lowerPriority: lower, fallbackModels: lower ? ["Lite", "Omni", "Fast"] : [], mode: "frames",
    videos: list.map((video, v) => ({
      title: clean(video.title) || `Vídeo ${v + 1}`,
      label: `Vídeo ${pad(v + 1)}`,
      base: v,
      scenes: video.scenes.map((scene, s) => ({ imagePrompt: sceneImagePrompt(scene), videoPrompt: sceneVideoPrompt(scene), file: `Video${pad(v + 1)}_Cena${pad(s + 1)}.mp4`, src: s })),
    })),
  }, null, 2);
}
