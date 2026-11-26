import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { cleanSignup, validateSignup, type SignupField, type SignupInput } from "@/lib/cadastro";
import { fetchBackend } from "@/server/backend-api";

export type SignupResult =
  | { ok: true }
  | { ok: false; error: "invalid"; fields: Partial<Record<SignupField, string>> }
  | { ok: false; error: "email_exists" | "cpf_exists" };

export type SignupRequestRow = {
  user_id: string; name: string; email: string; cpf: string; phone: string;
  status: "pending" | "approved" | "declined"; created_at: Date; decided_at: Date | null;
};

async function sendEmail(userId: string, event: "requested" | "approved") {
  const response = await fetchBackend("/account/signup-request-email", {
    method: "POST",
    userId,
    extraHeaders: { "Content-Type": "application/json" },
    body: JSON.stringify({ event }),
    cache: "no-store",
  });
  return response.ok;
}

/**
 * Captura do cadastro: sem nome, e-mail, CPF, telefone e senha válidos a conta não é criada.
 * A conta nasce aguardando liberação: o pedido é gravado ANTES da senha, então não existe
 * um instante em que a pessoa consiga entrar sem o administrador ter liberado.
 */
export async function createSignupRequest(raw: Partial<Record<SignupField, unknown>>): Promise<SignupResult> {
  const fields = validateSignup(raw);
  if (Object.keys(fields).length > 0) return { ok: false, error: "invalid", fields };
  const input = cleanSignup(raw as SignupInput);

  const ctx = await auth.$context;
  if (await ctx.internalAdapter.findUserByEmail(input.email)) return { ok: false, error: "email_exists" };
  const sameCpf = await prisma.$queryRaw<{ user_id: string }[]>`SELECT user_id FROM signup_requests WHERE cpf = ${input.cpf} LIMIT 1`;
  if (sameCpf.length > 0) return { ok: false, error: "cpf_exists" };

  const user = await ctx.internalAdapter.createUser({ email: input.email, name: input.name, emailVerified: false });
  try {
    await prisma.$executeRaw`
      INSERT INTO signup_requests (user_id, name, email, cpf, phone, status)
      VALUES (${user.id}, ${input.name}, ${input.email}, ${input.cpf}, ${input.phone}, 'pending')`;
    const password = await ctx.password.hash(input.password);
    await ctx.internalAdapter.linkAccount({ userId: user.id, providerId: "credential", accountId: user.id, password });
  } catch (error) {
    await ctx.internalAdapter.deleteUser(user.id).catch(() => undefined);
    // Dois envios ao mesmo tempo com o mesmo CPF: o índice único recusa o segundo.
    if (String((error as { message?: string })?.message ?? error).includes("uq_signup_requests_cpf")) return { ok: false, error: "cpf_exists" };
    throw error;
  }

  // O aviso ao administrador não segura a resposta: os dados já estão no Admin.
  void sendEmail(user.id, "requested").catch(() => false);
  return { ok: true };
}

export async function listSignupRequests(): Promise<SignupRequestRow[]> {
  return prisma.$queryRaw<SignupRequestRow[]>`
    SELECT user_id, name, email, cpf, phone, status, created_at, decided_at
    FROM signup_requests
    ORDER BY (status = 'pending') DESC, created_at DESC
    LIMIT 500`;
}

/** Libera ou recusa um cadastro. Ao liberar, a pessoa recebe o e-mail avisando que já pode entrar. */
export async function decideSignupRequest(userId: string, action: "approve" | "decline"): Promise<{ ok: boolean; emailSent?: boolean }> {
  const status = action === "approve" ? "approved" : "declined";
  const changed = await prisma.$executeRaw`
    UPDATE signup_requests SET status = ${status}, decided_at = NOW() WHERE user_id = ${userId} AND status <> ${status}`;
  if (changed === 0) {
    const exists = await prisma.$queryRaw<{ user_id: string }[]>`SELECT user_id FROM signup_requests WHERE user_id = ${userId}`;
    return { ok: exists.length > 0 };
  }
  if (action === "decline") {
    // Quem foi recusado não fica com sessão aberta (não deveria existir nenhuma, mas garante).
    await prisma.$executeRaw`DELETE FROM session WHERE "userId" = ${userId}`.catch(() => undefined);
    return { ok: true };
  }
  return { ok: true, emailSent: await sendEmail(userId, "approved").catch(() => false) };
}

export type RegisteredUserRow = {
  user_id: string; name: string; email: string; is_admin: boolean; created_at: Date;
  cpf: string | null; phone: string | null;
  /** invited = conta criada por convite do administrador, sem passar pela captura. */
  status: "pending" | "approved" | "declined" | "invited" | "member" | "member_inactive" | "member_kept";
  /** Só para quem entrou como assinante da Gringatools: por que a assinatura não está ativa. */
  member_reason: string | null;
  decided_at: Date | null; last_seen: Date | null;
  flow_connected: boolean; apis: number; tokens_granted: number | null; tasks: number;
};

/** Todas as contas, da mais nova para a mais antiga, com os dados da captura e o que cada uma já conectou. */
export async function listRegisteredUsers(): Promise<RegisteredUserRow[]> {
  return prisma.$queryRaw<RegisteredUserRow[]>`
    SELECT u.id AS user_id, COALESCE(r.name, u.name) AS name, u.email, u.is_admin, u."createdAt" AS created_at,
           r.cpf, r.phone,
           -- member* = entrou como assinante da Gringatools (link por e-mail); a assinatura é conferida de tempos em tempos.
           CASE WHEN r.status IS NOT NULL THEN r.status
                WHEN m.email IS NULL OR u.is_admin THEN 'invited'
                WHEN m.exempt THEN 'member_kept'
                WHEN m.active THEN 'member'
                ELSE 'member_inactive' END AS status,
           CASE WHEN r.status IS NULL AND m.email IS NOT NULL AND NOT m.active THEN m.reason END AS member_reason,
           r.decided_at,
           -- Último sinal de uso da própria pessoa: sessão, extensão avisando do Flow, vídeo enviado, imagem ou cena criada.
           -- Erros do servidor registrados na conta não contam como acesso.
           GREATEST(
             (SELECT MAX(s."updatedAt") FROM session s WHERE s."userId" = u.id)::timestamptz,
             (SELECT MAX(a.created_at) FROM activity_events a WHERE a.user_id = u.id AND a.kind IN ('imagem', 'cena')),
             (SELECT MAX(t.created_at) FROM tasks t WHERE t.user_id = u.id),
             f.checked_at
           ) AS last_seen,
           COALESCE(f.connected, false) AS flow_connected,
           (SELECT COUNT(*)::int FROM user_integrations i WHERE i.user_id = u.id) AS apis,
           q.granted::float8 AS tokens_granted,
           (SELECT COUNT(*)::int FROM tasks t WHERE t.user_id = u.id) AS tasks
    FROM users u
    LEFT JOIN signup_requests r ON r.user_id = u.id
    LEFT JOIN member_access m ON m.email = lower(u.email)
    LEFT JOIN flow_connection f ON f.user_id = u.id
    LEFT JOIN user_token_quota q ON q.user_id = u.id
    ORDER BY u."createdAt" DESC
    LIMIT 2000`;
}
