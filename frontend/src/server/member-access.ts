import prisma from "@/lib/prisma";
import { fetchBackend } from "@/server/backend-api";

/**
 * Conta que entrou como assinante da Gringatools e está sem assinatura ativa (cancelou, pediu reembolso ou venceu).
 * Administrador, conta convidada e cadastro liberado pelo administrador nunca caem aqui.
 * Se a tabela ainda não existe, ninguém está bloqueado.
 */
export async function isMemberInactive(userId: string): Promise<boolean> {
  try {
    const rows = await prisma.$queryRaw<{ blocked: boolean }[]>`
      SELECT TRUE AS blocked
      FROM users u JOIN member_access m ON m.email = lower(u.email)
      WHERE u.id = ${userId} AND m.active = FALSE AND m.exempt = FALSE AND u.is_admin = FALSE
        AND NOT EXISTS (SELECT 1 FROM signup_requests r WHERE r.user_id = u.id AND r.status = 'approved')
      LIMIT 1`;
    return rows.length > 0;
  } catch {
    return false;
  }
}

/** Primeiro nome que a base da Gringatools informou para este e-mail (para a conta nova não nascer sem nome). */
export async function memberNameFor(email: string): Promise<string | null> {
  try {
    const rows = await prisma.$queryRaw<{ member_name: string | null }[]>`SELECT member_name FROM member_access WHERE email = ${email.trim().toLowerCase()}`;
    return rows[0]?.member_name?.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Pede ao servidor para mandar o link de entrada. É o servidor que decide se o e-mail recebe:
 * conta que já existe e pode entrar, ou assinante ativo da Gringatools (a conta nasce no primeiro acesso).
 */
export async function requestLoginLinkEmail(email: string, url: string): Promise<void> {
  const response = await fetchBackend("/access/login-link", {
    method: "POST",
    userId: "site",
    extraHeaders: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, url }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Backend login link failed with ${response.status}: ${(await response.text().catch(() => "")).slice(0, 200)}`);
}

/** O administrador mantém (ou deixa de manter) o acesso de uma conta de assinante mesmo sem assinatura ativa. */
export async function setMemberExempt(userId: string, exempt: boolean): Promise<boolean> {
  const changed = await prisma.$executeRaw`
    UPDATE member_access m SET exempt = ${exempt}
    FROM users u WHERE u.id = ${userId} AND m.email = lower(u.email)`;
  // Deixou de manter e a assinatura não está ativa: a pessoa não fica com sessão aberta.
  if (changed > 0 && !exempt && (await isMemberInactive(userId))) await prisma.$executeRaw`DELETE FROM session WHERE "userId" = ${userId}`.catch(() => undefined);
  return changed > 0;
}
