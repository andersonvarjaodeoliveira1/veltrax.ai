// Conferência de assinatura para o ClipGringa (ferramenta bônus do assinante da Gringatools).
//
// Quem chama é só o servidor do ClipGringa. Cada pedido vem assinado (Ed25519); a chave pública fica publicada
// pelo próprio servidor do ClipGringa, então não existe segredo compartilhado para guardar ou vazar.
// A resposta diz apenas, para os e-mails pedidos, se a assinatura está ativa (regra em public.clipgringa_acesso,
// a mesma do login da extensão) e o motivo quando não está. Não grava nada.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const KEY_URL = Deno.env.get("CLIPGRINGA_KEY_URL") ?? "https://api.clipgringa.gringatools.com/access/public-key";
const MAX_SKEW_SECONDS = 300;
const MAX_EMAILS = 200;
const KEY_TTL_MS = 10 * 60 * 1000;
const KEY_RETRY_MS = 60 * 1000;

let cached: { key: CryptoKey; at: number } | null = null;
let lastFetch = 0;

function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}

async function publicKey(refresh = false): Promise<CryptoKey | null> {
  const now = Date.now();
  if (cached && !refresh && now - cached.at < KEY_TTL_MS) return cached.key;
  // Assinatura que não confere pode ser chave trocada: busca de novo, mas no máximo uma vez por minuto.
  if (refresh && now - lastFetch < KEY_RETRY_MS) return null;
  lastFetch = now;
  try {
    const response = await fetch(KEY_URL, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(8000) });
    if (!response.ok) return cached?.key ?? null;
    const data = await response.json();
    if (data?.alg !== "Ed25519" || typeof data?.public_key !== "string") return cached?.key ?? null;
    const key = await crypto.subtle.importKey("raw", fromBase64(data.public_key), { name: "Ed25519" }, false, ["verify"]);
    cached = { key, at: now };
    return key;
  } catch {
    return cached?.key ?? null;
  }
}

async function signedBy(signature: Uint8Array, body: Uint8Array): Promise<boolean> {
  let key = await publicKey();
  if (key && await crypto.subtle.verify({ name: "Ed25519" }, key, signature, body)) return true;
  key = await publicKey(true);
  return Boolean(key && await crypto.subtle.verify({ name: "Ed25519" }, key, signature, body));
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ ok: false, erro: "metodo" }, 405);

  const raw = new Uint8Array(await req.arrayBuffer());
  if (raw.length === 0 || raw.length > 20000) return json({ ok: false, erro: "tamanho" }, 413);

  let signature: Uint8Array;
  try {
    signature = fromBase64(req.headers.get("x-cg-signature") ?? "");
  } catch {
    return json({ ok: false, erro: "assinatura" }, 401);
  }
  if (signature.length !== 64 || !(await signedBy(signature, raw))) return json({ ok: false, erro: "assinatura" }, 401);

  let body: { emails?: unknown; ts?: unknown };
  try {
    body = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    return json({ ok: false, erro: "corpo" }, 400);
  }
  const ts = Number(body.ts);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > MAX_SKEW_SECONDS) return json({ ok: false, erro: "horario" }, 401);
  if (!Array.isArray(body.emails) || body.emails.length === 0 || body.emails.length > MAX_EMAILS) return json({ ok: false, erro: "emails" }, 400);
  const emails = body.emails.filter((e): e is string => typeof e === "string" && e.length <= 254);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data, error } = await supabase.rpc("clipgringa_acesso_lote", { p_emails: emails });
  if (error) {
    console.error("clipgringa_acesso_lote falhou:", error.message);
    return json({ ok: false, erro: "consulta" }, 500);
  }
  return json({ ok: true, resultados: data ?? {} });
});
