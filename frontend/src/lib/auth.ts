import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import prisma from "@/lib/prisma";
import { nextCookies } from "better-auth/next-js";
import { getAuthTrustedOrigins } from "@/lib/auth-origins";
import { prepareAccountDeletion } from "@/server/account-deletion";
import { fetchBackend } from "@/server/backend-api";

const disableSignUp = ["1", "true", "yes"].includes(
  (process.env.DISABLE_SIGN_UP ?? "").toLowerCase()
);

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
    nextCookies(), // Enable Next.js cookie handling
  ],
});

export type Session = typeof auth.$Infer.Session;
