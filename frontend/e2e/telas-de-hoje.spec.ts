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
    // Com aviso não lido, o leitor de tela diz "Novidades, 1 aviso não lido".
    await page.getByRole("button", { name: /^Novidades, \d+ avisos? não lidos?$/ }).filter({ visible: true }).first().click();
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

for (const tela of [{ nome: "celular", width: 390, height: 844 }, { nome: "computador", width: 1440, height: 900 }]) {
  test(`no ${tela.nome} os botões flutuantes não cobrem o menu nem uns aos outros`, async ({ page }) => {
    await skipTutorial(page);
    await page.setViewportSize({ width: tela.width, height: tela.height });
    await signIn(page, seed.regular.email, seed.regular.password);
    await page.goto("/ofertas");
    const pieces = {
      // No celular o menu fica embaixo; no computador, na lateral.
      ...(tela.nome === "celular" ? { menu: page.getByRole("navigation", { name: /Mobile navigation|Navegação/ }) } : {}),
      relatar: page.getByRole("button", { name: "Relatar erro ou sugestão" }),
      duvida: page.getByRole("button", { name: "Tirar uma dúvida com o assistente" }),
      suporte: page.getByRole("button", { name: "Suporte" }),
      conexoes: page.getByRole("button", { name: /^Conexões: / }),
    };
    const boxes: Record<string, { x: number; y: number; width: number; height: number }> = {};
    for (const [name, locator] of Object.entries(pieces)) {
      await expect(locator, name).toBeVisible();
      boxes[name] = (await locator.boundingBox())!;
    }
    const names = Object.keys(boxes);
    for (let i = 0; i < names.length; i += 1) {
      for (let j = i + 1; j < names.length; j += 1) {
        const a = boxes[names[i]];
        const b = boxes[names[j]];
        const overlap = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
        expect(overlap, `${names[i]} em cima de ${names[j]}`).toBe(false);
      }
    }
    if (process.env.CAPTURAS) await page.screenshot({ path: `${process.env.CAPTURAS}/flutuantes-${tela.nome}.png` });
  });
}

test("no celular o texto de Minhas APIs não fica espremido ao lado do botão", async ({ page }) => {
  await skipTutorial(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, seed.regular.email, seed.regular.password);
  await page.goto("/minhas-apis");
  const text = page.getByTestId("ai-source-card").locator("span.min-w-0");
  await expect(text).toBeVisible();
  expect((await text.boundingBox())!.width).toBeGreaterThan(200);
  if (process.env.CAPTURAS) await page.screenshot({ path: `${process.env.CAPTURAS}/minhas-apis-celular.png` });
});

test("membro abre a área Facebook, sem as funções de navegador de perfis", async ({ page }) => {
  await skipTutorial(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, seed.regular.email, seed.regular.password);
  await page.goto("/facebook");
  await expect(page.getByRole("heading", { name: "Facebook" })).toBeVisible();
  await expect(page.getByText("Esta área está sendo construída")).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: /Main navigation|Navegação principal/ }).getByRole("link", { name: /Facebook/ })).toBeVisible();

  await page.getByRole("tab", { name: /Perfis/ }).click();
  await expect(page.getByRole("button", { name: "Adicionar conta à mão" })).toBeVisible();
  for (const text of [/Conector/, /Dolphin/, /Proteção das contas/, /proxy/i]) await expect(page.getByText(text)).toHaveCount(0);

  // cadastra um perfil à mão e anota a situação: o aviso dos posts parados aparece
  const name = `Perfil e2e ${Date.now()}`;
  await page.getByRole("button", { name: "Adicionar conta à mão" }).click();
  await expect(page.getByLabel("Onde abre")).toHaveCount(0);
  await page.getByLabel("Nome do perfil").fill(name);
  await page.getByRole("button", { name: "Adicionar", exact: true }).click();
  const row = page.getByRole("listitem").filter({ hasText: name });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Anotar situação" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Com restrição" }).click();
  await expect(dialog.getByText("Enquanto estiver assim, os posts das páginas deste perfil ficam parados.")).toBeVisible();
  await dialog.getByRole("button", { name: "Salvar" }).click();
  await expect(row.getByText("Com restrição")).toBeVisible();
  // limpa: apaga o perfil criado
  await row.getByRole("button", { name: "Anotar situação" }).click();
  await dialog.getByRole("button", { name: "Apagar perfil" }).click();
  await dialog.getByRole("button", { name: "Sim, apagar" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: name })).toHaveCount(0);
});
