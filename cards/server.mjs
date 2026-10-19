// Tiny HTTP wrapper: POST /render {text, button?, aspect?, seconds?} -> video/mp4
import http from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCardHtml, SIZES } from "./template.mjs";

const PORT = Number(process.env.PORT || 8100);
const TOKEN = process.env.CARDS_TOKEN || "";
const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = join(HERE, "node_modules", ".bin", "hyperframes");
const MAX_TEXT = 140;
const MAX_BUTTON = 40;

let chain = Promise.resolve(); // one render at a time: Chrome is memory hungry

function enqueue(job) {
  const run = chain.then(job, job);
  chain = run.catch(() => {});
  return run;
}

function readBody(req, limit = 16 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) { reject(Object.assign(new Error("body too large"), { status: 413 })); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function runCli(dir, output) {
  return new Promise((resolve, reject) => {
    const child = spawn(CLI, ["render", dir, "-o", output, "--quiet"], { stdio: ["ignore", "pipe", "pipe"] });
    let log = "";
    child.stdout.on("data", (d) => { log += d; });
    child.stderr.on("data", (d) => { log += d; });
    const timer = setTimeout(() => child.kill("SIGKILL"), 120_000);
    child.on("close", (code) => {
      clearTimeout(timer);
      code === 0 ? resolve() : reject(new Error(`render failed (${code}): ${log.slice(-600)}`));
    });
    child.on("error", reject);
  });
}

async function renderCard({ text, button, aspect, seconds }) {
  const dir = await mkdtemp(join(tmpdir(), "card-"));
  try {
    await writeFile(join(dir, "index.html"), buildCardHtml({ text, button, aspect, seconds }));
    await writeFile(join(dir, "hyperframes.json"), JSON.stringify({ paths: { blocks: "compositions", components: "compositions/components", assets: "assets" } }));
    await writeFile(join(dir, "meta.json"), JSON.stringify({ id: "card", name: "card" }));
    await mkdir(join(dir, "renders"), { recursive: true });
    const output = join(dir, "renders", "card.mp4");
    await runCli(dir, output);
    return await readFile(output);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function send(res, status, body, type = "application/json") {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/health") return send(res, 200, JSON.stringify({ ok: true }));
    if (req.method !== "POST" || req.url !== "/render") return send(res, 404, JSON.stringify({ error: "not found" }));
    if (TOKEN && req.headers["x-cards-token"] !== TOKEN) return send(res, 401, JSON.stringify({ error: "unauthorized" }));

    let data;
    try { data = JSON.parse(await readBody(req)); } catch { return send(res, 400, JSON.stringify({ error: "invalid json" })); }
    const text = typeof data.text === "string" ? data.text.trim().slice(0, MAX_TEXT) : "";
    const button = typeof data.button === "string" ? data.button.trim().slice(0, MAX_BUTTON) : "";
    const aspect = typeof data.aspect === "string" && SIZES[data.aspect] ? data.aspect : "9:16";
    const seconds = Math.min(6, Math.max(2, Number(data.seconds) || 3));
    if (!text) return send(res, 400, JSON.stringify({ error: "text is required" }));

    const video = await enqueue(() => renderCard({ text, button, aspect, seconds }));
    send(res, 200, video, "video/mp4");
  } catch (error) {
    console.error(error);
    send(res, error.status || 500, JSON.stringify({ error: "render failed" }));
  }
});

server.listen(PORT, "0.0.0.0", () => console.log(`cards service on :${PORT}`));
