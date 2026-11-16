import { expect, test } from "@playwright/test";

import { callApi, seed, signIn, signInUnlockedAdmin, skipTutorial } from "./helpers";

// Avisos (Novidades), aviso de status na tela inicial e Ofertas, como o membro vê hoje.
// Substitui os antigos announcements.spec.ts, generation-status.spec.ts e app.spec.ts, que descreviam as telas em inglês.

test("administrador publica um aviso e o membro lê em Novidades", async ({ page, context }) => {
  test.setTimeout(120_000);
  await skipTutorial(page);
  const stamp = Date.now();
  const title = `Aviso de teste ${stamp}`;
  const action = `Atualizar a extensão ${stamp}`; // único, para achar o botão deste aviso entre os outros
  const description = "Esta semana o ClipGringa passa por manutenção. Você pode usar normalmente.";

  await signInUnlockedAdmin(page);
  const announcement = { title, description, href: "/conectar-flow", action, isPublished: true, publishedAt: new Date().toISOString() };
  const created = await callApi(page, "POST", "/api/admin/announcements", announcement);
  expect(created.status).toBe(201);
  const id = (created.body.announcement as { id: string }).id;

  try {
    await context.clearCookies();
    await signIn(page, seed.regular.email, seed.regular.password);
    await page.goto("/");
    // O nome lido pelo leitor de tela ainda sai em inglês quando há aviso não lido ("What's new, 1 unread announcement").
    await page.getByRole("button", { name: /Novidades|What's new/ }).filter({ visible: true }).first().click();
    const item = page.getByRole("dialog").filter({ hasText: title });
    await expect(item).toContainText(description);
    await expect(item.getByRole("link", { name: action })).toHaveAttribute("href", "/conectar-flow");

    // Quem não é administrador não publica aviso.
    const denied = await callApi(page, "POST", "/api/admin/announcements", { title: "x", description: "y", href: "/", action: "z", isPublished: true });
    expect(denied.status).toBe(403);
  } finally {
    // Tira o aviso do ar para a próxima rodada começar limpa (se o teste estourou o tempo, a página já fechou).
    if (page.isClosed()) return;
    await context.clearCookies();
    await signInUnlockedAdmin(page);
    const hidden = await callApi(page, "PATCH", `/api/admin/announcements/${id}`, { ...announcement, isPublished: false });
    expect(hidden.status).toBe(200);
  }
});

test("o aviso dos links do YouTube aparece na tela inicial só quando há problema", async ({ page }) => {
  test.setTimeout(120_000);
  await skipTutorial(page);
  let component = { status: "degraded", headline: "Links do YouTube instáveis", description: "Se o link falhar, baixe o vídeo e envie o arquivo." };
  await page.route("**/api/service-status/video-downloads", (route) => route.fulfill({ json: { component } }));

  await signIn(page, seed.regular.email, seed.regular.password);
  await page.goto("/");
  const notice = page.getByRole("status").filter({ hasText: "Links do YouTube instáveis" });
  await expect(notice).toContainText("Se o link falhar, baixe o vídeo e envie o arquivo.");
  await expect(notice.getByRole("link")).toHaveAttribute("href", "/status");
  // No celular o aviso não pode empurrar a tela para o lado.
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(notice).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  component = { status: "operational", headline: "Tudo funcionando", description: "Links e envios funcionando normalmente." };
  await page.reload();
  await expect(page.getByPlaceholder(/youtube|link/i).first()).toBeVisible();
  await expect(page.getByText("Links do YouTube instáveis")).toHaveCount(0);
});

test("membro confere a página do link, salva a oferta e apaga", async ({ page }) => {
  test.setTimeout(120_000);
  await skipTutorial(page);
  // A conferência de verdade abre uma página de fora; aqui a resposta do servidor é simulada.
  let asked: unknown = null;
  await page.route("**/api/multiplier/offers/coherence", async (route) => {
    asked = route.request().postDataJSON();
    await route.fulfill({ json: { level: "diferente", url: "https://loja.exemplo.com/curso", title: "Curso de inglês para viagem", shared: [], only_page: ["curso", "inglês", "viagem"] } });
  });
  const name = `Oferta de teste ${Date.now()}`;

  await signIn(page, seed.regular.email, seed.regular.password);
  await page.goto("/ofertas");
  const form = page.getByRole("form", { name: "Oferta" });
  const check = form.getByRole("button", { name: "Conferir a página do link" });
  await expect(check).toBeDisabled();
  await form.getByLabel("Nome da oferta").fill(name);
  await form.getByLabel("Produto").fill("Jogo de lençol");
  await form.getByLabel("Palavra que a pessoa comenta").fill("quero");
  await form.getByLabel(/Mensagem privada/).fill("Oi! Aqui está o link: https://loja.exemplo.com/curso");
  await check.click();
  const result = form.getByRole("status");
  await expect(result).toContainText("Diferente. O título da página não tem nenhuma palavra em comum com o anúncio.");
  await expect(result).toContainText("Título da página: Curso de inglês para viagem");
  expect(asked).toMatchObject({ product: "Jogo de lençol", dm_message: "Oi! Aqui está o link: https://loja.exemplo.com/curso" });

  // O aviso não impede de salvar.
  await form.getByRole("button", { name: "Salvar oferta" }).click();
  const saved = page.getByRole("region", { name: "Suas ofertas" }).getByRole("article").filter({ hasText: name });
  await expect(saved).toContainText("Jogo de lençol · Palavra: QUERO");

  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: `Apagar ${name}` }).click();
  await expect(page.getByText(name)).toHaveCount(0);
});
