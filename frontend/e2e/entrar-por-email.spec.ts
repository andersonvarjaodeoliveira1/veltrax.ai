import fs from "fs";
import path from "path";

import { expect, test, type Page } from "@playwright/test";

import { seed, skipTutorial } from "./helpers";

// Entrada sem senha: o assinante ativo da Gringatools digita o e-mail, recebe o link e entra.
// A base de assinantes aqui é de mentira (global-setup) e os e-mails caem em e2e/.outbox, sem sair de verdade.

const OUTBOX = path.join(process.cwd(), "e2e", ".outbox");
const BASE = path.join(process.cwd(), "e2e", ".member-base.json");
const stamp = Date.now();

type Sent = { to: string; subject: string; text: string };

function setBase(patch: Record<string, unknown>) {
  const state = JSON.parse(fs.readFileSync(BASE, "utf8") || "{}") as Record<string, unknown>;
  fs.writeFileSync(BASE, JSON.stringify({ ...state, ...patch }));
}

function emailsTo(address: string): Sent[] {
  return fs.readdirSync(OUTBOX).sort().map((file) => JSON.parse(fs.readFileSync(path.join(OUTBOX, file), "utf8")) as Sent).filter((mail) => mail.to === address);
}

async function waitForEmail(address: string, count: number): Promise<Sent> {
  await expect.poll(() => emailsTo(address).length, { timeout: 20_000 }).toBe(count);
  return emailsTo(address)[count - 1];
}

async function askForLink(page: Page, address: string) {
  await page.goto("/sign-in");
  const box = page.getByPlaceholder("E-mail");
  await expect(async () => {
    await box.fill(address);
    await page.waitForTimeout(1500);
    await expect(box).toHaveValue(address, { timeout: 500 });
  }).toPass({ timeout: 30_000 });
  await page.getByRole("button", { name: "Receber link de acesso" }).click();
  await expect(page.getByRole("heading", { name: "Confira o seu e-mail" })).toBeVisible();
}

const linkIn = (mail: Sent) => new URL(mail.text.match(/https?:\/\/\S+\/entrar\/confirmar\?token=\S+/)![0]);

test("assinante ativo entra só com o e-mail e perde o acesso quando cancela", async ({ page, context }) => {
  test.setTimeout(240_000);
  const assinante = `assinante-${stamp}@clipgringa.test`;
  setBase({ [assinante]: { ativo: true, motivo: null, nome: "Marina", expira_em: "2099-01-01" } });
  await skipTutorial(page);

  // Pede o link só com o e-mail: nenhuma senha na tela.
  await askForLink(page, assinante);
  const mail = await waitForEmail(assinante, 1);
  expect(mail.subject).toBe("Seu link para entrar no ClipGringa");
  expect(mail.text).toContain("Olá, Marina!");
  expect(mail.text).toContain("WhatsApp (11) 91314-2143");

  // O link leva a uma tela com botão; abrir a tela não gasta o link (provedores de e-mail abrem links sozinhos).
  const link = linkIn(mail);
  await page.goto(link.pathname + link.search);
  await page.reload();
  await page.getByRole("button", { name: "Entrar agora" }).click();
  await page.waitForURL((url) => url.pathname === "/");
  await expect(page.getByTestId("getting-started")).toBeVisible({ timeout: 60_000 });
  const session = await page.evaluate(async () => (await (await fetch("/api/auth/get-session", { cache: "no-store" })).json()) as { user?: { email: string; name: string } });
  expect(session.user).toMatchObject({ email: assinante, name: "Marina" });

  // O link só vale uma vez.
  const outra = await context.newPage();
  await outra.goto(link.pathname + link.search);
  await outra.getByRole("button", { name: "Entrar agora" }).click();
  await expect(outra.getByRole("heading", { name: "Este link não vale mais" })).toBeVisible();
  await outra.close();

  // Cancelou a assinatura: no próximo pedido o link não vai, a sessão aberta cai e chega o aviso.
  setBase({ [assinante]: { ativo: false, motivo: "cancelou", nome: "Marina", expira_em: "2099-01-01" } });
  const fora = await context.browser()!.newContext({ userAgent: await page.evaluate(() => navigator.userAgent) });
  const visitante = await fora.newPage();
  await askForLink(visitante, assinante);
  const aviso = await waitForEmail(assinante, 2);
  expect(aviso.subject).toBe("Seu acesso ao ClipGringa está pausado");
  expect(aviso.text).not.toContain("/entrar/confirmar");
  await fora.close();
  const depois = await page.evaluate(async () => (await (await fetch("/api/auth/get-session", { cache: "no-store" })).json()) as { user?: unknown } | null);
  expect(depois?.user ?? null).toBeNull();

  // Voltou a pagar: recebe o link de novo e entra.
  setBase({ [assinante]: { ativo: true, motivo: null, nome: "Marina", expira_em: "2099-01-01" } });
  await context.clearCookies();
  await askForLink(page, assinante);
  const volta = linkIn(await waitForEmail(assinante, 3));
  await page.goto(volta.pathname + volta.search);
  await page.getByRole("button", { name: "Entrar agora" }).click();
  await page.waitForURL((url) => url.pathname === "/");
});

test("quem não é assinante vê a mesma tela, mas não recebe link nem ganha conta", async ({ page }) => {
  const curioso = `curioso-${stamp}@clipgringa.test`;
  await askForLink(page, curioso);
  await expect(page.getByText("for de um assinante ativo da Gringatools ou de uma conta já liberada")).toBeVisible();
  await expect(page.getByRole("link", { name: "Criar acesso" }).first()).toHaveAttribute("href", "/criar-acesso");
  await page.waitForTimeout(4000);
  expect(emailsTo(curioso)).toEqual([]);
  // Código inventado não entra.
  await page.goto(`/entrar/confirmar?token=${"a".repeat(32)}`);
  await page.getByRole("button", { name: "Entrar agora" }).click();
  await expect(page.getByRole("heading", { name: "Este link não vale mais" })).toBeVisible();
  await page.goto("/entrar/confirmar?token=curto");
  await expect(page.getByRole("heading", { name: "Este link não vale mais" })).toBeVisible();
});

test("conta que já existia continua entrando, também pelo link, sem depender de assinatura", async ({ page }) => {
  test.setTimeout(120_000);
  await skipTutorial(page);
  // A conta de teste não está na base de assinantes: foi criada por convite e continua valendo.
  await askForLink(page, seed.regular.email);
  const link = linkIn(await waitForEmail(seed.regular.email, 1));
  await page.goto(link.pathname + link.search);
  await page.getByRole("button", { name: "Entrar agora" }).click();
  await page.waitForURL((url) => url.pathname === "/");
  const session = await page.evaluate(async () => (await (await fetch("/api/auth/get-session", { cache: "no-store" })).json()) as { user?: { email: string } });
  expect(session.user?.email).toBe(seed.regular.email);
});
