import { randomBytes } from "node:crypto";
import { generateId } from "better-auth";
import { auth } from "@/lib/auth";
import { fetchBackend } from "@/server/backend-api";

// O convite só deixa de valer quando a pessoa escolhe a senha (o link é apagado ao usar). Na prática, não expira.
const INVITE_DAYS = 3650;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type InviteResult =
  | { ok: true; userId: string; created: boolean; emailSent: true }
  | { ok: false; error: "invalid_email" | "email_failed"; userId?: string; created?: boolean; detail?: string };

/**
 * Libera o acesso de um membro: cria o usuário (se ainda não existe) com uma senha que ninguém conhece
 * e manda um e-mail com o link para a própria pessoa escolher a senha. Pode ser repetido para reenviar o convite.
 */
export async function inviteMember(rawEmail: string): Promise<InviteResult> {
  const email = rawEmail.trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) return { ok: false, error: "invalid_email" };

  const ctx = await auth.$context;
  const existing = await ctx.internalAdapter.findUserByEmail(email);
  let userId = existing?.user.id;
  let created = false;

  if (!userId) {
    const name = email.split("@")[0].replace(/[._-]+/g, " ").trim() || "Membro";
    const user = await ctx.internalAdapter.createUser({ email, name, emailVerified: true });
    userId = user.id;
    created = true;
    // Senha aleatória que ninguém conhece: a pessoa define a dela pelo link do e-mail.
    const password = await ctx.password.hash(randomBytes(32).toString("hex"));
    await ctx.internalAdapter.linkAccount({ userId, providerId: "credential", accountId: userId, password });
  }

  const token = generateId(24);
  await ctx.internalAdapter.createVerificationValue({
    value: userId,
    identifier: `reset-password:${token}`,
    expiresAt: new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000),
  });
  const url = `${ctx.baseURL}/reset-password/${token}?callbackURL=${encodeURIComponent("/reset-password")}`;

  const response = await fetchBackend("/account/password-reset-email", {
    method: "POST",
    userId,
    extraHeaders: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, invite: true }),
    cache: "no-store",
  });
  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 200);
    return { ok: false, error: "email_failed", userId, created, detail };
  }
  return { ok: true, userId, created, emailSent: true };
}
