import { expect, test } from "@playwright/test";

import { seed, signIn, skipTutorial } from "./helpers";

// Em produção (21/11 e 23/11) o site cortava em 10 MB todo arquivo enviado por /api: o vídeo de referência do
// Vídeo orgânico chegava pela metade e a leitura quebrava com "Failed to parse body as FormData".
const MB = 1024 * 1024;

test("vídeo acima de 10 MB passa inteiro pelo site", async ({ page }) => {
  test.setTimeout(180_000);
  await skipTutorial(page);
  await signIn(page, seed.regular.email, seed.regular.password);

  // Envio em fluxo (Juntar vídeos): o servidor devolve o tamanho que recebeu.
  const stored = await page.evaluate(async (size) => {
    const response = await fetch("/api/multiplier/flow-videos/mine?package=teste-envio-grande&file=grande.mp4", {
      method: "POST", headers: { "Content-Type": "video/mp4" }, body: new Blob([new Uint8Array(size)], { type: "video/mp4" }),
    });
    return { status: response.status, body: (await response.json().catch(() => null)) as { id?: string; size?: number } | null };
  }, 24 * MB);
  expect(stored.status).toBe(200);
  expect(stored.body?.size).toBe(24 * MB);

  // Envio por formulário (vídeo de referência do Vídeo orgânico). O arquivo de teste não é um vídeo de verdade,
  // então a resposta certa é o servidor dizer que não conseguiu ler (400), e não o site quebrar (500).
  const draft = await page.evaluate(async (size) => {
    const form = new FormData();
    form.append("video", new Blob([new Uint8Array(size)], { type: "video/mp4" }), "referencia.mp4");
    const response = await fetch("/api/multiplier/captions/draft", { method: "POST", body: form });
    return { status: response.status, body: (await response.json().catch(() => null)) as { detail?: string } | null };
  }, 24 * MB);
  expect(draft.status).toBe(400);
  expect(draft.body?.detail).toBe("Could not read this video");

  if (stored.body?.id) await page.evaluate(async (id) => { await fetch(`/api/multiplier/flow-videos/${id}`, { method: "DELETE" }); }, stored.body.id);
});
