import { test, expect, type Page } from "@playwright/test";
import { seed, signIn } from "./helpers";

// Caminho do membro ao entrar: cada tela abre sem erro, sem tela de "deu errado" e sem erro grave no console.
const IGNORAR = [
  /Minified React error #(418|423|425)/, // hidratação com a tradução da página; conhecido
  /Download the React DevTools/,
  /datafa\.st|datafast/i,                 // medição externa
  /favicon|manifest|\.map\b/i,
  /Failed to load resource.*(401|403|404)/, // chamadas de API sem dado ainda; a tela trata
  /flow-status|clipgringa-flow/i,          // extensão ausente no teste
];
function ouvirErros(page: Page) {
  const erros: string[] = [];
  page.on("pageerror", (e) => erros.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" && !IGNORAR.some((re) => re.test(m.text()))) erros.push(`console: ${m.text().slice(0, 200)}`); });
  return erros;
}

const TELAS: Array<[string, string, RegExp]> = [
  ["Início", "/", /Novos cortes|Comece|Cortes/i],
  ["Biblioteca", "/list", /Biblioteca|corte/i],
  ["Pastas", "/folders", /Pasta/i],
  ["Vídeo orgânico", "/automacao", /orgânico|vídeo/i],
  ["Avatar influencer", "/influencer", /influencer|avatar/i],
  ["Conectar ao Flow", "/conectar-flow", /Flow|extens/i],
  ["Ofertas", "/ofertas", /Oferta/i],
  ["Juntar vídeos", "/juntar-videos", /Juntar|cena/i],
  ["ClipSpy", "/clipspy", /ClipSpy|anúncio/i],
  ["Minhas APIs", "/minhas-apis", /API|chave|IA/i],
  ["Facebook", "/facebook", /Facebook/i],
  ["Configurações", "/settings", /./],
];

test("membro percorre todas as telas sem erro", async ({ page }) => {
  test.setTimeout(240_000);
  const erros = ouvirErros(page);
  await signIn(page, seed.regular.email, seed.regular.password);
  const problemas: string[] = [];
  for (const [nome, rota, marca] of TELAS) {
    const antes = erros.length;
    await page.goto(rota, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);
    const corpo = await page.locator("body").innerText();
    if (/Esta área está sendo construída|Application error|deu errado|Something went wrong|Unhandled Runtime/i.test(corpo)) problemas.push(`${nome}: tela de erro/bloqueio`);
    if (!marca.test(corpo)) problemas.push(`${nome}: não achei a marca ${marca}`);
    if (erros.length > antes) problemas.push(`${nome}: ${erros.slice(antes).join(" | ")}`);
  }
  // o membro não entra no Admin
  await page.goto("/admin", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  if (!/senha|desbloquear|administrador|entrar/i.test(await page.locator("body").innerText())) problemas.push("Admin: membro não foi barrado");
  expect(problemas, problemas.join("\n")).toEqual([]);
});

test("membro vê o tutorial de 4 passos e consegue pular", async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => { try { window.localStorage.removeItem("gv-setup-tutorial-done"); } catch {} });
  await signIn(page, seed.regular.email, seed.regular.password);
  await page.goto("/");
  const dialog = page.getByTestId("setup-tutorial");
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  await expect(dialog).toContainText("passo 1 de 4");
  await dialog.getByRole("button", { name: "Próximo" }).click();
  await expect(dialog).toContainText("passo 2 de 4");
  await dialog.getByRole("button", { name: "Pular" }).click();
  await expect(dialog).toBeHidden();
  // pular guarda que já viu, então não reabre
  expect(await page.evaluate(() => window.localStorage.getItem("gv-setup-tutorial-done"))).toBe("1");
});
