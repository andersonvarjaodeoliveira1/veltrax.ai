import prisma from "@/lib/prisma";

/** Diz se a conta ainda não pode entrar. Se a tabela ainda não existe, ninguém está aguardando. */
export async function isAccessPending(userId: string): Promise<boolean> {
  try {
    const rows = await prisma.$queryRaw<{ status: string }[]>`SELECT status FROM signup_requests WHERE user_id = ${userId}`;
    return Boolean(rows[0] && rows[0].status !== "approved");
  } catch {
    return false;
  }
}
