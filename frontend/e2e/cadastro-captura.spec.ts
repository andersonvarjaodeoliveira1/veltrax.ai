import { expect, test } from "@playwright/test";

import { callApi, signInUnlockedAdmin, skipTutorial, submitPassword } from "./helpers";

// Captura antes do cadastro: sem nome, e-mail, CPF e telefone a conta não nasce;
// com eles a conta nasce, mas a pessoa só entra depois que o administrador libera.

function cpfValido() {
  const base = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  if (base.every((d) => d === base[0])) base[8] = (base[8] + 1) % 10;
  const digito = (digitos: number[]) => {
    const soma = digitos.reduce((total, d, i) => total + d * (digitos.length + 1 - i), 0);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  const d1 = digito(base);
  return [...base, d1, digito([...base, d1])].join("");
}
const comMascara = (cpf: string) => `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;

test("captura do cadastro: pede os dados, segura a entrada e libera pelo Admin", async ({ page, context }) => {
  test.setTimeout(240_000);
  await skipTutorial(page);
  const lerCadastros = () => page.evaluate(async () => (await fetch("/api/admin/signups", { cache: "no-store" })).status);
  const stamp = Date.now();
  const pessoa = { nome: `Pessoa Captura ${stamp}`, email: `captura-${stamp}@clipgringa.test`, cpf: cpfValido(), senha: "SenhaDeTeste123!" };

  // O endereço antigo de cadastro leva para a captura.
  await page.goto("/sign-up");
  await page.waitForURL("**/criar-acesso");
  await expect(page.getByRole("heading", { name: "Criar acesso" })).toBeVisible();

  const criar = page.getByRole("button", { name: "Criar conta" });
  // Sem preencher nada, cada campo diz o que falta e nada é enviado.
  await expect(async () => {
    await criar.click();
    await expect(page.getByText("Digite o seu nome completo.")).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 30_000 });
  await expect(page.getByText("Digite um e-mail válido.")).toBeVisible();
  await expect(page.getByText("CPF inválido. Confira os números.")).toBeVisible();
  await expect(page.getByText("Digite o telefone com DDD.")).toBeVisible();
  await expect(page).toHaveURL(/criar-acesso/);

  await page.getByLabel("Nome completo").fill(pessoa.nome);
  await page.getByLabel("E-mail").fill(pessoa.email);
  await page.getByLabel("Telefone com DDD").fill("11913142143");
  await page.getByLabel("Crie uma senha").fill(pessoa.senha);
  // CPF com dígito errado não passa.
  await page.getByLabel("CPF").fill("12345678900");
  await criar.click();
  await expect(page.getByText("CPF inválido. Confira os números.")).toBeVisible();
  await expect(page).toHaveURL(/criar-acesso/);

  // Com tudo certo a conta nasce e a pessoa cai na tela de espera, com o contato do suporte.
  await page.getByLabel("CPF").fill(pessoa.cpf);
  await expect(page.getByLabel("CPF")).toHaveValue(comMascara(pessoa.cpf));
  await expect(page.getByLabel("Telefone com DDD")).toHaveValue("(11) 91314-2143");
  await criar.click();
  await page.waitForURL("**/aguardando-liberacao**");
  await expect(page.getByRole("heading", { name: "Aguardando liberação" })).toBeVisible();
  await expect(page.getByText("WhatsApp (11) 91314-2143")).toBeVisible();
  await expect(page.getByRole("link", { name: "Chamar o suporte no WhatsApp" })).toHaveAttribute("href", /wa\.me\/5511913142143/);

  // O mesmo e-mail ou o mesmo CPF não cria uma segunda conta.
  expect((await callApi(page, "POST", "/api/cadastro", { name: pessoa.nome, email: pessoa.email, cpf: cpfValido(), phone: "11913142143", password: pessoa.senha })).status).toBe(409);
  expect((await callApi(page, "POST", "/api/cadastro", { name: pessoa.nome, email: `outro-${stamp}@clipgringa.test`, cpf: pessoa.cpf, phone: "11913142143", password: pessoa.senha })).status).toBe(409);
  // E o cadastro direto pela API de autenticação, sem a captura, está fechado.
  const direto = await callApi(page, "POST", "/api/auth/sign-up/email", { name: "Sem Captura", email: `direto-${stamp}@clipgringa.test`, password: pessoa.senha });
  expect(direto.status).toBeGreaterThanOrEqual(400);

  // Antes da liberação, entrar leva de volta para a espera.
  await submitPassword(page, pessoa.email, pessoa.senha);
  await page.waitForURL("**/aguardando-liberacao");

  // O administrador vê nome, e-mail, CPF e telefone e libera.
  await signInUnlockedAdmin(page);
  const painel = page.getByTestId("signup-requests");
  const linha = painel.getByRole("row").filter({ hasText: pessoa.email });
  await expect(linha).toContainText(pessoa.nome);
  await expect(linha).toContainText(comMascara(pessoa.cpf));
  await expect(linha).toContainText("(11) 91314-2143");
  await expect(linha).toContainText("Aguardando");
  await linha.getByRole("button", { name: "Liberar" }).click();
  await expect(painel.getByRole("status")).toContainText(`Acesso de ${pessoa.nome} liberado`);
  await expect(painel.getByRole("row").filter({ hasText: pessoa.email })).toContainText("Liberado");

  // A aba Cadastros mostra a conta com os dados da captura, o dia do cadastro e a situação.
  await page.getByRole("navigation", { name: "Seções do Admin" }).getByRole("link", { name: /Cadastros/ }).click();
  await page.waitForURL("**/admin/cadastros");
  const aba = page.getByTestId("registered-users");
  await aba.getByRole("searchbox").fill(pessoa.email);
  const conta = aba.getByRole("row").filter({ hasText: pessoa.email });
  await expect(conta).toContainText(pessoa.nome);
  await expect(conta).toContainText(comMascara(pessoa.cpf));
  await expect(conta).toContainText("(11) 91314-2143");
  await expect(conta).toContainText(new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }));
  await expect(conta).toContainText("Ainda não entrou");
  await expect(conta).toContainText("Liberado");
  await aba.getByRole("searchbox").fill("");
  await expect(aba.getByRole("button", { name: /Contas cadastradas/ })).not.toContainText("…");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);

  // Quem não é administrador não lê os cadastros.
  await context.clearCookies();
  expect(await lerCadastros()).toBe(401);

  // Depois da liberação a pessoa entra com a senha que criou.
  await submitPassword(page, pessoa.email, pessoa.senha);
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in") && !url.pathname.startsWith("/aguardando"));
  await page.waitForLoadState("domcontentloaded");
  expect(await lerCadastros()).toBe(403);
  expect(await page.evaluate(async () => (await fetch("/api/admin/signups?all=1", { cache: "no-store" })).status)).toBe(403);

  // Na entrada, o guia mostra o que falta conectar em cada etapa.
  await page.goto("/");
  const guia = page.getByTestId("getting-started");
  await expect(guia.getByText("Primeiros passos para usar o ClipGringa")).toBeVisible();
  // A primeira conferência da extensão espera 6 s antes de dizer que ela não existe.
  await expect(guia.getByTestId("start-step-ext")).toContainText("Não encontrada neste Chrome", { timeout: 20_000 });
  await expect(guia.getByTestId("start-step-ai")).toContainText("Nenhuma API ou conta conectada");
  await expect(guia.getByTestId("start-step-ai").getByRole("link", { name: "Conectar minha API" })).toHaveAttribute("href", "/minhas-apis");
  await guia.getByTestId("start-step-flow").getByRole("button", { name: "Como funciona" }).click();
  await expect(guia.getByTestId("start-step-flow")).toContainText("Os créditos e os limites de geração são da sua conta Google");
});
