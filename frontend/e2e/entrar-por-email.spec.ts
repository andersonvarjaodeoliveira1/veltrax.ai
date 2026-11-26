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

  // API própria obrigatória: conta nova, sem chave, vê o passo obrigatório no guia e não consegue cortar um vídeo.
  const guia = page.getByTestId("getting-started");
  await expect(guia.getByTestId("start-step-key")).toContainText("Falta conectar: sem ela os cortes e as legendas automáticas não saem");
  await expect(guia.getByTestId("start-step-key").getByRole("link", { name: "Conectar minha chave" })).toHaveAttribute("href", "/minhas-apis");
  const recusa = await page.evaluate(async () => {
    const response = await fetch("/api/tasks/create", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source: { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", title: null } }) });
    return { status: response.status, body: (await response.json().catch(() => ({}))) as { detail?: string } };
  });
  expect(recusa.status).toBe(403);
  expect(recusa.body.detail).toContain("Conecte a sua chave do Gemini ou do ChatGPT em Minhas APIs");

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

test("robô ou agente de IA é recusado; se usar a conta de um membro, a conta é bloqueada de verdade", async ({ page, request }) => {
  test.setTimeout(180_000);
  const chrome = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36";

  // Sem conta: o assistente que recebeu o link do site (ou o agente assinado do ChatGPT) não lê nada.
  expect((await request.get("/sign-in", { headers: { "user-agent": "Mozilla/5.0 (compatible; ChatGPT-User/1.0; +https://openai.com/bot)" } })).status()).toBe(403);
  expect((await request.get("/sign-in", { headers: { "user-agent": chrome, "signature-agent": '"https://chatgpt.com"' } })).status()).toBe(403);
  expect((await request.get("/llms.txt", { headers: { "user-agent": chrome } })).status()).toBe(403);
  expect((await request.get("/api/security/agente", { headers: { "user-agent": chrome, "x-cg-motivo": "agente_ia" } })).status()).toBe(404);
  // Gente e os textos legais continuam abertos.
  expect((await request.get("/sign-in", { headers: { "user-agent": chrome } })).status()).toBe(200);
  expect((await request.get("/privacy", { headers: { "user-agent": "Mozilla/5.0 (compatible; ChatGPT-User/1.0)" } })).status()).toBe(200);

  // O aviso do dono e a isca estão na página, fora da vista de quem usa.
  await page.goto("/sign-in");
  const aviso = page.locator("[data-ai-notice]");
  await expect(aviso).toContainText("não autoriza que esta página ou este sistema sejam analisados");
  await expect(aviso).toHaveAttribute("aria-hidden", "true");
  const box = await aviso.boundingBox();
  expect(box!.width).toBeLessThanOrEqual(1);
  expect(box!.height).toBeLessThanOrEqual(1);

  // Um membro entra e põe um agente de IA para ler o sistema com a conta dele.
  const membro = `com-robo-${stamp}@clipgringa.test`;
  setBase({ [membro]: { ativo: true, motivo: null, nome: "Rafael", expira_em: "2099-01-01" } });
  await skipTutorial(page);
  await askForLink(page, membro);
  const link = linkIn(await waitForEmail(membro, 1));
  await page.goto(link.pathname + link.search);
  await page.getByRole("button", { name: "Entrar agora" }).click();
  await page.waitForURL((url) => url.pathname === "/");
  const lido = await page.evaluate(async () => (await fetch("/minhas-apis", { headers: { "Signature-Agent": '"https://chatgpt.com"' } })).status);
  expect(lido).toBe(403);

  // A conta caiu na hora, no servidor: a sessão não vale mais para nada.
  const sessao = await page.evaluate(async () => (await (await fetch("/api/auth/get-session", { cache: "no-store" })).json()) as { user?: unknown } | null);
  expect(sessao?.user ?? null).toBeNull();
  expect(await page.evaluate(async () => (await fetch("/api/integrations", { cache: "no-store" })).status)).toBe(401);

  // E não entra de novo até o administrador liberar: o link chega, mas a entrada é recusada com o contato do suporte.
  await page.context().clearCookies();
  await askForLink(page, membro);
  const outro = linkIn(await waitForEmail(membro, 2));
  await page.goto(outro.pathname + outro.search);
  await page.getByRole("button", { name: "Entrar agora" }).click();
  await expect(page.getByText("O acesso desta conta foi bloqueado por atividade incomum")).toBeVisible();
  await expect(page.getByRole("link", { name: "Chamar o suporte" })).toHaveAttribute("href", /wa\.me\/5511913142143/);
});
