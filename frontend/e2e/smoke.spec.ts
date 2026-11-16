import fs from "fs";
import path from "path";

import { expect, test, type Page } from "@playwright/test";

// Conferência rápida das telas de hoje, em português, com as contas criadas pelo global-setup.
const seed = JSON.parse(fs.readFileSync(path.join(process.cwd(), "e2e", ".seed.json"), "utf8"));

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/sign-in");
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"));
}

test("a página inicial abre para quem não entrou", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Transforme vídeos longos em cortes que prendem a atenção" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Entrar", exact: true })).toHaveAttribute("href", "/sign-in");
});

test("o cadastro mostra a animação do vídeo virando cortes", async ({ page }) => {
  await page.goto("/sign-up");
  await expect(page.getByText("podcast-episode-42.mp4", { exact: false })).toBeAttached();
});

test("membro entra, vê a biblioteca e não abre o Admin", async ({ page }) => {
  // A primeira visita compila cada rota no servidor de desenvolvimento; no CI isso passa de um minuto.
  test.setTimeout(120_000);
  await signIn(page, seed.regular.email, seed.regular.password);

  await page.goto("/list");
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
