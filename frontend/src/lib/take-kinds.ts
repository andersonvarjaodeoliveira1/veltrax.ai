/** Tipos de take: o que muda quando a pessoa pede "mais um take" da mesma cena. */
export type TakeKind = "same" | "variation" | "continue" | "speak";

export const TAKE_KINDS: { id: TakeKind; label: string; hint: string; suffix: string }[] = [
  { id: "same", label: "Outra versão", hint: "A mesma cena de novo, para escolher a melhor", suffix: "" },
  { id: "variation", label: "Variação", hint: "Muda o ângulo, o enquadramento e os gestos", suffix: " Variation: change the camera angle, the framing and the small gestures; keep the same person, outfit, setting and spoken line." },
  { id: "continue", label: "Continuidade", hint: "O momento seguinte da cena, sem corte", suffix: " Continuation: this is the moment right after the previous take of this scene; same person, same place, same light and outfit, seamless continuity, the action keeps going." },
  { id: "speak", label: "Falando para a câmera", hint: "Ela fala olhando para a câmera, com a boca sincronizada", suffix: " The person looks at the camera and speaks the scene line with natural, believable lip-sync and small facial expressions." },
];

export const takeKind = (id?: string) => TAKE_KINDS.find((item) => item.id === id) ?? TAKE_KINDS[0];
export const withTake = (prompt: string, id?: string) => `${prompt}${takeKind(id).suffix}`;
export const takeTag = (n: number, id?: string) => `_Take${n}${id && id !== "same" ? `_${id}` : ""}`;
