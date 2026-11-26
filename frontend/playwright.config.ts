import path from "path";

import { defineConfig } from "@playwright/test";

const databaseUrl =
  process.env.DATABASE_URL ?? "postgresql://clipgringa:clipgringa_password@127.0.0.1:5432/clipgringa";
const backendDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  (databaseUrl.startsWith("postgresql+asyncpg://")
    ? databaseUrl
    : databaseUrl.replace("postgresql://", "postgresql+asyncpg://"));
const backendAuthSecret = process.env.BACKEND_AUTH_SECRET ?? "clipgringa_test_secret";
const frontendPort = process.env.PLAYWRIGHT_FRONTEND_PORT ?? "3100";
const backendPort = process.env.PLAYWRIGHT_BACKEND_PORT ?? "8100";
// Base de assinantes de mentira (sobe no global-setup) e caixa de saída em arquivo: nenhum e-mail sai de verdade.
export const memberBasePort = process.env.PLAYWRIGHT_MEMBER_BASE_PORT ?? "8197";
export const outboxDir = path.join(process.cwd(), "e2e", ".outbox");
const frontendBaseUrl = `http://127.0.0.1:${frontendPort}`;
const backendBaseUrl = `http://127.0.0.1:${backendPort}`;

export default defineConfig({
  testDir: "./e2e",
  // Rodam o smoke e as telas de hoje. Os arquivos abaixo descrevem telas antigas, em inglês (editor de cortes,
  // convites de plano, processamento real com link do YouTube), e ficam parados até serem reescritos.
  testIgnore: ["polish.spec.ts", "editor-studio.spec.ts", "local-workflow.spec.ts", "upgrade-prompts.spec.ts"],
  fullyParallel: false,
  // Um arquivo por vez: as contas de teste entram com senha uma única vez por rodada (helpers.ts guarda a sessão),
  // e o site limita a 5 entradas com senha a cada 5 minutos por endereço. Com dois processos, cada um entra de novo
  // e a rodada estoura o limite conforme a divisão dos arquivos (foi o que derrubou o CI em 26/11).
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? frontendBaseUrl,
    // O site recusa navegador sem cabeça (proteção contra cópia); os testes se apresentam como um Chrome comum.
    userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      // O site bloqueia a conta depois de dois avisos de "navegador automatizado" (proteção contra cópia), e é isso
      // que um navegador de teste é. Aqui ele se apresenta como um Chrome comum, senão a conta de teste é bloqueada
      // no meio da rodada. A proteção em si é conferida em security-watch.test.tsx.
      args: ["--disable-blink-features=AutomationControlled"],
    },
  },
  webServer: [
    {
      command: `cd ../backend && .venv/bin/uvicorn src.main:app --host 127.0.0.1 --port ${backendPort}`,
      url: `${backendBaseUrl}/health`,
      reuseExistingServer: !process.env.CI,
      env: {
        ...process.env,
        DATABASE_URL: backendDatabaseUrl,
        REDIS_HOST: process.env.REDIS_HOST ?? "127.0.0.1",
        REDIS_PORT: process.env.REDIS_PORT ?? "6379",
        SELF_HOST: "true",
        BACKEND_AUTH_SECRET: backendAuthSecret,
        TEMP_DIR: process.env.TEMP_DIR ?? "temp",
        EMAIL_OUTBOX_DIR: outboxDir,
        MEMBER_CHECK_URL: `http://127.0.0.1:${memberBasePort}/`,
        LOGIN_LINK_MIN_GAP_SECONDS: "0",
      },
    },
    {
      // No CI o site roda como em produção (build + start). O servidor de desenvolvimento compila cada tela na
      // hora em que ela é aberta e, no executor do GitHub, travou duas vezes em 16/11 ao compilar /sign-in.
      command: process.env.CI
        ? `pnpm exec next build && pnpm exec next start --hostname 127.0.0.1 --port ${frontendPort}`
        : `pnpm exec next dev --hostname 127.0.0.1 --port ${frontendPort}`,
      url: frontendBaseUrl,
      timeout: process.env.CI ? 420_000 : 120_000,
      reuseExistingServer: !process.env.CI,
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        NEXT_PUBLIC_APP_URL: frontendBaseUrl,
        BETTER_AUTH_URL: frontendBaseUrl,
        NEXT_PUBLIC_API_URL: backendBaseUrl,
        BACKEND_INTERNAL_URL: backendBaseUrl,
        BACKEND_AUTH_SECRET: backendAuthSecret,
        NEXT_PUBLIC_SELF_HOST: "true",
        BETTER_AUTH_SECRET:
          process.env.BETTER_AUTH_SECRET ?? "clipgringa_better_auth_test_secret",
      },
    },
  ],
});
