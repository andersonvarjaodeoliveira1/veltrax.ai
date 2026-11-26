import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { prismaAdapter } from "better-auth/adapters/prisma";
import prisma from "@/lib/prisma";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins";
import { getAuthTrustedOrigins } from "@/lib/auth-origins";
import { prepareAccountDeletion } from "@/server/account-deletion";
import { INACTIVE_MEMBER_CODE, LOGIN_LINK_MINUTES } from "@/lib/acesso";
import { PENDING_ACCESS_CODE } from "@/lib/cadastro";
import { fetchBackend } from "@/server/backend-api";
import { isMemberInactive, memberNameFor, requestLoginLinkEmail } from "@/server/member-access";
import { isAccessPending } from "@/server/signup-access";

// O cadastro direto pela API de autenticação fica sempre fechado: conta nova só nasce pela captura
// (/api/cadastro, com nome, e-mail, CPF e telefone, aguardando liberação) ou por convite do administrador.
const disableSignUp = true;

async function sendPasswordResetEmail(userId: string, url: string) {
  const response = await fetchBackend("/account/password-reset-email", {
    method: "POST",
    userId,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `Backend password reset email failed with ${response.status}: ${detail || "unknown error"}`
    );
  }
}

const trustedOrigins = getAuthTrustedOrigins({
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
  BETTER_AUTH_TRUSTED_ORIGINS: process.env.BETTER_AUTH_TRUSTED_ORIGINS,
  NEXT_PUBLIC_SELF_HOST: process.env.NEXT_PUBLIC_SELF_HOST,
});

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  databaseHooks: {
    user: {
      create: {
        // Conta que nasce pelo link de entrada chega sem nome: usa o que a base da Gringatools informou, ou o começo do e-mail.
        before: async (user) => {
          if (user.name?.trim()) return;
          const name = (await memberNameFor(user.email)) || user.email.split("@")[0].replace(/[._-]+/g, " ").trim() || "Membro";
          return { data: { ...user, name } };
        },
      },
    },
    session: {
      create: {
        // Conta de teste vencida: não deixa entrar de novo (o servidor também encerra as sessões que já existiam).
        before: async (session) => {
          const rows = await prisma.$queryRaw<{ expired: boolean }[]>`
            SELECT (test_expires_at IS NOT NULL AND test_expires_at < NOW() AND is_admin = FALSE) AS expired FROM users WHERE id = ${session.userId}`;
          if (rows[0]?.expired) throw new APIError("FORBIDDEN", { message: "O seu acesso de teste terminou. Fale com a equipe para continuar." });
          // Conta criada pela captura do cadastro: só entra depois que o administrador libera.
          if (await isAccessPending(session.userId)) throw new APIError("FORBIDDEN", { message: `${PENDING_ACCESS_CODE}: o seu cadastro está aguardando a liberação do suporte.` });
          // Conta que entrou como assinante da Gringatools: sem assinatura ativa, não entra.
          if (await isMemberInactive(session.userId)) throw new APIError("FORBIDDEN", { message: `${INACTIVE_MEMBER_CODE}: não encontramos uma assinatura ativa da Gringatools neste e-mail.` });
        },
      },
    },
  },
  user: {
    // Single-account install: nobody may delete the account through the API.
    deleteUser: {
      enabled: false,
      beforeDelete: async (user) => {
        await prepareAccountDeletion(user.id);
      },
    },
    additionalFields: {
      is_admin: {
        type: "boolean",
        input: false,
      },
    },
  },
  trustedOrigins,
  // Brute-force protection: strict per-IP limits on every credential endpoint.
  rateLimit: {
    enabled: true,
    window: 60,
    max: 60,
    storage: "memory",
    customRules: {
      // Ler a própria sessão não é tentativa de senha. O limite geral (60 por minuto, e a contagem só zera depois de
      // 1 minuto sem nenhum pedido) pegava quem usava o app sem parar: cada tela aberta e cada volta para a aba
      // consulta a sessão; ao estourar, o menu sumia e a pessoa parecia ter saído da conta.
      "/get-session": false,
      "/sign-in/email": { window: 300, max: 5 },
      "/sign-in/*": { window: 300, max: 10 },
      "/sign-up/*": { window: 3600, max: 3 },
      "/forget-password": { window: 3600, max: 3 },
      "/request-password-reset": { window: 3600, max: 3 },
      "/reset-password": { window: 3600, max: 5 },
      "/change-password": { window: 3600, max: 5 },
      "/change-email": { window: 3600, max: 3 },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    cookieCache: { enabled: false },
  },
  advanced: {
    useSecureCookies: process.env.NODE_ENV === "production",
    ipAddress: { ipAddressHeaders: ["x-forwarded-for", "x-real-ip"] },
    defaultCookieAttributes: { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" },
  },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
    maxPasswordLength: 128,
    disableSignUp,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      // Not awaited so response timing doesn't reveal whether an account exists.
      void sendPasswordResetEmail(user.id, url).catch((error) => {
        console.error("Failed to send password reset email", error);
      });
    },
  },
  plugins: [
    // Entrada sem senha: a pessoa digita o e-mail e recebe um link. O link leva para uma tela com um botão
    // (/entrar/confirmar), porque alguns provedores de e-mail abrem os links sozinhos para conferir e gastariam o link.
    magicLink({
      expiresIn: LOGIN_LINK_MINUTES * 60,
      storeToken: "hashed",
      rateLimit: { window: 60, max: 5 },
      sendMagicLink: async ({ email, token }, ctx) => {
        const origin = new URL(ctx?.context.baseURL || process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3107").origin;
        const url = `${origin}/entrar/confirmar?token=${encodeURIComponent(token)}`;
        // Sem esperar: o tempo da resposta não revela se o e-mail tem conta ou assinatura.
        void requestLoginLinkEmail(email, url).catch((error) => {
          console.error("Failed to send login link email", error);
        });
      },
    }),
    nextCookies(), // Enable Next.js cookie handling (tem de ser o último)
  ],
});

export type Session = typeof auth.$Infer.Session;
