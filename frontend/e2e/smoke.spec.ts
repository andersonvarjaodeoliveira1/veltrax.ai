import { expect, test } from "@playwright/test";

import { seed, signIn } from "./helpers";

// Conferência rápida das telas de hoje, em português, com as contas criadas pelo global-setup.

test("a página inicial abre para quem não entrou", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Transforme vídeos longos em cortes que prendem a atenção" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Entrar", exact: true })).toHaveAttribute("href", "/sign-in");
});

test("as páginas que a Meta pede estão abertas ao público", async ({ page }) => {
  await page.goto("/data-deletion");
  await expect(page.getByRole("heading", { name: "Exclusão de dados" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Data deletion" })).toBeVisible();
  await page.goto("/privacy");
  await expect(page.getByRole("heading", { level: 1, name: "Política de Privacidade" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Páginas do Facebook e dados da Meta" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Facebook Pages and Meta Data" })).toBeVisible();
  await page.goto("/terms");
  await expect(page.getByRole("heading", { level: 1, name: "Termos de Serviço" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Terms of Service" })).toBeVisible();
});

test("a tela de login abre em português sem ser refeita pelo React", async ({ page }) => {
  // O tradutor trocava o texto antes de o React assumir a página; o React refazia a tela e apagava o que já estava digitado.
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/sign-in");
  await expect(page.getByRole("heading", { name: "Bem-vindo de volta" })).toBeVisible();
  await expect(page.getByPlaceholder("E-mail")).toBeVisible();
  await page.waitForTimeout(1500);
  // Em desenvolvimento o React diz "Hydration failed"; no site de produção o mesmo erro vem com número (418, 423, 425).
  expect(errors.filter((message) => /Hydration failed|Minified React error #(418|423|425)/.test(message))).toEqual([]);
});

test("o login mostra a animação do vídeo virando cortes", async ({ page }) => {
  await page.goto("/sign-in");
  await expect(page.getByText("podcast-episode-42.mp4", { exact: false })).toBeAttached();
});

test("membro entra, vê a biblioteca e não abre o Admin", async ({ page }) => {
  // A primeira visita compila cada rota no servidor de desenvolvimento; no CI isso passa de um minuto.
  test.setTimeout(120_000);
  await signIn(page, seed.regular.email, seed.regular.password);

  await page.goto("/list");
  // Conta nova abre com o tutorial de quatro passos por cima da tela.
  const tutorial = page.getByRole("dialog", { name: /Antes de começar/ });
  await expect(tutorial).toBeVisible({ timeout: 30_000 });
  await tutorial.getByRole("button", { name: "Pular" }).click();
  await expect(tutorial).toBeHidden();

  await expect(page.getByRole("heading", { name: "Biblioteca" })).toBeVisible();
  await expect(page.getByText(/2 gerações/)).toBeVisible();

  await page.goto("/admin");
  await expect(page.getByText("Você está logado, mas esta conta não é de administrador.")).toBeVisible();
});

test("administrador destrava o Admin com a senha e vê o status do sistema", async ({ page }) => {
  test.setTimeout(120_000);
  await signIn(page, seed.admin.email, seed.admin.password);

  await page.goto("/admin");
  await expect(page.getByText("Admin protegido")).toBeVisible();
  await page.getByLabel("Senha da sua conta").fill(seed.admin.password);
  await page.getByRole("button", { name: "Desbloquear o Admin" }).click();

  await expect(page.getByRole("heading", { name: "Painel do administrador" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Status do sistema" })).toBeVisible();
});
