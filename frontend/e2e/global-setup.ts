import { randomUUID } from "crypto";
import { existsSync, readFileSync } from "fs";
import { mkdir, rm, writeFile } from "fs/promises";
import { createServer } from "http";
import path from "path";

import { PrismaClient } from "../src/generated/prisma";
import { hashPassword } from "better-auth/crypto";

/**
 * Base de assinantes de mentira: responde como a função clipgringa-acesso da Gringatools.
 * Quem é assinante ativo fica em e2e/.member-base.json ({ "email": { ativo, motivo, nome } }), que os testes reescrevem.
 */
async function startMemberBase() {
  const statePath = path.join(process.cwd(), "e2e", ".member-base.json");
  const outbox = path.join(process.cwd(), "e2e", ".outbox");
  await rm(outbox, { recursive: true, force: true });
  await mkdir(outbox, { recursive: true });
  await writeFile(statePath, "{}");
  const server = createServer((request, response) => {
    let raw = "";
    request.on("data", (chunk) => { raw += chunk; });
    request.on("end", () => {
      const state = existsSync(statePath) ? (JSON.parse(readFileSync(statePath, "utf8") || "{}") as Record<string, unknown>) : {};
      const emails = ((JSON.parse(raw || "{}") as { emails?: string[] }).emails ?? []);
      const resultados = Object.fromEntries(emails.map((email) => [email, state[email] ?? { ativo: false, motivo: "nao_e_membro" }]));
      // Sem o cabeçalho de assinatura o pedido não veio do servidor do ClipGringa.
      const signed = Boolean(request.headers["x-cg-signature"]);
      response.writeHead(signed ? 200 : 401, { "Content-Type": "application/json" });
      response.end(JSON.stringify(signed ? { ok: true, resultados } : { ok: false, erro: "assinatura" }));
    });
  });
  await new Promise<void>((resolve) => server.listen(Number(process.env.PLAYWRIGHT_MEMBER_BASE_PORT ?? "8197"), "127.0.0.1", resolve));
  return () => new Promise<void>((resolve) => server.close(() => resolve()));
}

export default async function globalSetup() {
  const stopMemberBase = await startMemberBase();
  const prisma = new PrismaClient();
  const now = new Date();
  const regularEmail = "e2e-user@clipgringa.test";
  const adminEmail = "e2e-admin@clipgringa.test";
  const password = "Password123!";

  await prisma.$executeRawUnsafe(`
    DELETE FROM generated_clips
    WHERE task_id IN (
      SELECT tasks.id
      FROM tasks
      INNER JOIN users ON users.id = tasks.user_id
      WHERE users.email IN ('${regularEmail}', '${adminEmail}')
    )
  `);
  await prisma.task.deleteMany({
    where: { user: { email: { in: [regularEmail, adminEmail] } } },
  });
  await prisma.source.deleteMany({
    where: { tasks: { some: { user: { email: { in: [regularEmail, adminEmail] } } } } },
  });
  await prisma.account.deleteMany({
    where: { user: { email: { in: [regularEmail, adminEmail] } } },
  });
  await prisma.session.deleteMany({
    where: { user: { email: { in: [regularEmail, adminEmail] } } },
  });
  await prisma.user.deleteMany({
    where: { email: { in: [regularEmail, adminEmail] } },
  });

  const passwordHash = await hashPassword(password);

  const regularUser = await prisma.user.create({
    data: {
      email: regularEmail,
      name: "E2E User",
      is_admin: false,
      emailVerified: true,
    },
  });
  const adminUser = await prisma.user.create({
    data: {
      email: adminEmail,
      name: "E2E Admin",
      is_admin: true,
      emailVerified: true,
    },
  });

  await prisma.account.createMany({
    data: [regularUser, adminUser].map((user) => ({
      id: randomUUID(),
      accountId: user.id,
      providerId: "credential",
      userId: user.id,
      password: passwordHash,
      createdAt: now,
      updatedAt: now,
    })),
  });

  const completedSource = await prisma.source.create({
    data: {
      type: "youtube",
      title: "Seeded marketing walkthrough",
    },
  });
  const queuedSource = await prisma.source.create({
    data: {
      type: "youtube",
      title: "Queued seed source",
    },
  });

  const completedTask = await prisma.task.create({
    data: {
      user_id: regularUser.id,
      source_id: completedSource.id,
      generated_clips_ids: [],
      status: "completed",
      font_family: "TikTokSans-Regular",
      font_size: 24,
      font_color: "#FFFFFF",
    },
  });
  const queuedTask = await prisma.task.create({
    data: {
      user_id: regularUser.id,
      source_id: queuedSource.id,
      generated_clips_ids: [],
      status: "queued",
      font_family: "TikTokSans-Regular",
      font_size: 24,
      font_color: "#FFFFFF",
    },
  });
  const clipId = randomUUID();
  await prisma.$executeRawUnsafe(
    `
      INSERT INTO generated_clips (
        id, task_id, filename, file_path, start_time, end_time, duration,
        text, relevance_score, reasoning, clip_order, created_at, updated_at
      ) VALUES (
        '${clipId}', '${completedTask.id}', 'seeded-clip.mp4', '/tmp/seeded-clip.mp4',
        '00:00', '00:15', 15, 'This is a seeded clip', 0.99,
        'Seed data for Playwright', 1, NOW(), NOW()
      )
    `,
  );

  await prisma.task.update({
    where: { id: completedTask.id },
    data: {
      generated_clips_ids: [clipId],
    },
  });

  const seedPath = path.join(process.cwd(), "e2e", ".seed.json");
  await mkdir(path.dirname(seedPath), { recursive: true });
  await writeFile(
    seedPath,
    JSON.stringify(
      {
        regular: {
          email: regularEmail,
          password,
        },
        admin: {
          email: adminEmail,
          password,
        },
        completedTaskId: completedTask.id,
        queuedTaskId: queuedTask.id,
        completedSourceTitle: completedSource.title,
      },
      null,
      2,
    ),
  );

  await prisma.$disconnect();
  return stopMemberBase;
}
