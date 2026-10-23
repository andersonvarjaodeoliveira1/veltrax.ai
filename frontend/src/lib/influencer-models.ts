// "Meus modelos": a influencer que o membro já tem (rosto e voz), guardada no navegador para trabalhar em cima dela.
export type MyModel = {
  id: string;
  name: string;
  persona: { name: string; age: string; look: string; setting: string };
  faces: string[]; // data URLs (JPEG reduzido)
  voice: string; // descrição da voz, entra em todos os prompts
};
const KEY = "gv-influencer-models";

export function loadModels(): MyModel[] {
  try { const saved = JSON.parse(window.localStorage.getItem(KEY) ?? "[]"); return Array.isArray(saved) ? saved : []; } catch { return []; }
}
export function saveModels(list: MyModel[]): boolean {
  try { window.localStorage.setItem(KEY, JSON.stringify(list)); return true; } catch { return false; }
}

/** Lê a foto e reduz para no máximo `max` px (JPEG), para caber no armazenamento do navegador. */
export function fileToDataUrl(file: File, max = 640): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read"));
    reader.onload = () => {
      const raw = String(reader.result);
      const img = new Image();
      img.onerror = () => resolve(raw);
      img.onload = () => {
        try {
          const scale = Math.min(1, max / Math.max(img.width, img.height));
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(img.width * scale); canvas.height = Math.round(img.height * scale);
          const ctx = canvas.getContext("2d");
          if (!ctx) { resolve(raw); return; }
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", 0.85));
        } catch { resolve(raw); }
      };
      img.src = raw;
    };
    reader.readAsDataURL(file);
  });
}

export async function dataUrlToFile(dataUrl: string, name = "rosto.jpg"): Promise<File> {
  const [head, body] = dataUrl.split(",");
  const type = /data:([^;]+)/.exec(head)?.[1] ?? "image/jpeg";
  const bytes = Uint8Array.from(atob(body ?? ""), (c) => c.charCodeAt(0));
  return new File([bytes], name, { type });
}
