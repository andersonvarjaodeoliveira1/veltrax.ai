import fs from "fs";
import path from "path";

import { expect, type Page } from "@playwright/test";

/** Contas e dados criados pelo global-setup. */
export const seed = JSON.parse(fs.readFileSync(path.join(process.cwd(), "e2e", ".seed.json"), "utf8")) as {
  regular: { email: string; password: string };
  admin: { email: string; password: string };
  completedTaskId: string;
  queuedTaskId: string;
  completedSourceTitle: string;
};

// O site limita quantas vezes se entra em poucos segundos. Cada conta entra pela tela uma vez por rodada;
// os testes seguintes reaproveitam os cookies dessa sessão.
type SavedCookies = Awaited<ReturnType<ReturnType<Page["context"]>["cookies"]>>;
const sessions = new Map<string, SavedCookies>();

export async function signIn(page: Page, email: string, password: string) {
  const saved = sessions.get(email);
  if (saved) {
    await page.context().addCookies(saved);
    return;
  }
  await page.goto("/sign-in");
  const emailBox = page.getByPlaceholder("E-mail");
  const passwordBox = page.getByPlaceholder("Senha");
  // Confere os dois campos antes de enviar: uma tela remontada logo depois de abrir apagaria o que foi digitado.
  await expect(async () => {
    await emailBox.fill(email);
    await passwordBox.fill(password);
    await page.waitForTimeout(1500);
    await expect(emailBox).toHaveValue(email, { timeout: 500 });
    await expect(passwordBox).toHaveValue(password, { timeout: 500 });
  }).toPass({ timeout: 30_000 });
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"));
  sessions.set(email, await page.context().cookies());
}

/** Conta nova abre com o tutorial de quatro passos por cima da tela; marca como já visto antes de a página carregar. */
export async function skipTutorial(page: Page) {
  await page.addInitScript(() => {
    try { window.localStorage.setItem("gv-setup-tutorial-done", "1"); } catch { /* sem armazenamento */ }
  });
}

/** Entra como administrador e destrava o Admin com a senha da conta. */
export async function signInUnlockedAdmin(page: Page) {
  const key = `${seed.admin.email} (destravado)`;
  const saved = sessions.get(key);
  if (saved) {
    await page.context().addCookies(saved);
    await page.goto("/admin");
  } else {
    await signIn(page, seed.admin.email, seed.admin.password);
    await page.goto("/admin");
    await page.getByLabel("Senha da sua conta").fill(seed.admin.password);
    await page.getByRole("button", { name: "Desbloquear o Admin" }).click();
  }
  await expect(page.getByRole("heading", { name: "Painel do administrador" })).toBeVisible();
  sessions.set(key, await page.context().cookies());
}

/**
 * Chama uma rota do site de dentro da página, com os cookies do navegador.
 * (O cliente de API do Playwright não manda cookie "Secure" para http://127.0.0.1; o navegador manda.)
 */
export async function callApi(page: Page, method: "POST" | "PATCH", url: string, data: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
  return page.evaluate(async ([m, u, d]) => {
    const response = await fetch(u as string, { method: m as string, headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) });
    return { status: response.status, body: (await response.json().catch(() => ({}))) as Record<string, unknown> };
  }, [method, url, data] as const);
}

