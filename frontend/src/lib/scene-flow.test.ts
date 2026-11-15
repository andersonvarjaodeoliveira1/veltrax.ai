import { describe, expect, it } from "vitest";
import { buildScenePackage, packageCost, sceneVideoPrompt } from "./scene-flow";

const scenes = [
  { text: 'Pare de rolar se você tem "dor" nas costas.', scene_prompt: "Mulher de 50 anos sentada na cadeira do escritório" },
  { text: "", scene_prompt: "Cronômetro em cima da mesa." },
  { text: "Sem prompt, fica de fora.", scene_prompt: "  " },
];

describe("scene-flow", () => {
  it("monta um vídeo por roteiro, só com as cenas que têm prompt", () => {
    const pkg = JSON.parse(buildScenePackage([{ title: "Original", scenes }, { title: "Vazio", scenes: [scenes[2]] }], "lite"));

    expect(pkg.app).toBe("clipgringa-flow");
    expect(pkg.flowModel).toBe("Lite");
    expect(pkg.videos).toHaveLength(1);
    expect(pkg.videos[0].scenes.map((s: { file: string }) => s.file)).toEqual(["Video01_Cena01.mp4", "Video01_Cena02.mp4"]);
    expect(pkg.videos[0].scenes.every((s: { imagePrompt: string; videoPrompt: string }) => s.imagePrompt && s.videoPrompt)).toBe(true);
  });

  it("leva a fala palavra por palavra e não inventa fala em cena muda", () => {
    expect(sceneVideoPrompt(scenes[0])).toContain("\"Pare de rolar se você tem 'dor' nas costas.\"");
    expect(sceneVideoPrompt(scenes[1])).not.toContain("says to camera");
    expect(sceneVideoPrompt(scenes[1])).toContain("Cronômetro em cima da mesa. No on-screen text");
  });

  it("Lower Priority leva os modelos reserva e custa zero créditos", () => {
    const pkg = JSON.parse(buildScenePackage([{ title: "A", scenes }], "lower"));

    expect(pkg.lowerPriority).toBe(true);
    expect(pkg.fallbackModels).toEqual(["Lite", "Omni", "Fast"]);
    expect(packageCost([{ title: "A", scenes }], "lower")).toEqual({ videos: 1, scenes: 2, credits: 0 });
    expect(packageCost([{ title: "A", scenes }, { title: "B", scenes }], "fast").credits).toBe(80);
  });
});
